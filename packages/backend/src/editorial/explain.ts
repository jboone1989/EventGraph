// Worker-only 5W1H explainer (approved news-explainer D-01–D-04).
// Input hashes hide stale explanations; malformed answers retry, ambiguous paid receipts never re-send.
// New reports first, with no age cutoff for unexplained reports.
import { z } from "zod";
import { sql } from "../db.ts";
import { chatJson, ModelOutputError } from "../providers/llm.ts";
import { completeReceipt, ReceiptBusyError, ReceiptUnknownError } from "../providers/receipts.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { EXPLAINABLE_PUBLICATION, EXPLAIN_ITEM_INPUTS, SIBLING_REPORT_TITLES } from "../publication/items.ts";
import { modelFor } from "./models.ts";
import { promptText, promptVersion } from "./prompts.ts";

const MAX_ATTEMPTS = 3;
const EXCERPT_CHARS = 4000;

/** The language an explanation is written in: the report's own (D-01). `zh`/`en` say so; an unmarked
 *  report is read from its own title; other languages stay unexplained in this phase. */
export function explainLanguage(r: { language: string | null; original_title: string | null; title: string }): "zh" | "en" | null {
  if (r.language === "en") return "en";
  if (r.language === "zh") return "zh";
  if (r.language) return null;
  return /[一-鿿]/.test(r.original_title ?? r.title) ? "zh" : "en";
}

const PROMPT = { zh: "news-explainer", en: "news-explainer-en" } as const;
const promptFor = (language: "zh" | "en") => PROMPT[language];
export const explainPromptVersion = (language: "zh" | "en") => promptVersion(promptFor(language));

// A watchpoint date must be a full calendar date that exists (D-04: 2026-02-30 is not a date); one the
// source does not state in full becomes null (the wording keeps its own date expression in text).
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => { const [y, m, day] = d.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, day)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day; })
  .nullish().catch(null);
const noChinese = (value: string) => !/[㐀-鿿]/u.test(value);
const line = (max: number, english = false) => {
  const value = z.string().trim().max(max);
  return (english ? value.refine(noChinese, "contains Chinese characters") : value)
    .transform((s) => s || null).nullish();
};
// Reject Chinese characters in EVERY English field, including watchpoint text; prompt language
// alone is not a guarantee. Invalid model answers follow the existing shape-retry receipt path.
const explainSchema = (english: boolean) => z.object({
  who: line(240, english),
  what: line(500, english),
  when: line(160, english),
  where: line(200, english),
  why: line(500, english),
  how: line(500, english),
  soWhat: line(900, english),
  watchpoints: z.array(z.object({
    text: english ? z.string().trim().min(4).max(240).refine(noChinese, "contains Chinese characters")
      : z.string().trim().min(4).max(240),
    date: calendarDate,
  })).max(3).default([]),
});
export const ExplainSchema = explainSchema(false);
export const EnglishExplainSchema = explainSchema(true);

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");

/** Every full calendar date the source text itself states, as ISO dates: numeric (2026-11-05, 2026/11/05,
 *  2026年11月5日) and English month forms (November 5, 2026 / 5 November 2026 / Nov 5, 2026). Month-only,
 *  quarter or relative dates are deliberately absent. */
export function fullDatesIn(text: string): Set<string> {
  const dates = new Set<string>();
  const add = (y: number, m: number, d: number) => { if (y >= 1000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) dates.add(`${y}-${pad(m)}-${pad(d)}`); };
  for (const m of text.matchAll(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g)) add(Number(m[1]), Number(m[2]), Number(m[3]));
  for (const m of text.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日/g)) add(Number(m[1]), Number(m[2]), Number(m[3]));
  for (const m of text.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi)) {
    const month = MONTHS[m[1]!.toLowerCase().slice(0, 3)]; if (month) add(Number(m[3]), month, Number(m[2]));
  }
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})\b/gi)) {
    const month = MONTHS[m[2]!.toLowerCase().slice(0, 3)]; if (month) add(Number(m[3]), month, Number(m[1]));
  }
  return dates;
}

/** D-04: dates require the original title/licensed body, never site copy or event context. */
function groundWatchpoints(data: z.infer<typeof ExplainSchema>, material: string): z.infer<typeof ExplainSchema> {
  const supported = fullDatesIn(material);
  return { ...data, watchpoints: data.watchpoints.map((w) => ({ ...w, date: w.date && supported.has(w.date) ? w.date : null })) };
}

