// Public projections are owned here, including cleanup of expired article bodies.
import type { Tx } from "../db.ts";

/** Called within the compaction transaction; reader projections update atomically. */
export async function compactPublicArticleBodies(tx: Tx, ids: string[]) {
  await tx`UPDATE pool_search SET body = '' WHERE article_id = ANY(${ids}::text[])`;
  await tx`UPDATE publications SET body_mode = 'summary', syndicate = false, updated_at = now()
    WHERE article_id = ANY(${ids}::text[]) AND (body_mode <> 'summary' OR syndicate)`;
}
