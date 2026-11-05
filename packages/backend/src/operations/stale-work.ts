// At 00:00 UTC, discard unfinished news from previous UTC days.
// Published news and settled model billing records are deliberately retained.
import { sql } from "../db.ts";

export function utcDayStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function expireStaleWork(now = new Date()) {
  const cutoff = utcDayStart(now);
  const totals = { deletedStaleJobs: 0, deletedStaleArticles: 0, closedReceipts: 0 };
  while (true) {
    const batch = await sql.begin(async tx => {
      const articles = await tx<{ id: string }[]>`
        SELECT a.id FROM articles a
        WHERE a.processing_state IN ('new', 'failed') AND a.discovered_at < ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM publications p WHERE p.article_id = a.id)
        ORDER BY a.discovered_at, a.id LIMIT 200 FOR UPDATE OF a SKIP LOCKED`;
      if (!articles.length) return { count: 0, jobs: 0, deleted: 0, closed: 0 };
      const ids = articles.map(a => a.id);
      const jobs = await tx`
        DELETE FROM pgboss.job
        WHERE data->>'articleId' = ANY(${ids}::text[])
          AND state IN ('created', 'retry', 'active', 'failed')`;
      // Keep provider usage and cost history; close only unresolved receipts.
      const subjects = tx`substring(subject from '^article:([^@:#]+)') = ANY(${ids}::text[])`;
      await tx`UPDATE receipt_attempts SET status = 'failed',
        error = 'UTC midnight: unfinished article discarded',
        finished_at = coalesce(finished_at, now())
        WHERE status IN ('pending', 'unknown') AND receipt_id IN
          (SELECT id FROM receipts WHERE ${subjects})`;
      const receipts = await tx`UPDATE receipts SET status = 'failed',
        error = 'UTC midnight: unfinished article discarded', updated_at = now()
        WHERE status IN ('pending', 'unknown') AND ${subjects}`;
      const deleted = await tx`
        DELETE FROM articles WHERE id = ANY(${ids}::text[])
        AND processing_state IN ('new', 'failed')
        AND NOT EXISTS (SELECT 1 FROM publications p WHERE p.article_id = articles.id)`;
      return { count: articles.length, jobs: jobs.count, deleted: deleted.count, closed: receipts.count };
    });
    totals.deletedStaleJobs += batch.jobs;
    totals.deletedStaleArticles += batch.deleted;
    totals.closedReceipts += batch.closed;
    if (batch.count < 200) break;
  }
  return totals;
}
