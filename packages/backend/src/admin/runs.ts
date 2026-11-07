// Runs view: task timeline, queue backlog, source lag, error classes, process
// heartbeats, and the receipts and deliveries whose outcome needs an operator (resolved in
// operations/recover.ts and notify/deliver.ts).
import type { AdminRuns, BeforeJson } from "@aihot/contracts/admin";
import { sql } from "../db.ts";
import { utcDayStart } from "../operations/stale-work.ts";
import type { Heartbeat } from "../operations/heartbeat.ts";
import { audit } from "../audit.ts";
import { failureGroupSql, requeueFailed, queueProcessing } from "../jobs/content.ts";
import { getBoss } from "../jobs/queue.ts";
import { groupingOverview, waitingSelectedNews } from "../operations/grouping.ts";
import { serverModules } from "../modules.ts";

const STALE_HEARTBEAT_MS = 3 * 60_000;

type Runs = BeforeJson<AdminRuns>;

type RoutingRow = {
  kind: 'total' | 'provider' | 'stage';
  name: string;
  attempts: number;
  successful: number;
  failed: number;
  unknown: number;
  pending: number;
  fallback_success: number;
  p95_ms: number | null;
};

/** Routing metrics are derived from real live request attempts; existing untagged receipts are excluded. */
export async function routingEffectOverview(): Promise<NonNullable<Runs['routingEffect']>> {
  const rows = await sql<RoutingRow[]>`
    WITH tagged AS (
      SELECT
        r.request->'routing'->>'stage' AS stage,
        a.service AS provider,
        a.status,
        a.latency_ms,
        r.request->'routing'->>'fallbackFrom' AS fallback_from
      FROM receipt_attempts a
      JOIN receipts r ON r.id = a.receipt_id
      WHERE a.origin = 'live' AND a.started_at >= ${utcDayStart()}
        AND jsonb_typeof(r.request->'routing') = 'object'
        AND r.request->'routing'->>'stage' IS NOT NULL
    )
    SELECT
      CASE WHEN GROUPING(stage) = 0 THEN 'stage'
           WHEN GROUPING(provider) = 0 THEN 'provider' ELSE 'total' END AS kind,
      CASE WHEN GROUPING(stage) = 0 THEN stage
           WHEN GROUPING(provider) = 0 THEN provider ELSE 'all' END AS name,
      count(*)::int AS attempts,
      count(*) FILTER (WHERE status = 'received')::int AS successful,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      count(*) FILTER (WHERE status = 'unknown')::int AS unknown,
      count(*) FILTER (WHERE status = 'pending')::int AS pending,
      count(*) FILTER (WHERE status = 'received' AND fallback_from IS NOT NULL)::int AS fallback_success,
      percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms)
        FILTER (WHERE status = 'received' AND latency_ms IS NOT NULL) AS p95_ms
    FROM tagged
    GROUP BY GROUPING SETS ((), (stage), (provider))
  `;
  return summarizeRoutingRows(rows);
}

/** Pure aggregation: preserve zeros and no-data explicitly without inventing observations. */
export function summarizeRoutingRows(rows: RoutingRow[]): NonNullable<Runs['routingEffect']> {
  const overall = rows.find(row => row.kind === 'total');
  return {
    period: 'utc-day',
    attempts: overall?.attempts ?? 0,
    successful: overall?.successful ?? 0,
    failed: overall?.failed ?? 0,
    unknown: overall?.unknown ?? 0,
    pending: overall?.pending ?? 0,
    fallbackSuccess: overall?.fallback_success ?? 0,
    p95Ms: overall?.p95_ms ?? null,
    providers: rows.filter(row => row.kind === 'provider').map(row => ({
      provider: row.name, attempts: row.attempts, successful: row.successful,
      failed: row.failed, unknown: row.unknown,
    })).sort((a, b) => b.attempts - a.attempts),
    stages: rows.filter(row => row.kind === 'stage').map(row => ({
      stage: row.name, attempts: row.attempts, successful: row.successful,
      failed: row.failed, unknown: row.unknown, fallbackSuccess: row.fallback_success, p95Ms: row.p95_ms,
    })).sort((a, b) => b.attempts - a.attempts),
  };
}