export function buildExplainInput(r: {
  source_name: string; original_title: string | null; title: string; summary: string | null; reason: string | null;
  text: string | null; published_at: Date | null; story_title: string | null; other_reports: string[] | null;
}) {
  return JSON.stringify({
    source: r.source_name,
    originalTitle: r.original_title,
    originalText: r.text ? r.text.replace(/\s+/g, " ").trim().slice(0, EXCERPT_CHARS) : null,
    publishedAt: r.published_at?.toISOString() ?? null,
    chineseTitle: r.title,
    chineseSummary: r.summary,
    chineseReason: r.reason,
    storyTitle: r.story_title,
    otherReportTitles: r.other_reports ?? [],
  });
}

/** A report awaiting an explanation, with everything its input is built from. */
export interface ExplainCandidate {
  article_id: string; url: string; hash: string; attempts: number | null; language: string | null;
  source_name: string; original_title: string | null; title: string; summary: string | null; reason: string | null;
  text: string | null; published_at: Date | null; story_title: string | null; other_reports: string[] | null;
}

const candidateColumns = sql`p.article_id, p.url, ${EXPLAIN_ITEM_INPUTS} AS hash, ie.attempts, a.language, s.name AS source_name,
  p.original_title, p.title, p.summary, p.reason,
  CASE WHEN p.body_mode = 'full' THEN coalesce(a.body_text, a.excerpt) END AS text, p.published_at, st.title AS story_title,
  ${SIBLING_REPORT_TITLES} AS other_reports`;

// Re-check stored hashes only for recently touched reports/stories or a changed source name.
// Routine source fetches bump sources.updated_at; they must not rehash the entire history.
// Never put an age cutoff on the *unexplained* backlog (D-02).
/** Select cheap candidate IDs first, then build full, licence-gated inputs for at most the run limit.
 * The MATERIALIZED limit barrier is intentional: a full-body md5 and correlated sibling lookup
 * must not be evaluated in the SELECT list for the entire eligible historical backlog. */
export async function explanationsPending(opts: { limit?: number } = {}): Promise<ExplainCandidate[]> {
  return sql<ExplainCandidate[]>`
    WITH pending AS MATERIALIZED (
      SELECT p.article_id, p.discovered_at
      FROM publications p
      JOIN sources s ON s.id = p.source_id
      JOIN articles a ON a.id = p.article_id
      LEFT JOIN stories st ON st.id = p.story_id AND st.merged_into IS NULL
      LEFT JOIN item_explanations ie ON ie.article_id = p.article_id
      WHERE ${EXPLAINABLE_PUBLICATION}
        AND (ie.article_id IS NULL OR (ie.outcome = 'failed' AND ie.attempts < ${MAX_ATTEMPTS})
          OR CASE WHEN p.discovered_at > now() - interval '90 days'
                   OR p.updated_at > now() - interval '90 days'
                   OR a.updated_at > now() - interval '90 days'
                   OR ie.updated_at > now() - interval '90 days'
                   OR (st.updated_at > now() - interval '90 days' AND st.updated_at > ie.updated_at)
                   OR ie.source_name IS DISTINCT FROM s.name
               THEN ie.inputs_hash <> ${EXPLAIN_ITEM_INPUTS}
               ELSE false END)
      ORDER BY p.discovered_at DESC, p.article_id LIMIT ${opts.limit ?? 10}
    )
    SELECT ${candidateColumns}
    FROM pending chosen
    JOIN publications p ON p.article_id = chosen.article_id
    JOIN sources s ON s.id = p.source_id
    JOIN articles a ON a.id = p.article_id
    LEFT JOIN stories st ON st.id = p.story_id AND st.merged_into IS NULL
    LEFT JOIN item_explanations ie ON ie.article_id = p.article_id
    ORDER BY chosen.discovered_at DESC, p.article_id`;
}

/** One report by id, whatever state its explanation is in: the acceptance harness runs fixed samples this way. */
export async function explanationCandidateFor(articleId: string): Promise<ExplainCandidate | null> {
  const [row] = await sql<ExplainCandidate[]>`
    SELECT ${candidateColumns}
    FROM publications p
    JOIN sources s ON s.id = p.source_id
    JOIN articles a ON a.id = p.article_id
    LEFT JOIN stories st ON st.id = p.story_id AND st.merged_into IS NULL
    LEFT JOIN item_explanations ie ON ie.article_id = p.article_id
    WHERE p.article_id = ${articleId} AND ${EXPLAINABLE_PUBLICATION}`;
  return row ?? null;
}

export type ExplainOutcome =
  | { outcome: "written" | "insufficient_evidence"; receiptId: number; language: "zh" | "en" }
  | { outcome: "failed"; error: string; receiptId: number | null }
  | { outcome: "halted" | "skipped"; error: string };

/** Explains one report: a paid model call whose answer is grounded and stored, an identifiable
 *  insufficient-evidence record, or a shape failure that leaves its receipt failed. Transport-level
 *  errors halt the caller without touching the report's retries. */
