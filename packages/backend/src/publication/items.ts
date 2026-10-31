// Public read layer, item level. Every exit (site API, v1, RSS, MCP, sitemap) reads
// items through these columns and views; which rows are public is decided by scope.ts.
import { CATEGORY_KEYS, toPublicApiCategory, type CategoryKey, type ChannelKey, type PublicApiCategoryKey } from "@aihot/contracts/taxonomy";
import type { EnglishCopy, FeedItemSummary, ItemSummary, MediaView, SourceTier, XPostView } from "@aihot/contracts/site";
import { POLICY } from "@aihot/site";
import { sql, type Db } from "../db.ts";
import { isEmptyOrLinkOnly } from "../content/posts.ts";
import { proxiedImage, proxiedImageSet } from "../media/imgproxy.ts";
import { sourceOwnsPost } from "../sources/account.ts";
import { displayTags, publicSourceName } from "./rules.ts";
import { foldableSelectionCondition, seatedCondition } from "./scope.ts";

export interface ItemRow {
  id: string;
  title: string;
  original_title: string | null;
  summary: string | null;
  reason: string | null;
  category: string | null;
  tags: string[];
  score: number | null;
  selected: boolean;
  channel: "news" | "x";
  url: string;
  published_at: Date | null;
  discovered_at: Date;
  timeline_at: Date;
  /** Holds its fact's selected seat (publish.ts settleSeats). */
  seat: boolean;
  visibility: string;
  body_mode: "full" | "summary";
  indexable: boolean;
  /** When an editor marked this page for indexing (specs/003-content-assets FR-001); null when not curated. */
  curated_at: Date | null;
  fact_id: number | null;
  source_name: string;
  /** The source's tier (T1, T1_5, T2); read by the item lists. */
  source_tier?: string;
  /** Participation mode of the source now (editorial, hot_signal, isolated). */
  source_mode: string;
  x_post: Record<string, any> | null;
  /** Current source icon only when that account is this post's author. */
  author_avatar_url?: string | null;
  author: string | null;
  language: string | null;
  story_public_id: string | null;
  story_title: string | null;
  zh_text: string | null;
  /** Chinese translation of the post an X post quotes. */
  quoted_zh: string | null;
  /** English copy for the /en edition, when written from the current Chinese copy. */
  en_title?: string | null;
  en_summary?: string | null;
  en_reason?: string | null;
}

/** What an English copy is written from (editorial/english.ts); a copy of other inputs is not shown. */
export const ENGLISH_ITEM_INPUTS = sql`md5(concat_ws(chr(31), p.title, p.original_title, p.summary, p.reason))`;

/** The titles of the event's other publicly listed reports (the newest five), which the item explainer's
 *  input carries to identify what this report adds; empty when the report has no event. */
export const SIBLING_REPORT_TITLES = sql`(
  SELECT array_agg(x.t) FROM (
    SELECT concat_ws(' | ', s2.name, p2.title) AS t
    FROM publications p2 JOIN sources s2 ON s2.id = p2.source_id
    WHERE p2.story_id = p.story_id AND p2.article_id <> p.article_id
      AND p2.channel = 'news' AND p2.selected AND p2.visibility = 'public'
      AND p2.eligible AND p2.visible_after <= now()
    ORDER BY coalesce(p2.published_at, p2.discovered_at) DESC LIMIT 5
  ) x)`;

/** One eligibility predicate for both paid explanation selection and public rendering.
 * A previously written row must not reappear after selection, release or licence is revoked. */
export const EXPLAINABLE_PUBLICATION = sql`p.channel = 'news' AND p.visibility = 'public' AND p.selected
  AND p.eligible AND p.visible_after <= now() AND p.summary IS NOT NULL
  AND (a.language IN ('zh', 'en') OR a.language IS NULL)`;

