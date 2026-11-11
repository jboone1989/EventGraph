// The home hero picks a recent public selected article, not the 48-hour event heat leader.
import type { HeroNews } from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { ITEM_COLUMNS, ITEM_FROM, toFeedItemSummary, type ItemRow } from "./items.ts";
import { selectedCondition } from "./scope.ts";

const HOUR = 3_600_000;

/** Prefer a strong report published in the last six hours; fall back to the rest of the last day. */
export async function loadHeroNews(now = new Date()): Promise<HeroNews | null> {
  const dayAgo = new Date(now.getTime() - 24 * HOUR);
  const sixHoursAgo = new Date(now.getTime() - 6 * HOUR);
  const [row] = await sql<ItemRow[]>`
    WITH chosen AS (
      SELECT p.article_id FROM publications p
      WHERE ${selectedCondition(now)} AND p.eligible AND p.channel = 'news'
        AND p.published_at >= ${dayAgo} AND p.published_at <= ${now}
        AND nullif(btrim(p.title), '') IS NOT NULL
        AND nullif(btrim(p.summary), '') IS NOT NULL
      ORDER BY (p.published_at < ${sixHoursAgo}) ASC,
        p.score DESC NULLS LAST, p.published_at DESC, p.article_id DESC
      LIMIT 1
    )
    SELECT ${ITEM_COLUMNS} ${ITEM_FROM}
    WHERE p.article_id = (SELECT article_id FROM chosen) AND ${selectedCondition(now)}
    LIMIT 1`;
  return row ? { item: toFeedItemSummary(row), storyPublicId: row.story_public_id } : null;
}
