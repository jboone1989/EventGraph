// At 00:00 UTC, remove old unfinished work from the queue.
// Keep article identity so a feed cannot rediscover yesterday's failed item and bill again.
import { sql } from "../db.ts";
import { markPendingArticleReceiptsUnknown } from "../providers/receipts.ts";

export function utcDayStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function expireStaleWork(now = new Date()) {
  const cutoff = utcDayStart(now);
  const totals = { deletedStaleJobs: 0, clearedStaleArticles: 0, markedUnknownReceipts: 0 };
  while (true) {
    const batch = await sql.begin(async tx => {
      const articles = await tx<{ id: string; has_publication: boolean }[]>`
        SELECT a.id, EXISTS (SELECT 1 FROM publications p WHERE p.article_id = a.id) AS has_publication
        FROM articles a
        WHERE a.processing_state IN ('new', 'failed') AND a.discovered_at < ${cutoff}
          -- A corrected published article may be undergoing today's re-analysis.
          AND (a.updated_at < ${cutoff} OR NOT EXISTS
            (SELECT 1 FROM publications p WHERE p.article_id = a.id))
        ORDER BY a.discovered_at, a.id LIMIT 200 FOR UPDATE OF a SKIP LOCKED`;
      if (!articles.length) return { count: 0, jobs: 0, cleared: 0, markedUnknown: 0 };
      const ids = articles.map(a => a.id);
      const jobs = await tx`
        DELETE FROM pgboss.job
        WHERE data->>'articleId' = ANY(${ids}::text[])
          AND state IN ('created', 'retry', 'active', 'failed')`;
      // Keep provider usage and cost history; preserve unknown results for verification.
      const markedUnknown = await markPendingArticleReceiptsUnknown(tx, ids, "UTC midnight: unfinished article discarded");
      // Retain the identity_key tombstone in articles. Deleting it would make RSS re-admit
      // the same news tomorrow and create a fresh model receipt for an already failed item.
      const cleared = await tx`
        UPDATE articles SET processing_state = 'skipped', processing_attempts = 0,
          processing_error = NULL, processing_retry_at = NULL, processing_queued_at = NULL
        WHERE id = ANY(${ids}::text[]) AND processing_state IN ('new', 'failed')`;
      return { count: articles.length, jobs: jobs.count, cleared: cleared.count, markedUnknown };
    });
    totals.deletedStaleJobs += batch.jobs;
    totals.clearedStaleArticles += batch.cleared;
    totals.markedUnknownReceipts += batch.markedUnknown;
    if (batch.count < 200) break;
  }
  // Clear old operational diagnostics at UTC midnight, but preserve paid request receipts.
  const oldRuns = await sql`DELETE FROM job_runs WHERE started_at < ${cutoff} AND status <> 'running'`;
  const oldFailures = await sql`DELETE FROM pgboss.job WHERE state = 'failed' AND completed_on < ${cutoff}`;
  return { ...totals, deletedRunHistory: oldRuns.count, deletedFailedJobHistory: oldFailures.count };
}