/** What an item explanation is written from (editorial/explain.ts): every field buildExplainInput reads —
 *  the site's copy, the licence-gated body, the source, the published time, the language and the event
 *  context — so a correction, a licence change, a language flip or a new sibling report makes the stored
 *  explanation stale (E-03/D-03). The trailing version segment intentionally invalidates EVERY stored
 *  explanation at deploy (both prompts changed 2026-11-01): pages lose the explanation block until the
 *  worker rewrites them (≤10 per 15-min run, newest first, receipted), and rows untouched for >90 days
 *  never re-queue — operators refill those per article via scripts/explain-acceptance.ts --ids. */
export const EXPLAIN_ITEM_INPUTS = sql`md5(concat_ws(chr(31), s.name, p.title, p.original_title, p.summary, p.reason, p.body_mode,
  CASE WHEN p.body_mode = 'full' THEN coalesce(a.body_text, a.excerpt, '') ELSE '' END,
  coalesce(p.published_at, p.discovered_at)::text, coalesce(a.language, ''), coalesce(st.title, ''),
  coalesce((SELECT string_agg(t, chr(31) ORDER BY t) FROM unnest(${SIBLING_REPORT_TITLES}::text[]) AS t), ''),
  'explain-input-2'))`;

/** Columns every item listing selects. Internal judgement details never leave this layer. */
export const ITEM_COLUMNS = sql`
  p.article_id AS id, p.title, p.original_title, p.summary, p.reason, p.category, p.tags, p.score,
  p.selected, p.seat, p.channel, p.url, p.published_at, p.discovered_at, p.timeline_at, p.visibility,
  p.body_mode, p.indexable, p.seo_indexed_at AS curated_at, p.fact_id, s.name AS source_name, s.tier AS source_tier, s.participation_mode AS source_mode,
  a.x_post, a.author, a.language,
  CASE WHEN s.kind = 'x_search' AND ${sourceOwnsPost(sql`s.name`, sql`a.x_post->>'handle'`)} THEN s.icon_url END AS author_avatar_url,
  st.public_id::text AS story_public_id, st.title AS story_title,
  CASE WHEN p.channel = 'x' THEN tr.body_text END AS zh_text, qt.text_zh AS quoted_zh,
  ec.title AS en_title, ec.summary AS en_summary, ec.reason AS en_reason`;

/** Public API listings never render article bodies, X media or story metadata. */
export type ApiItemRow = Pick<ItemRow, "id" | "title" | "original_title" | "summary" | "source_name" | "url" | "published_at" | "discovered_at" | "category" | "score" | "selected" | "reason">;
/** `selected` is the machine meaning: the report holds its fact's selected seat (scope.ts seatedCondition). */
export const API_ITEM_COLUMNS = sql`
  p.article_id AS id, p.title, p.original_title, p.summary, s.name AS source_name, p.url,
  p.published_at, p.discovered_at, p.category, p.score, (p.selected AND p.seat) AS selected, p.reason`;
export const API_ITEM_FROM = sql`FROM publications p JOIN sources s ON s.id = p.source_id`;

/** A translation of an older revision is left out: the original changed after it (the worker translates it again). */
export const ITEM_FROM = sql`
  FROM publications p
  JOIN sources s ON s.id = p.source_id
  JOIN articles a ON a.id = p.article_id
  LEFT JOIN stories st ON st.id = p.story_id AND st.merged_into IS NULL
  LEFT JOIN translations tr ON tr.article_id = p.article_id AND tr.lang = 'zh' AND tr.revision >= a.revision
  LEFT JOIN quote_translations qt ON p.channel = 'x' AND qt.tweet_id = substring(a.x_post->'quoted'->>'url' from '/status/([0-9]+)')
  LEFT JOIN english_copies ec ON ec.article_id = p.article_id AND ec.outcome = 'written' AND ec.inputs_hash = ${ENGLISH_ITEM_INPUTS}`;

export function channelCondition(channel: ChannelKey | null | undefined) {
  if (!channel || channel === "all") return sql``;
  if (channel === "firstParty") return sql`AND p.source_id IN (SELECT id FROM sources WHERE tier = 'T1')`;
  return sql`AND p.channel = ${channel}`;
}

/** The website's filter: one of its own categories. */
export function categoryCondition(category: CategoryKey | null | undefined) {
  if (!category) return sql``;
  return sql`AND p.category = ${category}`;
}