export async function explainOne(r: ExplainCandidate): Promise<ExplainOutcome> {
  const language = explainLanguage(r);
  if (!language) return { outcome: "skipped", error: `report language ${r.language ?? "unknown"} is not explained in this phase` };
  const prompt = promptFor(language);
  const input = buildExplainInput(r);
  try {
    const res = await chatJson({
      model: await modelFor("explain"), purpose: "explain_item", subject: `article:${r.article_id}#${r.hash.slice(0, 8)}`,
      promptVersion: explainPromptVersion(language), system: promptText(prompt), user: input, schema: language === "en" ? EnglishExplainSchema : ExplainSchema,
      temperature: 0.2, maxTokens: 4096, attemptTag: r.attempts ? `retry-${r.attempts}` : undefined,
    });
    const data = groundWatchpoints(res.data, [r.original_title, r.text].filter(Boolean).join("\n"));
    // D-03: an answer with nothing supportable is an explicit, receipted insufficient-evidence record,
    // not a written explanation and not a silent skip.
    const empty = !data.who && !data.what && !data.when && !data.where && !data.why && !data.how && !data.soWhat && data.watchpoints.length === 0;
    const outcome = empty ? "insufficient_evidence" : "written";
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO item_explanations (article_id, inputs_hash, language, source_name, outcome, attempts, content, error, receipt_id, updated_at)
        VALUES (${r.article_id}, ${r.hash}, ${language}, ${r.source_name}, ${outcome}, 1, ${empty ? null : tx.json(data as never)}, ${empty ? "no field supported by the source: 5W1H, so-what and watchpoints all empty" : null}, ${res.receiptId}, now())
        ON CONFLICT (article_id) DO UPDATE SET inputs_hash = EXCLUDED.inputs_hash, language = EXCLUDED.language, source_name = EXCLUDED.source_name, outcome = EXCLUDED.outcome, attempts = 1,
          content = EXCLUDED.content, error = EXCLUDED.error, receipt_id = EXCLUDED.receipt_id, updated_at = now()`;
      await completeReceipt(tx, res.receiptId);
    });
    return { outcome, receiptId: res.receiptId, language };
  } catch (error) {
    // Only a malformed model answer consumes one of the three shape retries.
    // Provider outages, rate limits and unknown receipt outcomes must not exhaust an article.
    // An ambiguous paid receipt is sticky for this report, not a reason to starve older reports.
    // Keep its receipt for operator verification; never re-send or count a shape failure.
    if (error instanceof ReceiptUnknownError || error instanceof ReceiptBusyError)
      return { outcome: "skipped", error: String(error.message) };
    if (!(error instanceof ModelOutputError)) return { outcome: "halted", error: String((error as Error).message ?? error) };
    await recordFailure(r.article_id, r.hash, language, r.source_name, error);
    return { outcome: "failed", error: String((error as Error).message ?? error).slice(0, 300), receiptId: null };
  }
}

/** Every quarter hour: explanations for selected news reports, newest first, within a time budget. */
export async function writeExplanationsPending(opts: { limit?: number; budgetMs?: number } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 4 * 60_000);
  const rows = await explanationsPending(opts);
  let written = 0, failed = 0;
  for (const r of rows) {
    if (Date.now() > deadline || shutdownSignal.signal.aborted) return { written, failed, stopped: true };
    const res = await explainOne(r);
    if (res.outcome === "halted") return { written, failed, stopped: true };
    if (res.outcome === "failed") failed++;
    else if (res.outcome === "written" || res.outcome === "insufficient_evidence") written++;
  }
  return { written, failed, stopped: false };
}

/** A failed attempt; a written explanation of the same input stays as it is, a different input starts counting again. */
async function recordFailure(id: string, hash: string, language: "zh" | "en", sourceName: string, error: unknown) {
  const message = String((error as Error).message ?? error).slice(0, 300);
  await sql`
    INSERT INTO item_explanations (article_id, inputs_hash, language, source_name, outcome, attempts, content, error, updated_at) VALUES (${id}, ${hash}, ${language}, ${sourceName}, 'failed', 1, NULL, ${message}, now())
    ON CONFLICT (article_id) DO UPDATE SET
      attempts = CASE WHEN item_explanations.inputs_hash = EXCLUDED.inputs_hash AND item_explanations.outcome = 'failed' THEN item_explanations.attempts + 1 ELSE 1 END,
      outcome = 'failed', inputs_hash = EXCLUDED.inputs_hash, source_name = EXCLUDED.source_name, content = NULL, error = EXCLUDED.error, updated_at = now()`;
}