/** UTC-day new-news funnel; backfills and signal-only records cannot obscure current reliability. */
export async function livePipelineOverview(): Promise<Runs["live24h"]> {
  const [row] = await sql<Runs["live24h"][]>`
    SELECT count(*)::int AS discovered,
      count(*) FILTER (WHERE a.processing_state = 'analyzed')::int AS analyzed,
      count(*) FILTER (WHERE a.grouping_status = 'complete')::int AS grouped,
      count(*) FILTER (WHERE a.processing_state = 'new')::int AS waiting,
      count(*) FILTER (WHERE a.processing_state = 'failed')::int AS failed,
      count(*) FILTER (WHERE a.processing_state = 'blocked')::int AS filtered,
      count(*) FILTER (WHERE a.processing_state = 'new'
        AND a.discovered_at < now() - interval '15 minutes')::int AS stalled,
      max(a.discovered_at) AS "newestAt"
    FROM articles a JOIN sources s ON s.id = a.source_id
    WHERE a.discovered_at >= ${utcDayStart()}
      AND a.discovered_at <= now()
      AND NOT a.backfill AND s.participation_mode = 'editorial'`;
  return row ?? { discovered: 0, analyzed: 0, grouped: 0, waiting: 0, failed: 0, filtered: 0, stalled: 0, newestAt: null };
}