/** The public API's, RSS's and MCP's filter: every category the site publishes as this one (PUBLIC_CATEGORIES). */
export function publicCategoryCondition(category: PublicApiCategoryKey | null | undefined) {
  if (!category) return sql``;
  return sql`AND p.category IN ${sql(CATEGORY_KEYS.filter((k) => toPublicApiCategory(k) === category))}`;
}

export function tagCondition(tag: string | null | undefined) {
  if (!tag) return sql``;
  return sql`AND p.tags @> ${[tag]}::text[]`;
}

function mediaView(m: Record<string, any>, mode: "card" | "thumb" | "full" = "thumb", responsive = false): MediaView | null {
  const url = proxiedImage(m.url, mode);
  if (!url) return null;
  const srcSet = responsive ? proxiedImageSet(m.poster ?? m.url, mode === "full" ? "body" : "card") : null;
  return {
    kind: m.kind === "video" ? "video" : "image",
    url,
    ...(responsive && mode !== "full" ? { fullUrl: proxiedImage(m.url, "full")! } : {}),
    ...(srcSet ? { srcSet } : {}),
    width: typeof m.width === "number" ? m.width : null,
    height: typeof m.height === "number" ? m.height : null,
    alt: m.alt ?? null,
    poster: m.poster ? proxiedImage(m.poster, mode === "card" ? "card" : "thumb") : null,
  };
}

export function xView(row: Pick<ItemRow, "x_post" | "zh_text"> & Partial<Pick<ItemRow, "quoted_zh" | "author_avatar_url">>, compact = false, responsive = compact): XPostView | null {
  const x = row.x_post;
  if (!x) return null;
  const quoted = x.quoted && typeof x.quoted === "object"
    ? {
      authorName: String(x.quoted.authorName ?? ""), handle: String(x.quoted.handle ?? ""), text: String(x.quoted.text ?? ""), url: String(x.quoted.url ?? ""),
      translation: !isEmptyOrLinkOnly(String(x.quoted.text ?? "")) && row.quoted_zh && row.quoted_zh.trim() !== String(x.quoted.text ?? "").trim() ? row.quoted_zh : null,
    }
    : null;
  const media = ((x.media ?? []) as Array<Record<string, any>>)
    .map((raw) => ({ raw, view: mediaView(raw, compact || !responsive ? "thumb" : "full", responsive) }))
    .filter((entry): entry is { raw: Record<string, any>; view: MediaView } => entry.view !== null);
  const avatarUrl = row.author_avatar_url ?? x.avatarUrl;
  const avatarSrcSet = responsive ? proxiedImageSet(avatarUrl, "avatar") : null;
  return {
    authorName: String(x.authorName ?? x.handle ?? ""),
    handle: String(x.handle ?? ""),
    avatarUrl: proxiedImage(avatarUrl, "avatar"),
    ...(avatarSrcSet ? { avatarSrcSet } : {}),
    text: String(x.text ?? ""),
    translation: !isEmptyOrLinkOnly(String(x.text ?? "")) && row.zh_text && row.zh_text.trim() !== String(x.text ?? "").trim() ? row.zh_text : null,
    quoted,
    // A multi-image list grid is 112 CSS px wide; one image can be 240 px. Keep 3x pixels for both.
    // Detail retains full media for the lightbox; srcSet bounds the displayed image.
    media: media.map(({ raw, view }) => compact && media.length > 1 ? mediaView(raw, "card", responsive)! : view),
  };
}

/**
 * Whether pages show an X post's own text and media. A site that counts them as full text shows them
 * only where the source allows full text, as it does an article's body.
 */
export function showsPost(row: { channel: string; body_mode: string }): boolean {
  return row.channel === "x" && (!POLICY.xPostIsFullText || row.body_mode === "full");
}

const PUBLIC_TIER: Record<string, SourceTier> = { T1: "first-party", T1_5: "official-account", T2: "media" };

