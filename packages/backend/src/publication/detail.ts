// Item detail and Markdown export, both behind the same visibility and licence rules.
import type { ItemExplanation, SiteItemDetail, StoryRef } from "@aihot/contracts/site";
import { ITEM_COPY, SITE } from "@aihot/site";
import { sql } from "../db.ts";
import { EXPLAINABLE_PUBLICATION, EXPLAIN_ITEM_INPUTS, ITEM_COLUMNS, ITEM_FROM, seatHolders, showsPost, toItemSummary, xView, type ItemRow } from "./items.ts";
import { storyContextFor } from "./stories.ts";
import { evidenceCondition, listedCondition } from "./scope.ts";
import { itemUrl } from "./links.ts";
import { hasItemPage, publicSourceName } from "./rules.ts";
import { topicLinks, topicMembership } from "./topics.ts";

interface DetailRow extends ItemRow {
  body_html: string | null;
  body_text: string | null;
  body_status: string;
  tr_html: string | null;
  tr_complete: boolean | null;
  en_tr_html: string | null;
  en_tr_complete: boolean | null;
  topics: string[];
  story_id: number | null;
  explanation: ItemExplanation | null;
}

export type DetailResult =
  | { kind: "found"; item: SiteItemDetail; row: DetailRow }
  | { kind: "not_found" };

/** An English page is indexed when its report is one of several on its event: the page then has an event to stand in. */

/** Use the saved bilingual analysis on any public report; legacy receipts remain source-language only. */
async function loadRow(id: string, language: "zh" | "original" = "zh", explanationLanguage: "zh" | "en" = language === "original" ? "en" : "zh"): Promise<DetailRow | null> {
  const [row] = await sql<DetailRow[]>`
    SELECT ${ITEM_COLUMNS}, a.body_html, a.body_text, a.body_status, tr.body_html AS tr_html, tr.complete AS tr_complete,
      en_tr.body_html AS en_tr_html, en_tr.complete AS en_tr_complete,
      st.id AS story_id, ${topicMembership()} AS topics,
      CASE WHEN p.channel = 'news' AND p.visibility = 'public' AND p.summary IS NOT NULL
        AND (NOT p.selected OR p.visible_after <= now())
        THEN coalesce(
          CASE WHEN NOT EXISTS (
            SELECT 1 FROM editorial_overrides eo WHERE eo.article_id = p.article_id
              AND eo.fields ?| ARRAY['title','summary','reason']
          ) THEN CASE WHEN ${explanationLanguage} = 'en'
            THEN coalesce(
              an.output->'explanationEn',
              CASE WHEN a.language = 'en' OR (a.language IS NULL AND a.title !~ '[一-龥]')
                THEN an.output->'explanation' END
            )
            ELSE coalesce(
              an.output->'explanationZh',
              CASE WHEN a.language = 'zh' OR (a.language IS NULL AND a.title ~ '[一-龥]')
                THEN an.output->'explanation' END
            )
          END END,
          ie.content
        )
        ELSE NULL END AS explanation
    ${ITEM_FROM}
    LEFT JOIN translations en_tr ON en_tr.article_id = p.article_id AND en_tr.lang = 'en' AND en_tr.revision >= a.revision
    LEFT JOIN analyses an ON an.id = p.analysis_id
    LEFT JOIN item_explanations ie ON ie.article_id = p.article_id AND ie.outcome = 'written' AND ie.inputs_hash = ${EXPLAIN_ITEM_INPUTS} AND ${EXPLAINABLE_PUBLICATION}
      AND ie.language = ${explanationLanguage}
    WHERE p.article_id = ${id}`;
  return row ?? null;
}

/** The explanation the page shows: the one written for this page's language (D-01) whose fields say
 *  something; an insufficient-evidence record (the source says little) is kept in the table so it is not
 *  asked again, and shows nothing. */
function shownExplanation(content: ItemExplanation | null): ItemExplanation | null {
  if (!content) return null;
  // Older single-language JSON rows may predate watchpoints being a required array.
  const normalized = { ...content, watchpoints: Array.isArray(content.watchpoints) ? content.watchpoints : [] };
  return normalized.who || normalized.what || normalized.when || normalized.where || normalized.why || normalized.how || normalized.soWhat || normalized.watchpoints.length > 0 ? normalized : null;
}

/**
 * Public detail (rules.hasItemPage) in one language, Chinese unless the original is asked for: items the
 * lists leave out (low relevance, merged duplicates, no Chinese summary yet) keep a noindex page;
 * withdrawn and hot_signal items are a 404.
 */
