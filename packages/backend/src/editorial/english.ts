// English copy for the /en edition: a selected report's English title, summary and "why it matters", and a
// story's English title and digest. Written by the worker from the Chinese copy plus the publisher's own
// title and opening text; a page read never writes. Each copy records the hash of the Chinese copy it was
// written from (publication/items.ts ENGLISH_ITEM_INPUTS, publication/stories.ts ENGLISH_STORY_INPUTS),
// so a corrected Chinese copy hides the English one until it is written again. An answer with Chinese
// characters or the wrong shape fails the schema, which leaves its receipt failed so a retry pays for a
// fresh one; a report or story stops after three failures of the same input.
import { z } from "zod";
import { sql } from "../db.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { ENGLISH_ITEM_INPUTS } from "../publication/items.ts";
import { ENGLISH_STORY_INPUTS } from "../publication/story-text.ts";
import { modelFor } from "./models.ts";
import { promptText, promptVersion } from "./prompts.ts";

export const ENGLISH_COPY_PROMPT_VERSION = promptVersion("english-copy");
export const ENGLISH_DIGEST_PROMPT_VERSION = promptVersion("english-digest");
const COPY_SYSTEM = promptText("english-copy");
const DIGEST_SYSTEM = promptText("english-digest");

/** Recent work only: older reports and stories are rarely read and are not written back in bulk. */
const WINDOW = sql`interval '90 days'`;
const MAX_ATTEMPTS = 3;
const EXCERPT_CHARS = 3000;

const english = (max: number) => z.string().trim().max(max).refine((s) => !/[㐀-鿿]/u.test(s), "contains Chinese characters");
export const EnglishCopySchema = z.object({ title: english(160).pipe(z.string().min(8)), summary: english(1200).pipe(z.string().min(40)), reason: english(600).catch("") });
export const EnglishDigestSchema = z.object({ title: english(140).pipe(z.string().min(8)), digest: english(2400).pipe(z.string().min(40)) });

/** Switched-off model calls, a missing model or an exhausted budget end the run without counting an attempt. */
const stopsRun = (error: unknown) => /disabled|not configured|budget/i.test((error as Error).message);

export function buildEnglishCopyInput(r: { source_name: string; original_title: string | null; title: string; summary: string | null; reason: string | null; text: string | null }) {
  return JSON.stringify({
    source: r.source_name,
    originalTitle: r.original_title,
    originalText: r.text ? r.text.replace(/\s+/g, " ").trim().slice(0, EXCERPT_CHARS) : null,
    chineseTitle: r.title,
    chineseSummary: r.summary,
    chineseReason: r.reason,
  });
}