/** The English copy a row carries, if any. */
export function englishCopy(row: { en_title?: string | null; en_summary?: string | null; en_reason?: string | null; selected?: boolean }): EnglishCopy | null {
  if (!row.en_title || !row.en_summary) return null;
  return { title: row.en_title, summary: row.en_summary, reason: row.selected === false ? null : row.en_reason ?? null };
}

/** The shared public article; its X post is added as each answer shows it. */
export function toItemSummary(row: ItemRow): ItemSummary {
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.original_title,
    summary: row.summary,
    reason: row.selected ? row.reason : null,
    source: { name: publicSourceName(row.source_name), ...(row.source_tier && PUBLIC_TIER[row.source_tier] ? { tier: PUBLIC_TIER[row.source_tier] } : {}) },
    links: { original: row.url },
    publishedAt: row.published_at?.toISOString() ?? null,
    discoveredAt: row.discovered_at.toISOString(),
    timelineAt: row.timeline_at.toISOString(),
    category: (row.category as CategoryKey | null) ?? null,
    tags: displayTags(row.tags),
    score: row.score === null ? null : Math.round(Number(row.score)),
    selected: row.selected,
    channel: row.channel,
    story: row.story_public_id ? { publicId: row.story_public_id, title: row.story_title ?? "" } : null,
    english: englishCopy(row),
  };
}

/** Project the shared public article into the exact fields a site card renders. */
export function toFeedItemSummary(row: ItemRow): FeedItemSummary {
  const item = toItemSummary(row);
  const x = showsPost(row) ? xView(row, true) : null;
  return {
    id: item.id, title: item.title, originalTitle: item.originalTitle, summary: item.summary ?? (x?.text || null), reason: item.reason,
    source: item.source, links: item.links, publishedAt: item.publishedAt, timelineAt: item.timelineAt,
    category: item.category, tags: item.tags, score: item.score, selected: item.selected, channel: item.channel,
    english: item.english,
    x: x ? {
      authorName: x.authorName, handle: x.handle, text: x.text, avatarUrl: x.avatarUrl,
      ...(x.avatarSrcSet ? { avatarSrcSet: x.avatarSrcSet } : {}), media: x.media,
      quoted: x.quoted ? { authorName: x.quoted.authorName, handle: x.quoted.handle, text: x.quoted.text, translation: x.quoted.translation } : null,
    } : null,
  };
}

/**
 * An article written in Chinese: its language says so, or its text opens in Chinese and it is not marked
 * English (the translator's rule, editorial/translate.ts). Every exit shows such a body as it is.
 */
export function isChineseBody(a: { language?: string | null; body_text?: string | null }): boolean {
  return a.language === "zh" || (/[一-鿿]/.test(a.body_text?.slice(0, 400) ?? "") && a.language !== "en");
}

/** The complete Chinese translation an export (Markdown, full RSS) carries; a page also shows a partial one. */
export function exportTranslation(a: { language?: string | null; body_text?: string | null; tr_html?: string | null; tr_complete?: boolean | null }): string | null {
  return !isChineseBody(a) && a.tr_html && a.tr_complete ? a.tr_html : null;
}

/**
 * For listed rows that are selected but yield their fact's seat: the report holding it, by row id.
 * (The home timeline folds these into reading groups; flat lists say which report stands for them.)
 */
export async function seatHolders(rows: ItemRow[], now: Date, db: Db = sql): Promise<Map<string, { id: string; title: string }>> {
  const yielding = rows.filter((r) => r.selected && !r.seat && r.fact_id !== null);
  if (!yielding.length) return new Map();
  const holders = await db<{ fact_id: number; id: string; title: string }[]>`
    SELECT p.fact_id, p.article_id AS id, p.title FROM publications p
    WHERE p.fact_id IN ${db([...new Set(yielding.map((r) => r.fact_id!))])} AND ${seatedCondition(now)} AND ${foldableSelectionCondition()}`;
  const byFact = new Map(holders.map((h) => [Number(h.fact_id), { id: h.id, title: h.title }]));
  return new Map(yielding.flatMap((r) => (byFact.has(Number(r.fact_id)) ? [[r.id, byFact.get(Number(r.fact_id))!] as const] : [])));
}
