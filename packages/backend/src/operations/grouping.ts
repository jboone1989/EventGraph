// Selected candidates waiting for a news identity: one reader-impact view for alerts and the admin.
import type { AdminRuns, BeforeJson } from "@aihot/contracts/admin";
import { sql } from "../db.ts";
import { AUTO_RELEASE_NOTE } from "./recover.ts";
import { utcDayStart } from "./stale-work.ts";

export const GROUPING_WARN_AFTER_MS = 10 * 60_000;
type WaitingNews = Omit<BeforeJson<AdminRuns>["grouping"]["items"][number], "since"> & { since: Date };

/** Alerts need a rolling window across midnight; only the admin diagnostics reset by UTC day. */
export async function waitingSelectedNews(period: 'rolling-24h' | 'utc-day' = 'rolling-24h'): Promise<WaitingNews[]> {
  const cutoff = period === 'utc-day' ? utcDayStart() : new Date(Date.now() - 24 * 60 * 60_000);
  const rows = await sql<Array<Omit<WaitingNews, "recovery"> & { running: boolean; receipt_status: string | null; released: boolean }>>`
    SELECT p.article_id AS "articleId", p.title,
           -- Waiting since it became a candidate, its last revision or an admin's regroup request (requestRegroup's job).
           group_wait.since,
           a.grouping_status = 'failed' AS failed, a.grouping_receipt_id AS "receiptId", a.grouping_error AS error,
           r.status AS receipt_status,
           live_job."jobState", live_job."queueSince", live_job."activeSince",
           failed_job."lastFailedJobError",
           live_job."jobState" IS NOT NULL AS running,
           EXISTS (SELECT 1 FROM receipt_attempts attempt WHERE attempt.receipt_id = r.id
                   AND attempt.error LIKE ${AUTO_RELEASE_NOTE + "%"}) AS released
    FROM publications p JOIN articles a ON a.id = p.article_id LEFT JOIN receipts r ON r.id = a.grouping_receipt_id
    LEFT JOIN article_revisions revision ON revision.article_id = a.id AND revision.revision = a.revision
    LEFT JOIN LATERAL (
      SELECT
        (array_agg(j.state ORDER BY CASE j.state WHEN 'active' THEN 0 WHEN 'retry' THEN 1 ELSE 2 END, j.created_on DESC))[1] AS "jobState",
        min(j.created_on) FILTER (WHERE j.state IN ('created', 'retry')) AS "queueSince",
        min(j.started_on) FILTER (WHERE j.state = 'active') AS "activeSince"
      FROM pgboss.job j
      WHERE j.name = 'events.group' AND j.data->>'articleId' = a.id
        AND j.state IN ('active', 'created', 'retry')
    ) live_job ON true
    LEFT JOIN LATERAL (
      SELECT left(j.output::text, 200) AS "lastFailedJobError"
      FROM pgboss.job j WHERE j.name = 'events.group' AND j.data->>'articleId' = a.id
        AND j.state = 'failed' AND j.completed_on >= ${cutoff}
      ORDER BY j.completed_on DESC, j.id DESC LIMIT 1
    ) failed_job ON true
    CROSS JOIN LATERAL (
      SELECT greatest(coalesce(p.selected_ready_at, p.discovered_at), revision.created_at,
        (SELECT max(j.created_on) FROM pgboss.job j WHERE j.name = 'events.group'
           AND j.data->>'articleId' = a.id AND j.singleton_key LIKE 'manual:group:%')) AS since
    ) group_wait
    WHERE p.selection_candidate AND p.eligible AND p.visibility = 'public' AND a.grouping_status <> 'complete'
      -- A routine article.updated_at change must not revive yesterday's grouping diagnostic.
      AND group_wait.since >= ${cutoff}
    ORDER BY group_wait.since, p.article_id`;
  return rows.map(({ running, receipt_status, released, ...row }) => ({
    ...row,
    recovery: receipt_status === "unknown" ? (released ? "manual" : "receipt")
      : !row.failed || running || receipt_status === "pending" ? "automatic" : "manual",
  }));
}

export function groupingOverview(items: WaitingNews[], now = Date.now()): BeforeJson<AdminRuns>["grouping"] {
  return {
    waiting: items.length,
    needsAttention: items.filter((item) => now - item.since.getTime() >= GROUPING_WARN_AFTER_MS).length,
    items,
  };
}
