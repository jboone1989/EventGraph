// Reconcile stored publications.indexable after moving to public-by-default discovery.
// An online DDL migration is the wrong place for a data backfill. This is bounded,
// idempotent, and safe to invoke after an image-only deployment.
import { sql, closeDb } from "@aihot/backend/db";

const BATCH = 200;
let total = 0;
try {
  for (;;) {
    const changed = await sql<{ article_id: string }[]>`
      WITH candidates AS (
        SELECT p.article_id,
          (p.visibility = 'public'
            AND s.participation_mode = 'editorial'
            AND p.summary IS NOT NULL AND p.summary <> ''
            AND p.seo_excluded_at IS NULL) AS eligible
        FROM publications p JOIN sources s ON s.id = p.source_id
        WHERE p.indexable IS DISTINCT FROM (
          p.visibility = 'public'
          AND s.participation_mode = 'editorial'
          AND p.summary IS NOT NULL AND p.summary <> ''
          AND p.seo_excluded_at IS NULL)
        ORDER BY p.article_id
        LIMIT ${BATCH}
        FOR UPDATE OF p SKIP LOCKED
      )
      UPDATE publications p SET indexable = c.eligible, updated_at = now()
      FROM candidates c WHERE p.article_id = c.article_id
      RETURNING p.article_id
    `;
    total += changed.length;
    if (changed.length < BATCH) break;
  }
  console.log(JSON.stringify({ indexabilityReconciled: total }));
} finally {
  await closeDb();
}
