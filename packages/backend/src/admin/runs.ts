// Runs view: task timeline, queue backlog, source lag, error classes, process
// heartbeats, and the receipts and deliveries whose outcome needs an operator (resolved in
// operations/recover.ts and notify/deliver.ts).
import type { AdminRuns, BeforeJson } from "@aihot/contracts/admin";
import { sql } from "../db.ts";
import { utcDayStart } from "../operations/stale-work.ts";
import type { Heartbeat } from "../operations/heartbeat.ts";
import { audit } from "../audit.ts";
import { failureGroupSql, requeueFailed } from "../jobs/content.ts";
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
      WHERE a.origin = 'live' AND a.started_at >= now() - interval '24 hours'
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
    hours: 24,
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

/** New-news operational funnel; backfills and signal-only records cannot obscure current reliability. */
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
    WHERE a.discovered_at > now() - interval '24 hours'
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

/** Current UTC-day news in three exclusive states, deduplicated by article ID. */
export async function currentNewsQueueOverview(): Promise<Runs["currentNews"]> {
  const [row] = await sql<{ pending: number; processing: number; failed: number }[]>`
    WITH active AS (
      SELECT DISTINCT data->>'articleId' AS article_id
      FROM pgboss.job
      WHERE name IN ('content.analyze', 'content.extract-body') AND state = 'active'
    )
    SELECT count(*) FILTER (WHERE a.processing_state = 'new' AND active.article_id IS NULL)::int AS pending,
           count(*) FILTER (WHERE a.processing_state = 'new' AND active.article_id IS NOT NULL)::int AS processing,
           count(*) FILTER (WHERE a.processing_state = 'failed')::int AS failed
    FROM articles a JOIN sources s ON s.id = a.source_id
    LEFT JOIN active ON active.article_id = a.id
    WHERE a.processing_state IN ('new', 'failed')
      AND a.discovered_at >= ${utcDayStart()} AND a.discovered_at <= now()
      AND NOT a.backfill AND s.participation_mode = 'editorial'`;
  return row ?? { pending: 0, processing: 0, failed: 0 };
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
    currentNews,
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
      SELECT current_jobs.job, latest.*, counts.failed_24h, counts.runs_24h
      FROM current_jobs
      JOIN LATERAL (
        SELECT started_at, finished_at, status, left(error, 400) AS error FROM job_runs
        WHERE job = current_jobs.job ORDER BY started_at DESC, id DESC LIMIT 1
      ) latest ON true
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE status = 'failed')::int AS failed_24h, count(*)::int AS runs_24h
        FROM job_runs WHERE job = current_jobs.job AND started_at > now() - interval '24 hours'
      ) counts ORDER BY current_jobs.job`,
    sql<Runs["timeline"]>`SELECT id, job, started_at, finished_at, status, left(error, 300) AS error FROM job_runs ORDER BY started_at DESC, id DESC LIMIT 80`,
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
      WHERE a.discovered_at >= now() - interval '24 hours'
        AND a.discovered_at <= now()
        AND NOT a.backfill AND s.participation_mode = 'editorial'`,
    livePipelineOverview(),
    currentNewsQueueOverview(),
    legacyUnresolvedOverview(),
    sql<Runs["failedJobs"]>`
      SELECT name, count(*)::int AS failed, max(completed_on) AS last, left((array_agg(output::text ORDER BY completed_on DESC))[1], 300) AS last_output
      FROM pgboss.job WHERE state = 'failed' AND completed_on > now() - interval '24 hours' GROUP BY 1 ORDER BY 2 DESC, 1`,
    sql<Runs["lagging"]>`
      SELECT id, name, kind, health, fail_count, last_ok_at, last_fetch_at, next_fetch_at, interval_minutes, left(last_error, 200) AS last_error
      FROM sources
      WHERE enabled AND kind NOT IN ('mp_account', 'external')
        AND (health = 'failing' OR next_fetch_at < now() - interval '30 minutes' OR last_ok_at < now() - make_interval(mins => greatest(interval_minutes * 6, 360)))
      ORDER BY health = 'failing' DESC, next_fetch_at, id LIMIT 60`,
    sql<{ status: string; n: number }[]>`SELECT status, count(*)::int AS n FROM receipts WHERE created_at > now() - interval '7 days' GROUP BY 1 ORDER BY 1`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts WHERE status = 'unknown'`,
    sql<Runs["receipts"]["issues"]>`
      SELECT id, service, model, purpose, subject, status, attempts, left(error, 240) AS error, created_at, updated_at FROM receipts
      WHERE status = 'unknown' OR (status = 'failed' AND updated_at > now() - interval '3 days') OR (status = 'pending' AND updated_at < now() - interval '15 minutes')
      ORDER BY status = 'unknown' DESC, updated_at DESC, id DESC LIMIT 40`,
    sql<Runs["deliveries"]>`
      SELECT id, target_key, subject_kind, subject_id, status, attempts, left(response, 240) AS response, created_at, updated_at FROM deliveries
      WHERE status IN ('unknown', 'failed') OR (status = 'sending' AND updated_at < now() - interval '15 minutes')
      ORDER BY status = 'unknown' DESC, updated_at DESC, id DESC LIMIT 40`,
    sql<Runs["errors"]>`
      -- Match the exact eligibility set used by requeueFailed; the action must
      -- never requeue more articles than this error group tells the operator.
      SELECT ${failureGroupSql()} AS error, count(*)::int AS n, max(discovered_at) AS last,
             (array_agg(id ORDER BY discovered_at DESC))[1] AS example
      FROM articles
      WHERE processing_state = 'failed'
        AND discovered_at >= ${utcDayStart()}
      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 20`,
    sql<Runs["ingest"]>`SELECT client, kind, status, left(error, 200) AS error, summary, created_at FROM ingest_events ORDER BY created_at DESC, id DESC LIMIT 20`,
    waitingSelectedNews(),
    // Articles waiting to retry after a passing provider problem (they are not failed).
    sql<{ n: number; next: Date | null }[]>`
      SELECT count(*)::int AS n, min(a.processing_retry_at) AS next
      FROM articles a JOIN sources s ON s.id = a.source_id
      WHERE a.processing_state = 'new' AND a.processing_attempts > 0
        AND a.discovered_at >= now() - interval '24 hours'
        AND a.discovered_at <= now() AND NOT a.backfill AND s.participation_mode = 'editorial'`,
    routingEffectOverview(),
    Promise.all(serverModules().flatMap((m) => (m.admin?.runs ? [m.admin.runs().then((part) => [m.name, part] as const)] : []))),
  ]);
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

/** Failed articles (one failure group, or all of the last 24 hours) back into processing. */
export async function requeueFailedArticles(input: { group: string | null; reason: string; limit?: number }, actor: string) {
  if (!input.reason?.trim()) throw new Error("reason is required");
  const result = await requeueFailed(input.group, input.limit ?? null);
  await audit(actor, "processing.requeue", input.group ? `failure:${input.group.slice(0, 80)}` : "failure:all", input.reason, null, result);
  return result;
}