/** Currently unresolved editorial articles first discovered before the last 24-hour window. */
export async function legacyUnresolvedOverview(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM articles a JOIN sources s ON s.id = a.source_id
    WHERE a.discovered_at <= now() - interval '24 hours'
      AND a.processing_state IN ('new', 'failed')
      AND NOT a.backfill AND s.participation_mode = 'editorial'`;
  return row?.n ?? 0;
}


/** Exactly one current unfinished stage per news item, across analysis and selected-event grouping. */
export async function currentNewsQueueItems(): Promise<NonNullable<Runs["currentNewsItems"]>> {
  return sql<NonNullable<Runs["currentNewsItems"]>>`
    SELECT a.id, a.title, a.discovered_at AS "discoveredAt",
      CASE WHEN a.processing_state = 'analyzed' THEN NULL ELSE a.processing_retry_at END AS "retryAt",
      a.processing_attempts AS attempts,
      left(CASE WHEN a.processing_state = 'analyzed' THEN a.grouping_error ELSE a.processing_error END, 2000) AS error,
      j.name AS "jobName", j.state AS "jobState", j.created_on AS "queuedAt", j.started_on AS "startedAt",
      receipt.id AS "unverifiedReceiptId", receipt.status AS "receiptStatus",
      latest_model.service AS provider, latest_model.model,
      CASE WHEN a.processing_state = 'analyzed'
         THEN CASE WHEN a.grouping_status = 'failed' AND (a.discovered_at >= ${utcDayStart()} OR EXISTS (
                      SELECT 1 FROM pgboss.job failure WHERE failure.data->>'articleId' = a.id
                        AND failure.name = 'events.group' AND failure.state = 'failed'
                        AND failure.completed_on >= ${utcDayStart()}
                    )) THEN 'failed'
                   WHEN j.state = 'active' THEN 'processing' ELSE 'pending' END
         WHEN a.processing_state = 'failed' AND (a.discovered_at >= ${utcDayStart()} OR (a.updated_at >= ${utcDayStart()} AND EXISTS (
            SELECT 1 FROM publications p WHERE p.article_id = a.id
          )) OR EXISTS (
            SELECT 1 FROM pgboss.job failure WHERE failure.data->>'articleId' = a.id
              AND failure.name IN ('content.analyze', 'content.extract-body')
              AND failure.state = 'failed' AND failure.completed_on >= ${utcDayStart()}
          ) OR EXISTS (
            SELECT 1 FROM receipts failure WHERE substring(failure.subject from '^article:([^@:#]+)') = a.id
              AND failure.status = 'failed' AND failure.updated_at >= ${utcDayStart()}
          )) THEN 'failed'
         WHEN j.state = 'active' THEN 'processing' ELSE 'pending' END AS status,
      CASE WHEN a.processing_state = 'analyzed' THEN '事件归组'
           WHEN j.name = 'content.extract-body' OR (j.name IS NULL AND a.body_status = 'pending') THEN '正文提取'
           ELSE '新闻统一分析' END AS stage
    FROM articles a JOIN sources s ON s.id = a.source_id
    LEFT JOIN LATERAL (
      SELECT job.name, job.state, job.created_on, job.started_on
      FROM pgboss.job job
      WHERE job.data->>'articleId' = a.id AND job.state IN ('created', 'retry', 'active')
        AND ((a.processing_state = 'analyzed' AND job.name = 'events.group')
          OR (a.processing_state IN ('new', 'failed') AND job.name IN ('content.analyze', 'content.extract-body')))
      ORDER BY (job.state = 'active') DESC, job.created_on DESC LIMIT 1
    ) j ON true
    LEFT JOIN LATERAL (
      SELECT r.id, r.status FROM receipts r
      WHERE r.status IN ('pending', 'unknown')
        AND ((a.processing_state = 'analyzed' AND r.id = a.grouping_receipt_id)
          OR (a.processing_state <> 'analyzed' AND substring(r.subject from '^article:([^@:#]+)') = a.id))
      ORDER BY r.id DESC LIMIT 1
    ) receipt ON true
    LEFT JOIN LATERAL (
      SELECT r.service, r.model FROM receipts r
      WHERE substring(r.subject from '^article:([^@:#]+)') = a.id AND r.model IS NOT NULL
        AND ((a.processing_state = 'analyzed' AND r.purpose IN ('group_article','group_review','group_signal'))
          OR (a.processing_state <> 'analyzed' AND r.purpose IN
            ('analyze_article','understand_article','summarize_article','prefilter_article','score_article','structure_article','mend_wording')))
      ORDER BY r.updated_at DESC, r.id DESC LIMIT 1
    ) latest_model ON true
    WHERE (
        (a.processing_state IN ('new', 'failed') AND ((a.discovered_at >= ${utcDayStart()} OR (a.updated_at >= ${utcDayStart()} AND EXISTS (SELECT 1 FROM publications p WHERE p.article_id = a.id))) OR EXISTS (
          SELECT 1 FROM receipts failure WHERE substring(failure.subject from '^article:([^@:#]+)') = a.id
            AND failure.status = 'failed' AND failure.updated_at >= ${utcDayStart()}
        ) OR EXISTS (
          SELECT 1 FROM pgboss.job failure WHERE failure.data->>'articleId' = a.id
            AND failure.state = 'failed' AND failure.completed_on >= ${utcDayStart()}
        )))
        OR (a.processing_state = 'analyzed' AND a.grouping_status IN ('pending', 'failed')
          AND EXISTS (
            SELECT 1 FROM publications p
            LEFT JOIN article_revisions revision
              ON revision.article_id = a.id AND revision.revision = a.revision
            WHERE p.article_id = a.id
              AND p.selection_candidate AND p.eligible AND p.visibility = 'public'
              AND (greatest(
                coalesce(p.selected_ready_at, p.discovered_at),
                revision.created_at,
                (SELECT max(j.created_on) FROM pgboss.job j
                  WHERE j.name = 'events.group' AND j.data->>'articleId' = a.id
                    AND j.singleton_key LIKE 'manual:group:%')
              ) >= ${utcDayStart()} OR EXISTS (
                SELECT 1 FROM pgboss.job failure WHERE failure.data->>'articleId' = a.id
                  AND failure.name = 'events.group' AND failure.state = 'failed'
                  AND failure.completed_on >= ${utcDayStart()}
              ))
          ))
      )
      AND a.discovered_at <= now() AND NOT a.backfill AND s.participation_mode = 'editorial'
    ORDER BY a.discovered_at DESC, a.id
  `;
}

function queueCounts(items: NonNullable<Runs["currentNewsItems"]>): Runs["currentNews"] {
  return items.reduce((acc, item) => {
    acc[item.status]++;
    return acc;
  }, { pending: 0, processing: 0, failed: 0 });
}

/** The three counts use exactly the same definition as their clickable detail rows. */
export async function currentNewsQueueOverview(): Promise<Runs["currentNews"]> {
  return queueCounts(await currentNewsQueueItems());
}


/** Diagnose unresolved editorial news from current article, job and receipt evidence. */
export async function backlogCausesOverview(): Promise<NonNullable<Runs["backlogCauses"]>> {
  return sql<NonNullable<Runs["backlogCauses"]>>`
    WITH live AS (
      SELECT a.id, a.discovered_at, a.processing_state, a.processing_error, a.processing_retry_at,
        EXISTS (SELECT 1 FROM pgboss.job j
          WHERE j.name IN ('content.analyze', 'content.extract-body')
            AND j.data->>'articleId' = a.id AND j.state = 'active') AS active_job,
        (SELECT min(j.started_on) FROM pgboss.job j
          WHERE j.name IN ('content.analyze', 'content.extract-body')
            AND j.data->>'articleId' = a.id AND j.state = 'active') AS active_since,
        (SELECT min(j.created_on) FROM pgboss.job j
          WHERE j.name IN ('content.analyze', 'content.extract-body')
            AND j.data->>'articleId' = a.id AND j.state IN ('created', 'retry')) AS queue_since,
        EXISTS (SELECT 1 FROM receipts r WHERE r.status IN ('unknown', 'pending')
          AND substring(r.subject from '^article:([^@:#]+)') = a.id) AS unverified_receipt
      FROM articles a JOIN sources src ON src.id = a.source_id
      WHERE a.processing_state IN ('new', 'failed')
        AND (a.discovered_at >= ${utcDayStart()} OR (a.updated_at >= ${utcDayStart()} AND EXISTS (SELECT 1 FROM publications p WHERE p.article_id = a.id)))
        AND a.discovered_at <= now()
        AND NOT a.backfill AND src.participation_mode = 'editorial'
    ), classified AS (
      SELECT *, CASE
        WHEN processing_state = 'failed' AND unverified_receipt THEN 'receipt_unknown'
        WHEN processing_state = 'failed' THEN 'article_failed'
        WHEN active_since < now() - interval '15 minutes' THEN 'long_running'
        WHEN active_job THEN NULL
        WHEN processing_retry_at > now() AND processing_error ~* '(model|provider|capacity|rate.limit|quota|budget|429|503|timeout)' THEN 'provider_retry'
        WHEN processing_retry_at > now() THEN 'retry_wait'
        WHEN queue_since < now() - interval '15 minutes' THEN 'queue_wait'
        WHEN queue_since IS NOT NULL THEN NULL
        WHEN NOT active_job AND discovered_at < now() - interval '15 minutes' THEN 'missing_job'
        WHEN discovered_at < now() - interval '15 minutes' THEN 'unclassified'
        ELSE NULL
      END AS kind FROM live
    )
    SELECT kind, count(*)::int AS count, min(discovered_at) AS oldest,
      (array_agg(id ORDER BY discovered_at ASC, id))[1] AS "exampleArticleId",
      (array_agg(left(processing_error, 200) ORDER BY discovered_at ASC, id))[1] AS "exampleError",
      min(processing_retry_at) FILTER (WHERE processing_retry_at > now()) AS "nextRetryAt"
    FROM classified WHERE kind IS NOT NULL
    GROUP BY kind ORDER BY count DESC, kind
  `;
}


/** Current data already written by every execution family; no probes, guesses or new queues. */
export async function allFlowItemsOverview(news: NonNullable<Runs["currentNewsItems"]>): Promise<NonNullable<Runs["flowItems"]>> {
  type Rows = NonNullable<Runs["flowItems"]>;
  const [jobs, schedules, models, sources, deliveries] = await Promise.all([
    sql<Rows>`
      WITH ranked AS (
        SELECT j.*, row_number() OVER (
          PARTITION BY j.name, CASE WHEN j.name LIKE 'cron.%' THEN j.name
            ELSE coalesce(j.data->>'articleId', j.data->>'sourceId',
              j.data->>'storyId', j.singleton_key, j.id::text) END
          ORDER BY j.created_on DESC, j.id DESC
        ) AS n
        FROM pgboss.job j
        WHERE j.created_on >= ${utcDayStart()} AND j.state IN ('created', 'retry', 'active', 'failed', 'completed')
      )
      SELECT 'job:' || j.id::text AS key, 'job' AS kind,
        CASE WHEN j.state = 'active' THEN 'processing'
             WHEN j.state = 'failed' THEN 'failed' ELSE 'pending' END AS status,
        j.name AS process,
        coalesce(a.title, src.name, j.data->>'storyId', j.data->>'url',
                 j.data->>'key', j.singleton_key, j.name) AS subject,
        j.data->>'articleId' AS "articleId",
        NULL::text AS provider, NULL::text AS model,
        CASE WHEN j.state = 'failed' THEN left(coalesce(j.output->>'error',
             j.output->>'message', j.output::text, '任务失败，未记录错误内容'), 2000)
             ELSE NULL END AS error,
        coalesce(j.completed_on, j.started_on, j.created_on) AS at,
        NULL::timestamptz AS "retryAt", j.id::text AS "jobId", NULL::integer AS "receiptId"
      FROM ranked j
      LEFT JOIN articles a ON a.id = j.data->>'articleId'
      LEFT JOIN sources src ON src.id = j.data->>'sourceId'
      WHERE j.n = 1 AND j.state IN ('created','retry','active','failed')
    `,
    sql<Rows>`
      WITH latest AS (
        SELECT DISTINCT ON (job) job, status, error, started_at, finished_at
        FROM job_runs WHERE started_at >= ${utcDayStart()}
        ORDER BY job, started_at DESC, id DESC
      )
      SELECT 'schedule:' || last.job AS key, 'schedule' AS kind, 'failed' AS status,
        'cron.' || last.job AS process, last.job AS subject,
        NULL::text AS "articleId", NULL::text AS provider, NULL::text AS model,
        left(last.error, 2000) AS error,
        coalesce(last.finished_at,last.started_at) AS at,
        NULL::timestamptz AS "retryAt", NULL::text AS "jobId",
        NULL::integer AS "receiptId"
      FROM latest last
      WHERE last.status = 'failed' AND EXISTS (
        SELECT 1 FROM pgboss.schedule sch WHERE sch.name = 'cron.' || last.job)
    `,
    sql<Rows>`
      SELECT 'model:' || r.id::text AS key, 'model' AS kind,
        CASE WHEN r.status = 'pending' THEN 'processing'
              WHEN r.status = 'unknown' THEN 'pending' ELSE 'failed' END AS status,
        r.purpose AS process,
        coalesce(a.title, r.subject, r.purpose) AS subject,
        substring(r.subject from '^article:([^@:#]+)') AS "articleId",
        r.service AS provider, r.model,
        left(coalesce(r.error, last_attempt.error), 2000) AS error,
        r.updated_at AS at, NULL::timestamptz AS "retryAt",
        NULL::text AS "jobId", r.id AS "receiptId", r.status AS "receiptStatus"
      FROM receipts r
      LEFT JOIN articles a ON a.id = substring(r.subject from '^article:([^@:#]+)')
      LEFT JOIN LATERAL (
        SELECT attempt.error FROM receipt_attempts attempt
        WHERE attempt.receipt_id = r.id ORDER BY attempt.id DESC LIMIT 1
      ) last_attempt ON true
      -- The lifetime of an unresolved receipt does not make it today's failed call.
      -- Keep cross-day unknowns in receipts.issues for manual verification instead.
      WHERE r.updated_at >= ${utcDayStart()}
        AND r.model IS NOT NULL AND r.purpose <> 'model_provider_probe'
        AND r.status IN ('failed', 'unknown', 'pending')
        AND NOT EXISTS (
          SELECT 1 FROM receipts newer
          WHERE newer.subject IS NOT DISTINCT FROM r.subject
            AND newer.purpose = r.purpose
            AND newer.status IN ('received', 'completed') AND newer.updated_at > r.updated_at
        )
    `,
    sql<Rows>`
      SELECT 'source:' || s.id AS key, 'source' AS kind, 'failed' AS status,
        'sources.fetch' AS process, s.name AS subject,
        NULL::text AS "articleId", NULL::text AS provider, NULL::text AS model,
        left(s.last_error, 2000) AS error, s.last_fetch_at AS at,
        NULL::timestamptz AS "retryAt", NULL::text AS "jobId", NULL::integer AS "receiptId"
      FROM sources s WHERE s.enabled AND s.health = 'failing'
        AND s.last_fetch_at >= ${utcDayStart()}
    `,
    sql<Rows>`
      SELECT 'delivery:' || d.id::text AS key, 'delivery' AS kind, 'failed' AS status,
        'notify.selected' AS process, coalesce(a.title, d.target_key) AS subject,
        CASE WHEN d.subject_kind IN ('article','selected') THEN d.subject_id ELSE NULL END AS "articleId",
        NULL::text AS provider, NULL::text AS model,
        left(d.response, 2000) AS error, d.updated_at AS at,
        NULL::timestamptz AS "retryAt", NULL::text AS "jobId", NULL::integer AS "receiptId"
      FROM deliveries d LEFT JOIN articles a ON a.id = d.subject_id
      WHERE d.status IN ('unknown','failed') AND d.updated_at >= ${utcDayStart()}
    `,
  ]);
  const rows: Rows = news.map(article => ({
    key: "article:" + article.id, kind: "article", status: article.status,
    process: article.stage, subject: article.title, articleId: article.id,
    provider: article.provider ?? null, model: article.model ?? null, error: article.error,
    at: article.startedAt ?? article.queuedAt ?? article.discoveredAt,
    retryAt: article.retryAt, jobId: null, receiptId: article.unverifiedReceiptId,
    receiptStatus: article.receiptStatus,
  }));
  const newsIds = new Set(news.map(article => article.id));
  for (const job of jobs) {
    // The article row already represents its live extraction/analysis/grouping job.
    if (job.articleId && newsIds.has(job.articleId) &&
        ['content.analyze', 'content.extract-body', 'events.group'].includes(job.process)) continue;
    rows.push(job);
  }
  // The latest cron state has one row: use the recorded failure text instead of raw pg-boss output.
  for (const schedule of schedules) {
    const running = rows.some(row => row.process === schedule.process && row.kind === 'job' && row.status !== 'failed');
    if (running) continue;
    const old = rows.findIndex(row => row.process === schedule.process && row.kind === 'job');
    if (old >= 0) rows.splice(old, 1);
    rows.push(schedule);
  }
  rows.push(...models, ...sources, ...deliveries);
  const asMillis = (time: Date | string) => typeof time === "string" ? Date.parse(time) : time.getTime();
  return rows.sort((a,b) => asMillis(b.at) - asMillis(a.at) || a.key.localeCompare(b.key));
}

export async function runsOverview(): Promise<Runs> {
  const currentJobs = (await Promise.all(serverModules().flatMap((m) => m.admin?.currentJobs ? [m.admin.currentJobs()] : []))).flat();
  const [
    heartbeats,
    latest,
    timeline,
    queues,
    [articleProcessing],
    live24h,
    currentNewsItems,
    backlogCauses,
    legacyUnresolved,
    failedJobs,
    lagging,
    receipts,
    [unknownReceiptCount],
    receiptIssues,
    deliveries,
    errors,
    ingest,
    grouping,
    [retrying],
    routingEffect,
    modules,
  ] = await Promise.all([
    sql<{ key: string; value: Heartbeat; updated_at: Date }[]>`SELECT key, value, updated_at FROM settings WHERE key LIKE 'heartbeat.%' ORDER BY key`,
    sql<Runs["jobs"]>`
      WITH current_jobs AS (
        -- Start with live schedules, so each indexed lookup reads one task rather than all history.
        SELECT substring(name FROM 6) AS job FROM pgboss.schedule WHERE name LIKE 'cron.%'
        UNION SELECT unnest(${currentJobs}::text[])
      )
      SELECT current_jobs.job, latest.*, counts.failed_today, counts.runs_today
      FROM current_jobs
      LEFT JOIN LATERAL (
        SELECT started_at, finished_at, status, left(error, 400) AS error FROM job_runs
        WHERE job = current_jobs.job AND started_at >= ${utcDayStart()} ORDER BY started_at DESC, id DESC LIMIT 1
      ) latest ON true
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE status = 'failed')::int AS failed_today, count(*)::int AS runs_today
        FROM job_runs WHERE job = current_jobs.job AND started_at >= ${utcDayStart()}
      ) counts ORDER BY current_jobs.job`,
    sql<Runs["timeline"]>`SELECT id, job, started_at, finished_at, status, left(error, 300) AS error FROM job_runs WHERE started_at >= ${utcDayStart()} ORDER BY started_at DESC, id DESC LIMIT 80`,
    sql<Runs["queues"]>`
      SELECT name, state, count(*)::int AS n, min(created_on) AS oldest FROM pgboss.job
      WHERE state IN ('created', 'retry', 'active') GROUP BY 1, 2 ORDER BY 1, 2`,
    sql<Runs["articleProcessing"][]> `
      SELECT count(*) FILTER (WHERE processing_state='new' AND processing_attempts=0)::int AS waiting,
        count(*) FILTER (WHERE processing_state='new' AND processing_attempts>0)::int AS retrying,
        count(*) FILTER (WHERE processing_state='failed')::int AS failed,
        count(*) FILTER (WHERE processing_state='blocked')::int AS filtered,
        count(*) FILTER (WHERE processing_state IN ('new','failed') AND
          (processing_error ILIKE '%No eligible configured model%' OR processing_error ILIKE '%Model cannot route%'))::int AS "unavailableModel"
      FROM articles a JOIN sources s ON s.id = a.source_id
      WHERE a.discovered_at >= ${utcDayStart()}
        AND a.discovered_at <= now()
        AND NOT a.backfill AND s.participation_mode = 'editorial'`,
    livePipelineOverview(),
    currentNewsQueueItems(),
    backlogCausesOverview(),
    legacyUnresolvedOverview(),
    sql<Runs["failedJobs"]>`
      SELECT name, count(*)::int AS failed, max(completed_on) AS last, left((array_agg(output::text ORDER BY completed_on DESC))[1], 300) AS last_output
      FROM pgboss.job WHERE state = 'failed' AND completed_on >= ${utcDayStart()} GROUP BY 1 ORDER BY 2 DESC, 1`,
    sql<Runs["lagging"]>`
      SELECT id, name, kind, health, fail_count, last_ok_at, last_fetch_at, next_fetch_at, interval_minutes, left(last_error, 200) AS last_error
      FROM sources
      WHERE enabled AND kind NOT IN ('mp_account', 'external')
        AND (health = 'failing' OR next_fetch_at < now() - interval '30 minutes' OR last_ok_at < now() - make_interval(mins => greatest(interval_minutes * 6, 360)))
      ORDER BY health = 'failing' DESC, next_fetch_at, id LIMIT 60`,
    sql<{ status: string; n: number }[]>`SELECT status, count(*)::int AS n FROM receipts WHERE created_at >= ${utcDayStart()} GROUP BY 1 ORDER BY 1`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts WHERE status = 'unknown'`,
    sql<Runs["receipts"]["issues"]>`
      SELECT id, service, model, purpose, subject, status, attempts, left(error, 240) AS error, created_at, updated_at FROM receipts
      WHERE status = 'unknown' OR (status = 'pending' AND updated_at < now() - interval '15 minutes')
        OR (status = 'failed' AND updated_at >= ${utcDayStart()})
      ORDER BY status = 'unknown' DESC, updated_at DESC, id DESC LIMIT 40`,
    sql<Runs["deliveries"]>`
      SELECT id, target_key, subject_kind, subject_id, status, attempts, left(response, 240) AS response, created_at, updated_at FROM deliveries
      WHERE status IN ('unknown', 'failed') OR (status = 'sending' AND updated_at < now() - interval '15 minutes')
      ORDER BY status = 'unknown' DESC, updated_at DESC, id DESC LIMIT 40`,
    sql<Runs["errors"]>`
      -- Match the exact eligibility set used by requeueFailed; the action must
      -- never requeue more articles than this error group tells the operator.
      SELECT ${failureGroupSql("a.processing_error")} AS error, count(*)::int AS n, max(a.discovered_at) AS last,
             (array_agg(a.id ORDER BY a.discovered_at DESC))[1] AS example
      FROM articles a JOIN sources s ON s.id = a.source_id
      WHERE a.processing_state = 'failed' AND NOT a.backfill AND s.participation_mode = 'editorial'
        AND (a.discovered_at >= ${utcDayStart()} OR (a.updated_at >= ${utcDayStart()} AND EXISTS (SELECT 1 FROM publications p WHERE p.article_id = a.id)))
        -- Unknown or pending provider results require explicit verification, not bulk retry.
        AND NOT EXISTS (
          SELECT 1 FROM receipts r WHERE r.status IN ('pending','unknown')
            AND substring(r.subject from '^article:([^@:#]+)') = a.id
        )
      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 20`,
    sql<Runs["ingest"]>`SELECT client, kind, status, left(error, 200) AS error, summary, created_at FROM ingest_events WHERE created_at >= ${utcDayStart()} ORDER BY created_at DESC, id DESC LIMIT 20`,
    waitingSelectedNews('utc-day'),
    // Articles waiting to retry after a passing provider problem (they are not failed).
    sql<{ n: number; next: Date | null }[]>`
      SELECT count(*)::int AS n, min(a.processing_retry_at) AS next
      FROM articles a JOIN sources s ON s.id = a.source_id
      WHERE a.processing_state = 'new' AND a.processing_attempts > 0
        AND a.discovered_at >= ${utcDayStart()}
        AND a.discovered_at <= now() AND NOT a.backfill AND s.participation_mode = 'editorial'`,
    routingEffectOverview(),
    Promise.all(serverModules().flatMap((m) => (m.admin?.runs ? [m.admin.runs().then((part) => [m.name, part] as const)] : []))),
  ]);
  const currentNews = queueCounts(currentNewsItems);
  const flowItems = await allFlowItemsOverview(currentNewsItems);
  const now = Date.now();
  return {
    checkedAt: new Date(now).toISOString(),
    processes: heartbeats.map((h) => ({
      role: h.key.slice("heartbeat.".length),
      ...h.value,
      at: h.updated_at,
      alive: now - h.updated_at.getTime() < STALE_HEARTBEAT_MS,
    })),
    jobs: latest,
    timeline,
    queues,
    articleProcessing: articleProcessing ?? {waiting:0,retrying:0,failed:0,filtered:0,unavailableModel:0},
    live24h,
    currentNews,
    currentNewsItems,
    flowItems,
    backlogCauses,
    legacyUnresolved,
    routingEffect,
    failedJobs,
    grouping: groupingOverview(grouping, now),
    lagging,
    receipts: { counts: Object.fromEntries(receipts.map((r) => [r.status, r.n])), unknownTotal: unknownReceiptCount?.n ?? 0, issues: receiptIssues },
    deliveries,
    errors,
    retrying: { count: retrying?.n ?? 0, next: retrying?.next ?? null },
    ingest,
    modules: Object.fromEntries(modules),
  };
}


