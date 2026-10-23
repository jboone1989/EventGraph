// The explore gallery (EG-T16): real public events, discovered through their topics, one card each
// with its stage count, sources, latest development and — when a public full-text report carries a
// picture — its real cover. The topic index owns the selection (the site's own curated set, minute-
// cached); every card is then re-checked against the public evidence of now, so a withdrawn event
// leaves the gallery instead of going stale. No card is ever a placeholder.
import { sql } from "../db.ts";
import type { ExploreGalleryResponse, GalleryCard } from "@aihot/contracts/site";
import { topicIndex, findTopic } from "./topics.ts";
import { storyTexts } from "./story-text.ts";
import { coversForStories, excerpt } from "./stories.ts";
import { proxiedImage, proxiedImageSet } from "../media/imgproxy.ts";
import { evidenceCondition, storyReportCondition } from "./scope.ts";

const PER_TOPIC = 3;
const CARD_LIMIT = 12;
const hasHan = (s: string) => /[㐀-鿿]/.test(s);

/** The topic index owns the selection (minute-cached for live reads); cards are re-checked against
 *  the public evidence of `now`, so a withdrawn event leaves the gallery at its next read. */
async function readExploreGallery(now: Date, cachedIndex: boolean): Promise<ExploreGalleryResponse> {
  const index = await topicIndex(cachedIndex ? undefined : now);
  const claimed = new Set<string>();
  const picks: Array<{ slug: string; story: string; englishTitle: string | null }> = [];
  for (const [slug, seats] of index.bySlug) {
    let fromTopic = 0;
    for (const seat of seats) {
      if (!seat.story || claimed.has(seat.story)) continue;
      claimed.add(seat.story);
      if (fromTopic === PER_TOPIC || picks.length === CARD_LIMIT) break;
      picks.push({
        slug,
        story: seat.story,
        englishTitle: seat.originalTitle && !hasHan(seat.originalTitle) ? seat.originalTitle : null,
      });
      fromTopic += 1;
    }
    if (picks.length >= CARD_LIMIT) break;
  }
  if (!picks.length) return { computedAt: now.toISOString(), cards: [] };
  const rows = await sql<{ id: number; public_id: string; title: string; stages: number; sources: number; latest_at: Date }[]>`
    SELECT st.id, st.public_id::text, st.title,
      count(DISTINCT f.id) AS stages, count(DISTINCT p.source_id) AS sources,
      max(coalesce(p.published_at, p.discovered_at)) AS latest_at
    FROM stories st
    JOIN facts f ON f.story_id = st.id
    JOIN fact_articles fa ON fa.fact_id = f.id
    JOIN publications p ON p.article_id = fa.article_id
    JOIN sources s ON s.id = p.source_id
    WHERE st.public_id::text = ANY(${picks.map((p) => p.story)}::text[]) AND ${evidenceCondition()} AND ${storyReportCondition(now)}
    GROUP BY st.id`;
  const current = new Map(rows.map((r) => [r.public_id, r]));
  const kept = picks.filter((p) => current.has(p.story));
  const [texts, covers] = await Promise.all([
    storyTexts(kept.map((p) => current.get(p.story)!.id), now),
    coversForStories(kept.map((p) => current.get(p.story)!.id), [], now),
  ]);
  return {
    computedAt: now.toISOString(),
    cards: kept.map((pick): GalleryCard => {
      const row = current.get(pick.story)!;
      const picture = covers.get(row.id) ?? null;
      const coverUrl = picture ? proxiedImage(picture.url, "full") : null;
      const text = texts.get(row.id);
      return {
        story: { publicId: pick.story, title: row.title },
        englishTitle: pick.englishTitle,
        topic: { slug: pick.slug, name: findTopic(pick.slug)?.name ?? pick.slug },
        cover: picture && coverUrl
          ? { url: coverUrl, srcSet: proxiedImageSet(picture.url, "hero") ?? undefined, width: picture.width, height: picture.height }
          : null,
        sourceCount: Number(row.sources),
        stageCount: Number(row.stages),
        latestAt: row.latest_at.toISOString(),
        summary: text?.summary ? excerpt(text.summary) : null,
      };
    }),
  };
}

/** Live reads reuse the minute-cached topic index; an explicit `now` (tests, a replay) reads afresh. */
export async function publicExploreGallery(now?: Date): Promise<ExploreGalleryResponse> {
  return readExploreGallery(now ?? new Date(), !now);
}
