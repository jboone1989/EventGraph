// At 00:00 UTC, discard unfinished news from previous UTC days.
// Published news and settled model billing records are deliberately retained.
import { sql } from "../db.ts";
import { markPendingArticleReceiptsUnknown } from "../providers/receipts.ts";

export function utcDayStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function expireStaleWork(now = new Date()) {
  const cutoff = utcDayStart(now);
  const totals = { deletedStaleJobs: 0, deletedStaleArticles: 0, markedUnknownReceipts: 0 };
  while (true) {
    const batch = await sql.begin(async tx => {
      const articles = await tx<{ id: string }[]>`
        SELECT a.id FROM articles a
        WHERE a.processing_state IN ('new', 'failed') AND a.discovered_at < ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM publications p WHERE p.article_id = a.id)
        ORDER BY a.discovered_at, a.id LIMIT 200 FOR UPDATE OF a SKIP LOCKED`;
      if (!articles.length) return { count: 0, jobs: 0, deleted: 0, markedUnknown: 0 };
      const ids = articles.map(a => a.id);
      const jobs = await tx`
        DELETE FROM pgboss.job
        WHERE data->>'articleId' = ANY(${ids}::text[])
          AND state IN ('created', 'retry', 'active', 'failed')`;
      // Keep provider usage and cost history; preserve unknown results for verification.
      const markedUnknown = await markPendingArticleReceiptsUnknown(tx, ids, "UTC midnight: unfinished article discarded");
      const deleted = await tx`
        DELETE FROM articles WHERE id = ANY(${ids}::text[])
        AND processing_state IN ('new', 'failed')
        AND NOT EXISTS (SELECT 1 FROM publications p WHERE p.article_id = articles.id)`;
      return { count: articles.length, jobs: jobs.count, deleted: deleted.count, markedUnknown };
    });
    totals.deletedStaleJobs += batch.jobs;
    totals.deletedStaleArticles += batch.deleted;
    totals.markedUnknownReceipts += batch.markedUnknown;
    if (batch.count < 200) break;
  }
  return totals;
}