/** Move exactly one failed article to the pending queue, or reject without altering state. */
export async function requeueFailedArticles(input: { group?: string | null; articleId?: string; reason: string; limit?: number }, actor: string) {
  if (!input.reason?.trim()) throw new Error("reason is required");
  if (input.articleId) {
    const id = input.articleId;
    return sql.begin(async tx => {
      const [eligible] = await tx<{ id: string }[]>`
        SELECT a.id FROM articles a JOIN sources s ON s.id = a.source_id
        WHERE a.id = ${id} AND a.processing_state = 'failed'
          AND NOT a.backfill AND s.participation_mode = 'editorial'
          AND (a.discovered_at >= ${utcDayStart()} OR (a.updated_at >= ${utcDayStart()} AND EXISTS (SELECT 1 FROM publications p WHERE p.article_id = a.id)))
        FOR UPDATE OF a`;
      if (!eligible) throw Object.assign(new Error("这条新闻已不在当前失败队列，请刷新页面"), { statusCode: 409 });
      const [unverified] = await tx`
        SELECT 1 FROM receipts r WHERE r.status IN ('pending', 'unknown')
          AND substring(r.subject from '^article:([^@:#]+)') = ${id} LIMIT 1`;
      if (unverified) throw Object.assign(new Error("模型回执未确认，不能直接重试；请先核对回执"), { statusCode: 409 });
      await tx`
        UPDATE articles SET processing_state = 'new', processing_attempts = 0,
          processing_retry_at = NULL, processing_queued_at = NULL, processing_error = NULL
        WHERE id = ${id}`;
      const jobId = await queueProcessing(id, { db: tx });
      if (!jobId) throw Object.assign(new Error("任务没有成功进入待处理队列，请刷新重试"), { statusCode: 409 });
      await audit(actor, "processing.requeue.article", "article:" + id, input.reason, null, { jobId }, { db: tx });
      return { requeued: 1, jobId };
    });
  }
  const result = await requeueFailed(input.group ?? null, input.limit ?? null);
  await audit(actor, "processing.requeue", input.group ? "failure:" + input.group.slice(0, 80) : "failure:all", input.reason, null, result);
  return result;
}

