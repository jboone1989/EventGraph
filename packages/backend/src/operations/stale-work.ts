// A live-news processing queue is disposable after 24 hours: keep the news record, not the stale work.
// Called by the worker's recurring timer; safe to repeat after restarts.
import { sql } from "../db.ts";

export const NEWS_WORK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function expireStaleWork(now = new Date()) {
  const cutoff = new Date(now.getTime() - NEWS_WORK_MAX_AGE_MS);
  return sql.begin(async (tx) => {
    const jobs = await tx`
      DELETE FROM pgboss.job
      WHERE state IN ('created', 'retry', 'active') AND created_on < ${cutoff}`;
    const articles = await tx`
      UPDATE articles SET processing_state = 'skipped', processing_error = NULL,
        processing_attempts = 0, processing_retry_at = NULL, processing_queued_at = NULL
      WHERE processing_state IN ('new', 'failed') AND greatest(discovered_at, updated_at) < ${cutoff}`;
    return { deletedStaleJobs: jobs.count, skippedStaleArticles: articles.count };
  });
}
