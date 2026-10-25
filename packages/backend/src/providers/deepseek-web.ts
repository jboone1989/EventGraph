// DeepSeek Search/Fetch tools (api.deepseek.com/v1/tools): low-cost discovery and page reading for
// topics whose sources have no feed and no stable listing to crawl. Paid per successful request —
// always behind receipts and the deepseek_web budget (any zero stops it); DeepSeek does not bill
// failed requests or empty search results. The API key uses the same models credentials group as the model presets; it never
// reaches a source config, the database or a log line.
import { credential } from "../config.ts";
import { sql } from "../db.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { assertAccepted, BudgetExceededError, paidRequest, ProviderRejectedError } from "./receipts.ts";

/** Receipts permit unlimited calls when a service budget row is missing; paid web tools must not. */
async function requireWebBudget(): Promise<void> {
  const [row] = await sql<{ per_minute: number; per_hour: number; per_day: number }[]>`
    SELECT per_minute, per_hour, per_day FROM budgets WHERE service = 'deepseek_web'`;
  if (!row || row.per_minute <= 0 || row.per_hour <= 0 || row.per_day <= 0) {
    throw new BudgetExceededError("deepseek_web", "stopped", 3600);
  }
}

function apiKey(): string {
  const key = credential("models", "DEEPSEEK_API_KEY");
  if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");
  return key;
}

/** The API root; the same env the deepseek model presets read. Tests point it at a local stub. */
function apiBase(): string {
  return (credential("models", "DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com/v1").replace(/\/+$/, "");
}

export interface DeepSeekResult {
  url: string;
  title: string;
  snippet: string;
  summary: string;
  date: string | null;
  site_name: string | null;
  authority: number;
  rerank_score: number;
}

/** ¥5 per 1,000 successful requests (≈ $0.75); an estimate recorded per successful call. */
const COST_PER_CALL = { amount: 0.005, currency: "CNY", basis: "estimated" as const };

/** A 15-minute window: a crashed run's retry or an admin preview inside it reuses the paid answer. */
const windowBucket = () => Math.floor(Date.now() / (15 * 60_000));

/**
 * One web search (query operators pass through: `site:`, `-site:`, `lang:`, `after:`, `before:`).
 * HTTP 401/402/403/404 are refusals. Search failures follow existing receipt retry policy;
 * Fetch caches deterministic refusals for the day to avoid repeated requests.
 */
export async function deepseekSearch(query: string, opts: { purpose: string; subject: string; count?: number }): Promise<DeepSeekResult[]> {
  await requireWebBudget();
  const count = Math.min(Math.max(Math.trunc(opts.count ?? 10), 1), 50);
  const receipt = await paidRequest(
    { service: "deepseek_web", model: null, purpose: opts.purpose, subject: opts.subject,
      identity: { query, count, window: windowBucket() }, requestSummary: { query, count } },
    async () => {
      const res = await guardedFetch(`${apiBase()}/tools/search`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ query, count }),
        timeoutMs: 30_000,
      });
      const text = res.text();
      assertAccepted("deepseek_search", res.status, text);
      let results: unknown;
      try {
        results = (JSON.parse(text) as { results?: unknown }).results;
      } catch {
        // A 200 that is not JSON: the request was taken, its outcome is not safely repeatable.
        throw new Error("deepseek_search response is not JSON");
      }
      if (!Array.isArray(results)) throw new Error("deepseek_search response has no results array");
      // An empty result is a valid answer DeepSeek does not bill.
      return { response: { results }, cost: results.length ? COST_PER_CALL : null };
    },
  );
  return (receipt.response as { results: DeepSeekResult[] }).results ?? [];
}

/**
 * Reads one page as Markdown. Billed only when content comes back; the receipt key is the URL plus
 * the day, so a same-day re-read of a page reuses the paid answer instead of buying it again.
 */
export async function deepseekFetch(url: string, opts: { purpose: string; subject: string }): Promise<{ title: string; content: string }> {
  await requireWebBudget();
  const day = new Date().toISOString().slice(0, 10);
  const receipt = await paidRequest(
    { service: "deepseek_web", model: null, purpose: opts.purpose, subject: opts.subject,
      identity: { fetch: url, day }, requestSummary: { url } },
    async () => {
      const res = await guardedFetch(`${apiBase()}/tools/fetch`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ url }),
        timeoutMs: 60_000,
        maxBytes: 6 * 1024 * 1024,
      });
      const text = res.text();
      // Cache deterministic refusals under the day-keyed receipt: never keep paying
      // for an inaccessible page on every collection tick.
      if ([401, 402, 403, 404].includes(res.status)) {
        return { response: { refusedStatus: res.status }, cost: null };
      }
      assertAccepted("deepseek_fetch", res.status, text);
      let page: { title?: unknown; content?: unknown };
      try {
        page = JSON.parse(text);
      } catch {
        throw new Error("deepseek_fetch response is not JSON");
      }
      const content = typeof page.content === "string" ? page.content.slice(0, 2_000_000) : "";
      // A successful HTTP response without useful content must not stamp detail
      // rules. Keep the unbillable negative answer for the UTC day.
      if (!content.trim()) return { response: { emptyContent: true }, cost: null };
      return {
        response: { title: typeof page.title === "string" ? page.title : "", content },
        cost: COST_PER_CALL,
      };
    },
  );
  const answer = receipt.response as { title?: string; content?: string; refusedStatus?: number; emptyContent?: boolean };
  // Throw after receipt persistence: refusals are cached for this day, but
  // callers do not treat them as completed article-detail extraction.
  if (answer.refusedStatus) throw new ProviderRejectedError(
    `deepseek_fetch HTTP ${answer.refusedStatus}`, answer.refusedStatus, false,
  );
  if (answer.emptyContent) throw new ProviderRejectedError("deepseek_fetch returned empty content", 200, false);
  return { title: answer.title ?? "", content: answer.content ?? "" };
}