async function writeItems(deadline: number, limit: number): Promise<{ written: number; failed: number; stopped: boolean }> {
  const rows = await sql<{ article_id: string; hash: string; attempts: number | null; source_name: string; original_title: string | null; title: string; summary: string | null; reason: string | null; text: string | null }[]>`
    SELECT p.article_id, ${ENGLISH_ITEM_INPUTS} AS hash, ec.attempts, s.name AS source_name, p.original_title, p.title, p.summary, p.reason,
           coalesce(a.body_text, a.excerpt) AS text
    FROM publications p JOIN sources s ON s.id = p.source_id JOIN articles a ON a.id = p.article_id
    LEFT JOIN english_copies ec ON ec.article_id = p.article_id
    WHERE p.selected AND p.visibility = 'public' AND p.summary IS NOT NULL AND p.discovered_at > now() - ${WINDOW}
      AND (ec.article_id IS NULL OR ec.inputs_hash <> ${ENGLISH_ITEM_INPUTS} OR (ec.outcome = 'failed' AND ec.attempts < ${MAX_ATTEMPTS}))
    ORDER BY p.discovered_at DESC LIMIT ${limit}`;
  let written = 0, failed = 0;
  for (const r of rows) {
    if (Date.now() > deadline || shutdownSignal.signal.aborted) return { written, failed, stopped: true };
    const retry = r.attempts !== null ? r.attempts : 0;
    try {
      const res = await chatJson({
        model: await modelFor("english"), purpose: "english_copy", subject: `article:${r.article_id}#${r.hash.slice(0, 8)}`,
        promptVersion: ENGLISH_COPY_PROMPT_VERSION, system: COPY_SYSTEM, user: buildEnglishCopyInput(r), schema: EnglishCopySchema,
        temperature: 0.3, maxTokens: 4096, attemptTag: retry ? `retry-${retry}` : undefined,
      });
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO english_copies (article_id, inputs_hash, outcome, attempts, title, summary, reason, error, receipt_id, updated_at)
          VALUES (${r.article_id}, ${r.hash}, 'written', 1, ${res.data.title}, ${res.data.summary}, ${r.reason ? res.data.reason || null : null}, NULL, ${res.receiptId}, now())
          ON CONFLICT (article_id) DO UPDATE SET inputs_hash = EXCLUDED.inputs_hash, outcome = 'written', attempts = 1, title = EXCLUDED.title,
            summary = EXCLUDED.summary, reason = EXCLUDED.reason, error = NULL, receipt_id = EXCLUDED.receipt_id, updated_at = now()`;
        await completeReceipt(tx, res.receiptId);
      });
      written++;
    } catch (error) {
      if (stopsRun(error)) return { written, failed, stopped: true };
      await recordFailure("english_copies", "article_id", r.article_id, r.hash, error);
      failed++;
    }
  }
  return { written, failed, stopped: false };
}

async function writeStories(deadline: number, limit: number): Promise<{ written: number; failed: number }> {
  const rows = await sql<{ id: number; hash: string; attempts: number | null; title: string; digest: string; titles: string[] | null }[]>`
    SELECT st.id, ${ENGLISH_STORY_INPUTS} AS hash, se.attempts, st.title, st.digest,
           (SELECT array_agg(DISTINCT concat_ws(' | ', s.name, p.original_title)) FROM publications p JOIN sources s ON s.id = p.source_id
            WHERE p.story_id = st.id AND p.visibility = 'public' AND p.original_title IS NOT NULL) AS titles
    FROM stories st LEFT JOIN story_english se ON se.story_id = st.id
    WHERE st.merged_into IS NULL AND st.digest IS NOT NULL AND st.latest_at > now() - ${WINDOW}
      AND (se.story_id IS NULL OR se.inputs_hash <> ${ENGLISH_STORY_INPUTS} OR (se.outcome = 'failed' AND se.attempts < ${MAX_ATTEMPTS}))
    ORDER BY st.latest_at DESC LIMIT ${limit}`;
  let written = 0, failed = 0;
  for (const r of rows) {
    if (Date.now() > deadline || shutdownSignal.signal.aborted) break;
    const retry = r.attempts !== null ? r.attempts : 0;
    try {
      const res = await chatJson({
        model: await modelFor("english"), purpose: "english_digest", subject: `story:${r.id}#${r.hash.slice(0, 8)}`,
        promptVersion: ENGLISH_DIGEST_PROMPT_VERSION, system: DIGEST_SYSTEM,
        user: JSON.stringify({ chineseTitle: r.title, chineseDigest: r.digest, reports: (r.titles ?? []).slice(0, 30) }),
        schema: EnglishDigestSchema, temperature: 0.3, maxTokens: 8192, attemptTag: retry ? `retry-${retry}` : undefined,
      });
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO story_english (story_id, inputs_hash, outcome, attempts, title, digest, error, receipt_id, updated_at)
          VALUES (${r.id}, ${r.hash}, 'written', 1, ${res.data.title}, ${res.data.digest}, NULL, ${res.receiptId}, now())
          ON CONFLICT (story_id) DO UPDATE SET inputs_hash = EXCLUDED.inputs_hash, outcome = 'written', attempts = 1, title = EXCLUDED.title,
            digest = EXCLUDED.digest, error = NULL, receipt_id = EXCLUDED.receipt_id, updated_at = now()`;
        await completeReceipt(tx, res.receiptId);
      });
      written++;
    } catch (error) {
      if (stopsRun(error)) break;
      await recordFailure("story_english", "story_id", r.id, r.hash, error);
      failed++;
    }
  }
  return { written, failed };
}

/** A failed attempt; a written copy of the same input stays as it is, a different input starts counting again. */
async function recordFailure(tableName: "english_copies" | "story_english", keyName: "article_id" | "story_id", id: string | number, hash: string, error: unknown) {
  const message = String((error as Error).message ?? error).slice(0, 300);
  const table = sql(tableName), key = sql(keyName);
  await sql`
    INSERT INTO ${table} (${key}, inputs_hash, outcome, attempts, error, updated_at) VALUES (${id}, ${hash}, 'failed', 1, ${message}, now())
    ON CONFLICT (${key}) DO UPDATE SET
      attempts = CASE WHEN ${table}.inputs_hash = EXCLUDED.inputs_hash AND ${table}.outcome = 'failed' THEN ${table}.attempts + 1 ELSE 1 END,
      outcome = 'failed', inputs_hash = EXCLUDED.inputs_hash, title = NULL, error = EXCLUDED.error, updated_at = now()`;
}

/** Every few minutes: English copy for selected reports, then English digests for stories, newest first, within a time budget. */
export async function writeEnglishPending(opts: { limit?: number; budgetMs?: number } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 4 * 60_000);
  const items = await writeItems(deadline, opts.limit ?? 30);
  const stories = items.stopped ? { written: 0, failed: 0 } : await writeStories(deadline, opts.limit ?? 30);
  return { items: { written: items.written, failed: items.failed }, stories };
}
