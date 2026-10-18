// Compact normal (non-selected) old news to a lightweight, source-attributed index.
// Never delete its identity, public summary, source link, editorial judgement or story history.
import { sql } from "../db.ts";

export const DEFAULT_NEWS_BODY_DAYS = 30;
export const MIN_NEWS_BODY_DAYS = 7;
export const MAX_NEWS_BODY_DAYS = 30;

export function newsBodyDays(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_NEWS_BODY_DAYS;
  if (!/^(?:[7-9]|[12][0-9]|30)$/.test(value)) {
    throw new Error("NEWS_BODY_RETENTION_DAYS must be an integer between 7 and 30");
  }
  return Number(value);
}

const BATCH_SIZE = 200;
const MAX_BATCHES = 10;

export interface CompactionResult {
  retentionDays: number;
  compacted: number;
  batches: number;
}

/** Small batches avoid long DB locks on a two-vCPU server. */
export async function compactOrdinaryNews(
  now = new Date(),
  retentionDays = newsBodyDays(process.env.NEWS_BODY_RETENTION_DAYS),
): Promise<CompactionResult> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  let total = 0;
  let batches = 0;
  for (let round = 0; round < MAX_BATCHES; round++) {
    const n = await sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        SELECT a.id FROM articles a
        JOIN sources s ON s.id = a.source_id
        LEFT JOIN publications p ON p.article_id = a.id
        WHERE a.compacted_at IS NULL AND a.discovered_at < ${cutoff}
          AND a.processing_state IN ('analyzed','blocked','skipped')
          AND s.kind IN ('rss', 'web_list', 'json_list')
          AND a.x_post IS NULL
          AND ((p.article_id IS NULL AND a.processing_state IN ('blocked', 'skipped'))
            OR (p.channel = 'news' AND NOT p.selected AND NOT p.selection_candidate))
          -- Editorial revisions, ever-selected rows and digest evidence stay intact.
          AND NOT EXISTS (SELECT 1 FROM editorial_overrides eo WHERE eo.article_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM selected_ledger ledger WHERE ledger.article_id = a.id AND ledger.op = 'upsert')
          AND NOT EXISTS (SELECT 1 FROM story_digests d WHERE a.id = ANY(d.article_ids))
        ORDER BY a.discovered_at, a.id LIMIT ${BATCH_SIZE}
        FOR UPDATE OF a SKIP LOCKED`;
      if (rows.length === 0) return 0;
      const ids = rows.map(r => r.id);
      // Keep externalId for material identity reconciliation. Do not keep full fetched page payload.
      await tx`UPDATE articles SET compacted_at = ${now},
        body_text = NULL, body_html = NULL, body_status = 'none', media = '[]'::jsonb,
        raw = CASE WHEN jsonb_typeof(raw) = 'object' AND raw ? 'externalId'
          THEN jsonb_build_object('externalId', raw->'externalId') ELSE NULL END
        WHERE id = ANY(${ids}::text[])`;
      await tx`UPDATE article_revisions SET body_text = NULL
        WHERE article_id = ANY(${ids}::text[]) AND body_text IS NOT NULL`;
      await tx`UPDATE translations SET body_html = NULL, body_text = NULL
        WHERE article_id = ANY(${ids}::text[])`;
      await tx`UPDATE pool_search SET body = '' WHERE article_id = ANY(${ids}::text[])`;
      await tx`UPDATE publications SET body_mode = 'summary', syndicate = false WHERE article_id = ANY(${ids}::text[])`;
      return rows.length;
    });
    if (!n) break;
    batches++;
    total += n;
    if (n < BATCH_SIZE) break;
  }
  return { retentionDays, compacted: total, batches };
}