export async function loadItemDetail(id: string, language: "zh" | "original" = "zh", now = new Date(), explanationLanguage: "zh" | "en" = language === "original" ? "en" : "zh"): Promise<DetailResult> {
  const row = await loadRow(id, language, explanationLanguage);
  if (!row || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return { kind: "not_found" };

  const summary = toItemSummary(row);
  if (row.visibility === "summary-only") {
    const item: SiteItemDetail = {
      ...summary,
      selected: false,
      score: null,
      category: null,
      story: null,
      reason: null,
      tags: [],
      x: null,
      readingMode: "summary-only",
      author: null,
      body: null,
      outline: [],
      relatedStories: [],
      topics: [],
      indexable: false,
      curatedAt: null,
      englishIndexable: false,
      markdownAvailable: false,
      group: null,
      storyContext: null,
      explanation: null,
      hasTranslation: false,
      bodyLanguage: "original",
    };
    return { kind: "found", item, row };
  }

  const related = await sql<StoryRef[]>`
    SELECT DISTINCT st.public_id::text AS "publicId", st.title
    FROM fact_articles fa JOIN facts f ON f.id = fa.fact_id JOIN stories st ON st.id = f.story_id
    WHERE fa.article_id = ${id} AND fa.role <> 'mention' AND st.merged_into IS NULL
    ORDER BY "publicId" LIMIT 6`;

  // The article body is retained for analysis, but aggregator pages link to the publisher for full text.
  let x: SiteItemDetail["x"] = null;
  const reading: Pick<SiteItemDetail, "body" | "outline" | "hasTranslation" | "bodyLanguage"> =
    { body: null, outline: [], hasTranslation: false, bodyLanguage: "original" };
  if (showsPost(row)) {
    const post = xView(row, false, true);
    if (post) {
      const { text: _text, translation: _translation, ...shown } = post;
      x = { ...shown, quoted: shown.quoted ? { ...shown.quoted, translation: null } : null };
    }
  }

  let group: SiteItemDetail["group"] = null;
  if (row.fact_id) {
    const [g] = await sql<{ public_id: string; reports: number; sources: number }[]>`
      SELECT f.public_id, count(p.article_id) AS reports, count(DISTINCT p.source_id) AS sources
      FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      WHERE f.id = ${row.fact_id} AND ${evidenceCondition()} AND ${listedCondition(now)}
      GROUP BY f.public_id`;
    if (g) {
      group = {
        factId: g.public_id,
        reportCount: Number(g.reports),
        additionalSourceCount: Math.max(0, Number(g.sources) - 1),
      };
    }
  }

  // The reason goes with the seat; a report yielding it points to the one holding it.
  const sameEvent = (await seatHolders([row], now)).get(row.id) ?? null;
  const item: SiteItemDetail = {
    ...summary,
    x,
    ...(sameEvent ? { reason: null, sameEvent } : {}),
    readingMode: "full",
    author: row.author,
    body: reading.body,
    outline: reading.outline,
    relatedStories: related,
    topics: topicLinks(row.topics),
    indexable: row.indexable,
    // FR-001/FR-002: the editor's index mark is shown on the page as the curation date.
    curatedAt: row.curated_at?.toISOString() ?? null,
    // English pages with their own current translated copy may appear in search even for single-report events.
    englishIndexable: row.indexable && !!row.en_title,
    markdownAvailable: markdownAvailable(row),
    group,
    storyContext: row.story_id ? await storyContextFor(row.story_id, now) : null,
    explanation: shownExplanation(row.explanation),
    hasTranslation: reading.hasTranslation,
    englishBodyTranslated: false,
    bodyLanguage: reading.bodyLanguage,
  };
  return { kind: "found", item, row };
}

/**
 * Same predicate for the export button and the export route: a public page with something to export
 * (a summary, the post where pages show it, or a full-text body).
 */
export function markdownAvailable(row: {
  visibility: string; source_mode: string; summary: string | null; body_mode: string; body_html?: string | null; channel: string; x_post: Record<string, any> | null;
}): boolean {
  if (row.visibility !== "public" || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return false;
  return !!row.summary;
}

export async function exportMarkdown(id: string): Promise<{ filename: string; body: string } | null> {
  const row = await loadRow(id);
  if (!row || !markdownAvailable(row)) return null;
  const lines: string[] = [];
  lines.push(`# ${row.title}`, "");
  if (row.original_title) lines.push(`> 原标题：${row.original_title}`, "");
  lines.push(`- 来源：${publicSourceName(row.source_name)}`);
  // Without a reliable date from the original, the time it was collected says so.
  lines.push(row.published_at ? `- 发布时间：${row.published_at.toISOString()}` : `- 收录时间：${row.discovered_at.toISOString()}`);
  lines.push(`- ${SITE.name}：${itemUrl(row.id)}`);
  lines.push(`- 原文：${row.url}`, "");
  if (row.summary) lines.push("## 摘要", "", row.summary, "");
  if (row.selected && row.seat && row.reason) lines.push(`## ${ITEM_COPY.reasonLabel}`, "", row.reason, "");
  // Full text, translated bodies and quoted posts stay with the original publishers.
  return { filename: `${SITE.mcpPrefix}-${row.id}.md`, body: lines.join("\n").replace(/\n{3,}/g, "\n\n") };
}