/** Retry an actual failed pg-boss task, without replaying an unverified model request. */
export async function requeueFailedJob(id: string, actor: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw Object.assign(new Error("无效任务 ID"), { statusCode: 400 });
  const [job] = await sql<{ id: string; name: string; article_id: string | null }[]>`
    SELECT id::text, name, data->>'articleId' AS article_id FROM pgboss.job
    WHERE id = ${id}::uuid AND state = 'failed' AND created_on >= ${utcDayStart()}`;
  if (!job) throw Object.assign(new Error("任务已恢复或过期，请刷新"), { statusCode: 409 });
  if (job.article_id) {
    const [unverified] = await sql`
      SELECT 1 FROM receipts r WHERE r.status IN ('pending','unknown')
        AND substring(r.subject from '^article:([^@:#]+)') = ${job.article_id} LIMIT 1`;
    if (unverified) throw Object.assign(new Error("模型回执未确认，不能重复发送"), { statusCode: 409 });
  }
  const boss = await getBoss();
  await boss.retry(job.name, job.id);
  await audit(actor, "processing.requeue.job", "job:" + job.id, "后台手动重试失败任务", null, { queue: job.name });
  return { requeued: 1 };
}

/** A failed cron run is a real task that can be sent back to its existing scheduled queue. */
export async function requeueFailedSchedule(jobName: string, actor: string) {
  if (!/^[a-z0-9._-]{2,100}$/.test(jobName)) throw Object.assign(new Error("无效流程名称"), { statusCode: 400 });
  const queue = 'cron.' + jobName;
  const [schedule] = await sql`SELECT 1 FROM pgboss.schedule WHERE name = ${queue} LIMIT 1`;
  if (!schedule) throw Object.assign(new Error("定时任务已停用"), { statusCode: 409 });
  const [last] = await sql<{ status: string }[]>`
    SELECT status FROM job_runs WHERE job = ${jobName} AND started_at >= ${utcDayStart()}
    ORDER BY started_at DESC, id DESC LIMIT 1`;
  if (last?.status !== 'failed') throw Object.assign(new Error("流程已重新运行，请刷新"), { statusCode: 409 });
  const [active] = await sql`
    SELECT 1 FROM pgboss.job WHERE name = ${queue} AND state IN ('created','retry','active') LIMIT 1`;
  if (active) throw Object.assign(new Error("任务已经在队列中"), { statusCode: 409 });
  const boss = await getBoss();
  const jobId = await boss.send(queue, {}, { singletonKey: 'admin:' + jobName });
  if (!jobId) throw Object.assign(new Error("任务未成功入队"), { statusCode: 409 });
  await audit(actor, 'processing.requeue.schedule', queue, "后台手动重试失败流程", null, { jobId });
  return { requeued: 1, jobId };
}
