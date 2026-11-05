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
      const articles = await tx<{ id: string; has_publication: boolean }[]>`
        SELECT a.id, EXISTS (SELECT 1 FROM publications p WHERE p.article_id = a.id) AS has_publication
        FROM articles a
        WHERE a.processing_state IN ('new', 'failed') AND a.discovered_at < ${cutoff}
          -- A corrected published article may be undergoing today's re-analysis.
          AND (a.updated_at < ${cutoff} OR NOT EXISTS
            (SELECT 1 FROM publications p WHERE p.article_id = a.id))
        ORDER BY a.discovered_at, a.id LIMIT 200 FOR UPDATE OF a SKIP LOCKED`;
      if (!articles.length) return { count: 0, jobs: 0, deleted: 0, markedUnknown: 0 };
      const ids = articles.map(a => a.id);
      const publishedIds = articles.filter(a => a.has_publication).map(a => a.id);
      const obsoleteIds = articles.filter(a => !a.has_publication).map(a => a.id);
      const jobs = await tx`
        DELETE FROM pgboss.job
        WHERE data->>'articleId' = ANY(${ids}::text[])
          AND state IN ('created', 'retry', 'active', 'failed')`;
      // Keep provider usage and cost history; preserve unknown results for verification.
      const markedUnknown = await markPendingArticleReceiptsUnknown(tx, ids, "UTC midnight: unfinished article discarded");
      if (publishedIds.length) await tx`
        UPDATE articles SET processing_state = 'skipped', processing_attempts = 0,
          processing_error = NULL, processing_retry_at = NULL, processing_queued_at = NULL
        WHERE id = ANY(${publishedIds}::text[])
          AND processing_state IN ('new', 'failed') AND updated_at < ${cutoff}`;
      const deleted = await tx`
        DELETE FROM articles WHERE id = ANY(${obsoleteIds}::text[])
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
