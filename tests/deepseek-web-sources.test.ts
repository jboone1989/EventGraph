// DeepSeek Search/Fetch as a source fallback (mode=deepseek_search on json_list, detail.fetchVia):
// result mapping, dates, cross-domain filtering, receipts and the budget, no-retry error handling,
// URL dedup and original-URL identity, preview without writes, and on-demand detail reads.
import { Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { collectSource } from "@aihot/backend/sources/collect";
import { unsupportedConfig } from "@aihot/backend/sources/config-keys";
import { previewSource, sourceIdentity } from "@aihot/backend/admin/sources";
import { deepseekFetch, deepseekSearch } from "@aihot/backend/providers/deepseek-web";

const T = tag();
const SRC = `test-dsweb-${T}`;

// The stub answers both tools; each test swaps the reply it wants.
let searchReply: (hit: number, body: { query: string }) => unknown = () => ({ results: [] });
let fetchReply: (hit: number, body: { url: string }) => unknown = () => new Reply(404, {});
const deepseek = await stub((_hit, req) => {
  const body = JSON.parse(req.body || "{}");
  if (req.url!.startsWith("/tools/search")) return searchReply(_hit, body);
  if (req.url!.startsWith("/tools/fetch")) return fetchReply(_hit, body);
  return new Reply(404, {});
});

process.env.DEEPSEEK_BASE_URL = deepseek.url;
process.env.DEEPSEEK_API_KEY = "test-key";
config.allowPrivateNetworkFetch = true;

const HOUR = 3_600_000;
const story = (n: number, over: Record<string, unknown> = {}) => ({
  rerank_score: 2.1,
  title: `Event story ${n}`,
  url: `https://example-news.example/stories/${n}`,
  snippet: `Snippet of story ${n}.`,
  summary: `Summary of story ${n}.`,
  content: "",
  site_name: "Example News",
  site_icon: null,
  date: new Date(Date.now() - HOUR).toISOString(),
  authority: 3,
  ...over,
});
const scopedConfig = (extra: Record<string, unknown> = {}) => ({
  mode: "deepseek_search",
  deepseekQuery: `breaking event site:example-news.example ${T}`,
  deepseekCount: 5,
  allowUrlPrefixes: ["https://example-news.example/"],
  ...extra,
});

before(async () => {
  // No migration seeds post-0055 budget rows (data is not allowed there); the admin settings page is
  // the creation path in production. The test creates the row the same way that page does.
  await sql`INSERT INTO budgets (service, per_minute, per_hour, per_day, note) VALUES
            ('deepseek_web', 1000, 10000, 100000, 'test') ON CONFLICT (service) DO NOTHING`;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
            VALUES (${SRC}, 'Test DeepSeek web', 'json_list', ${sql.json(scopedConfig())}, 'T2', 'editorial',
                    ${sql.json({ initializedAt: new Date().toISOString() })}, '2100-01-01')`;
});
after(async () => {
  await deepseek.close();
  await stopBoss();
  await closeDb();
});

const articles = async (id = SRC) =>
  sql<{ title: string; url: string; published_at: string | null; body_status: string; source_id: string }[]>`
    SELECT title, url, published_at, body_status, source_id FROM articles WHERE source_id = ${id} ORDER BY url`;

test("results map to articles with their own URL and date; cross-domain and untitled results are filtered", async () => {
  searchReply = () => ({
    results: [
      story(1),
      story(2, { date: null }),
      story(3, { url: "https://other-site.example/spill-over" }),
      story(4, { title: "" }),
    ],
  });
  const run = await collectSource(SRC, { force: true });
  assert.equal(run.status, "ok");
  assert.equal(run.found, 3, "the untitled result maps to nothing");
  assert.equal(run.created, 2, "the cross-domain one is filtered");
  const rows = await articles();
  assert.equal(rows[0]!.url, "https://example-news.example/stories/1");
  assert.ok(rows[0]!.published_at && Math.abs(Date.parse(rows[0]!.published_at) - (Date.now() - HOUR)) < 2000, "the API's UTC date is kept");
  assert.equal(rows[1]!.published_at, null, "an undated result is not dated today");
  assert.ok(rows.every((r) => r.source_id === SRC && r.url.startsWith("https://example-news.example/")), "identity and URL stay the original site's");
});

test("each paid search has a receipt; a re-run with a changed query buys one call and dedups by URL", async () => {
  const before = await articles();
  await sql`UPDATE sources SET config = ${sql.json(scopedConfig({ deepseekQuery: `breaking event site:example-news.example ${T} v2` }))} WHERE id = ${SRC}`;
  searchReply = () => ({ results: [story(1), story(2)] });
  const hits = deepseek.hits();
  const again = await collectSource(SRC, { force: true });
  assert.equal(again.status, "ok");
  assert.equal(deepseek.hits(), hits + 1, "a changed query is one fresh paid call");
  assert.equal(again.created, 0, "the same URLs are already known");
  assert.equal((await articles()).length, before.length);
  const [receipt] = await sql<{ status: string; cost: number | null; currency: string | null; purpose: string }[]>`
    SELECT status, cost, currency, purpose FROM receipts WHERE service = 'deepseek_web' AND purpose = 'source_listing'
    ORDER BY id DESC LIMIT 1`;
  // Listing receipts stay "received" (the answer is saved and reused by its key), like Jina's; only
  // X search completes with its stored coverage.
  assert.equal(receipt!.status, "received");
  assert.equal(receipt!.cost, 0.005, "a successful search is recorded at the per-request price");
  assert.equal(receipt!.currency, "CNY");
});

test("preview reuses the paid answer within its window and writes nothing", async () => {
  const hits = deepseek.hits();
  const articlesBefore = await sql`SELECT count(*)::int AS n FROM articles WHERE source_id LIKE ${`test-dsweb-%${T}`}`;
  const preview = await previewSource({ id: `test-dsweb-preview-${T}`, kind: "json_list" as const, config: scopedConfig() });
  assert.equal(preview.count, 2, "the same two scoped results come back");
  assert.equal(deepseek.hits(), hits, "no second call inside the 15-minute window");
  const articlesAfter = await sql`SELECT count(*)::int AS n FROM articles WHERE source_id LIKE ${`test-dsweb-%${T}`}`;
  assert.equal(articlesAfter[0]!.n, articlesBefore[0]!.n, "preview stores no articles");
});

test("an HTTP 401 fails the run once per attempt, is recorded on the receipt, and never looks received", async () => {
  const failing = `${SRC}-401`;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
            VALUES (${failing}, 'Test DeepSeek 401', 'json_list', ${sql.json(scopedConfig({ deepseekQuery: `failing query ${T}` }))}, 'T2', 'editorial',
                    ${sql.json({ initializedAt: new Date().toISOString() })}, '2100-01-01')`;
  searchReply = () => new Reply(401, { error: { message: "Authentication Fails", type: "authentication_error" } });
  const hits = deepseek.hits();
  const first = await collectSource(failing, { force: true });
  assert.equal(first.status, "failed");
  assert.match(first.error!, /HTTP 401/);
  const second = await collectSource(failing, { force: true });
  assert.equal(second.status, "failed");
  assert.equal(deepseek.hits(), hits + 2, "exactly one request per run — no retry storm, no unknown-outcome resend");
  const [receipt] = await sql<{ status: string; attempts: number }[]>`
    SELECT status, attempts FROM receipts WHERE service = 'deepseek_web' AND subject = ${`source:${failing}`} ORDER BY id DESC LIMIT 1`;
  assert.equal(receipt!.status, "failed");
  assert.equal(receipt!.attempts, 2);
  const [source] = await sql<{ fail_count: number; health: string }[]>`SELECT fail_count, health FROM sources WHERE id = ${failing}`;
  assert.equal(source!.fail_count, 2, "the failure counts toward the source's health backoff");
  assert.equal(source!.health, "degraded");
});

test("Fetch does not cache account-wide 401/402 as page-specific refusals", async () => {
  for (const status of [401, 402]) {
    const url = `https://example-news.example/account-${status}-${T}`;
    fetchReply = () => new Reply(status, { error: { message: "Account unavailable" } });
    const beforeHits = deepseek.hits();
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(
        () => deepseekFetch(url, { purpose: "source_detail", subject: `source:${SRC}-account-${status}` }),
        new RegExp(`HTTP ${status}`),
      );
    }
    assert.equal(deepseek.hits(), beforeHits + 2, `HTTP ${status} can be retried after operator repair`);
  }
});

test("an empty result page is a normal run and is not billed", async () => {
  const quiet = `${SRC}-quiet`;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
            VALUES (${quiet}, 'Test DeepSeek quiet', 'json_list', ${sql.json(scopedConfig({ deepseekQuery: `quiet query ${T}` }))}, 'T2', 'editorial',
                    ${sql.json({ initializedAt: new Date().toISOString() })}, '2100-01-01')`;
  searchReply = () => ({ results: [] });
  const run = await collectSource(quiet, { force: true });
  assert.equal(run.status, "ok");
  assert.equal(run.found, 0);
  const [receipt] = await sql<{ status: string; cost: number | null }[]>`
    SELECT status, cost FROM receipts WHERE service = 'deepseek_web' AND subject = ${`source:${quiet}`} ORDER BY id DESC LIMIT 1`;
  assert.equal(receipt!.status, "received");
  assert.equal(receipt!.cost, null, "DeepSeek bills no empty search");
});

test("a spent budget stops the source for 15 minutes without counting it as the source's failure", async () => {
  const blocked = `${SRC}-blocked`;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
            VALUES (${blocked}, 'Test DeepSeek budget', 'json_list', ${sql.json(scopedConfig({ deepseekQuery: `blocked query ${T}` }))}, 'T2', 'editorial',
                    ${sql.json({ initializedAt: new Date().toISOString() })}, '2100-01-01')`;
  await sql`UPDATE budgets SET per_minute = 0 WHERE service = 'deepseek_web'`;
  const hits = deepseek.hits();
  const run = await collectSource(blocked, { force: true });
  assert.equal(run.status, "failed");
  assert.match(run.error!, /Budget for deepseek_web exhausted \(stopped\)/);
  assert.equal(deepseek.hits(), hits, "nothing is sent once the budget is stopped");
  const [source] = await sql<{ fail_count: number; next_fetch_at: string }[]>`SELECT fail_count, next_fetch_at FROM sources WHERE id = ${blocked}`;
  assert.equal(source!.fail_count, 0, "a budget stop is not the source's failure");
  assert.ok(Date.parse(source!.next_fetch_at) <= Date.now() + 16 * 60_000, "it waits a quarter hour, not the failure backoff");
  await sql`UPDATE budgets SET per_minute = 1000 WHERE service = 'deepseek_web'`;
});

test("an undated result gets its date and body from one on-demand DeepSeek fetch; a 404 stays undated", async () => {
  const detailSrc = `${SRC}-detail`;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
            VALUES (${detailSrc}, 'Test DeepSeek detail', 'json_list', ${sql.json(scopedConfig({
              deepseekQuery: `detail query ${T}`,
              detail: { maxFetches: 2, fetchVia: "deepseek", publishedAtRegex: "Published Time:\\s*([^\n]+)" },
            }))}, 'T2', 'editorial', ${sql.json({ initializedAt: new Date().toISOString() })}, '2100-01-01')`;
  const body = "Body paragraph. ".repeat(40);
  searchReply = () => ({
    results: [story(10, { date: null }), story(11, { date: null })],
  });
  fetchReply = (_hit, req) => req.url.endsWith("/11")
    ? new Reply(404, { error: { message: "Fetch Error", type: "not_found" } })
    : { title: "Event story 10 — full title", content: `# Event story 10\n\nPublished Time: 2026-10-24T08:00:00Z\n\n${body}` };
  const run = await collectSource(detailSrc, { force: true });
  assert.equal(run.status, "ok");
  const rows = await articles(detailSrc);
  const dated = rows.find((r) => r.url.endsWith("/10"))!;
  assert.equal(Date.parse(dated.published_at!), Date.parse("2026-10-24T08:00:00Z"), "the regex read the date off the fetched Markdown");
  assert.equal(dated.body_status, "ok", "the Markdown becomes the body");
  const undated = rows.find((r) => r.url.endsWith("/11"))!;
  assert.equal(undated.published_at, null, "a refused fetch leaves the date unknown, never today");
  const detailReceipts = await sql<{ status: string }[]>`
    SELECT status FROM receipts WHERE service = 'deepseek_web' AND purpose = 'source_detail' AND status = 'received' ORDER BY id`;
  assert.deepEqual(detailReceipts.map((r) => r.status).sort(), ["received", "received"], "the answered read and the refusal are cached; refusal is still thrown to the collector");
  const [fetchRun] = await sql<{ detail: { detailAttempts: number; detailFailures: number } }[]>`
    SELECT detail FROM fetch_runs WHERE source_id = ${detailSrc} ORDER BY id DESC LIMIT 1`;
  assert.deepEqual([fetchRun!.detail.detailAttempts, fetchRun!.detail.detailFailures], [2, 1], "two on-demand reads: one answered, one refused");
  const callCount = deepseek.hits();
  await collectSource(detailSrc, { force: true });
  assert.equal(deepseek.hits(), callCount, "repeat collection reuses same-day search and refusal without a new HTTP request");
});

test("an empty 200 Fetch is a daily cached negative answer, not a completed detail", async () => {
  const url = `https://example-news.example/empty-${T}`;
  fetchReply = () => ({ title: "No body", content: "" });
  const hits = deepseek.hits();
  await assert.rejects(() => deepseekFetch(url, { purpose: "test_empty", subject: `source:${SRC}-empty` }), /empty content/);
  assert.equal(deepseek.hits(), hits + 1);
  await assert.rejects(() => deepseekFetch(url, { purpose: "test_empty", subject: `source:${SRC}-empty` }), /empty content/);
  assert.equal(deepseek.hits(), hits + 1, "no repeat HTTP call for an unbillable empty answer");
});

test("a deepseek_search config without URL scoping is refused before it can spend anything", () => {
  assert.deepEqual(
    unsupportedConfig("json_list" as const, { mode: "deepseek_search", deepseekQuery: "q" }),
    ["deepseek_search requires allowUrlPrefixes"],
  );
  assert.deepEqual(unsupportedConfig("json_list" as const, scopedConfig()), []);
  assert.equal(sourceIdentity("json_list", scopedConfig()), `deepseek:breaking event site:example-news.example ${T}`.toLowerCase());
  assert.deepEqual(
    unsupportedConfig("json_list" as const, scopedConfig({ deepseekCountX: 1 })),
    ["deepseekCountX"],
  );
  assert.deepEqual(
    unsupportedConfig("json_list" as const, scopedConfig({ detail: { fetchVia: "jina" } })),
    ["detail.fetchVia=jina"],
  );
});

test("a missing service budget fails closed instead of invoking unlimited paid search", async () => {
  const source = `${SRC}-missing-budget`;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
    VALUES (${source}, 'No DeepSeek budget', 'json_list',
      ${sql.json(scopedConfig({ deepseekQuery: `missing budget ${T}` }))},
      'T2', 'editorial', ${sql.json({ initializedAt: new Date().toISOString() })}, '2100-01-01')`;
  const [configured] = await sql<{ per_minute: number; per_hour: number; per_day: number; note: string | null }[]>`
    SELECT per_minute, per_hour, per_day, note FROM budgets WHERE service = 'deepseek_web'`;
  assert.ok(configured);
  await sql`DELETE FROM budgets WHERE service = 'deepseek_web'`;
  const hits = deepseek.hits();
  try {
    const run = await collectSource(source, { force: true });
    assert.equal(run.status, "failed");
    assert.ok(run.error?.includes("Budget for deepseek_web exhausted (stopped)"));
    assert.equal(deepseek.hits(), hits, "no API call without an explicitly configured budget");
  } finally {
    await sql`INSERT INTO budgets (service, per_minute, per_hour, per_day, note)
      VALUES ('deepseek_web', ${configured!.per_minute}, ${configured!.per_hour}, ${configured!.per_day}, ${configured!.note})
      ON CONFLICT (service) DO UPDATE SET per_minute = EXCLUDED.per_minute,
        per_hour = EXCLUDED.per_hour, per_day = EXCLUDED.per_day, note = EXCLUDED.note`;
  }
});

test("an undated hot signal without a date rule never buys an unusable Fetch", async () => {
  const source = `${SRC}-skip-detail`;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
    VALUES (${source}, 'DeepSeek no rule', 'json_list',
      ${sql.json(scopedConfig({ deepseekQuery: `no date rule ${T}`, detail: { maxFetches: 2, fetchVia: "deepseek" } }))},
      'T2', 'hot_signal', ${sql.json({ initializedAt: new Date().toISOString() })}, '2100-01-01')`;
  searchReply = () => ({ results: [story(80, { date: null })] });
  const beforeHits = deepseek.hits();
  const result = await collectSource(source, { force: true });
  assert.equal(result.status, "ok");
  assert.equal(deepseek.hits(), beforeHits + 1, "only the Search call; Fetch would be useless");
  const [row] = await articles(source);
  assert.equal(row!.published_at, null);
});

test("a dated editorial result uses at most one Fetch for a requested body", async () => {
  const source = `${SRC}-body-only`;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
    VALUES (${source}, 'DeepSeek body only', 'json_list',
      ${sql.json(scopedConfig({ deepseekQuery: `body only ${T}`, detail: { maxFetches: 1, fetchVia: "deepseek" } }))},
      'T2', 'editorial', ${sql.json({ initializedAt: new Date().toISOString() })}, '2100-01-01')`;
  searchReply = () => ({ results: [story(81), story(82)] });
  fetchReply = () => ({ title: "Fetched body", content: "A sourced report paragraph. ".repeat(20) });
  const beforeHits = deepseek.hits();
  const result = await collectSource(source, { force: true });
  assert.equal(result.status, "ok");
  assert.equal(result.created, 2);
  assert.equal(deepseek.hits(), beforeHits + 2, "one Search and one budgeted Fetch");
  const rows = await articles(source);
  assert.equal(rows.filter(r => r.body_status === "ok").length, 1);
});

test("HTML selectors are rejected for Markdown-based DeepSeek Fetch", () => {
  const invalid = unsupportedConfig("json_list", scopedConfig({
    detail: { maxFetches: 1, fetchVia: "deepseek", summarySelector: ".summary" },
  }));
  assert.deepEqual(invalid, ["detail.summarySelector unsupported with deepseek"]);
});

test("cached refused URL never starves a later result at maxFetches one", async () => {
  const source = `${SRC}-refusal-slot`;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
    VALUES (${source}, 'DeepSeek refusal slot', 'json_list',
      ${sql.json(scopedConfig({ deepseekQuery: `refusal slot ${T}`,
        detail: { maxFetches: 1, fetchVia: "deepseek", publishedAtRegex: "Published Time:\\s*([^\\n]+)" } }))},
      'T2', 'editorial', ${sql.json({ initializedAt: new Date().toISOString() })}, '2100-01-01')`;
  searchReply = () => ({ results: [story(90, { date: null }), story(91, { date: null })] });
  fetchReply = (_hit, req) => req.url.endsWith("/90")
    ? new Reply(403, { error: { message: "Refused" } })
    : { title: "News", content: "Published Time: 2026-10-25T08:00:00Z\\n\\n" + "Useful paragraph ".repeat(20) };
  const firstHits = deepseek.hits();
  await collectSource(source, { force: true });
  assert.equal(deepseek.hits(), firstHits + 2, "one Search and one denied Fetch");
  await collectSource(source, { force: true });
  assert.equal(deepseek.hits(), firstHits + 3, "the cached denial takes no slot; next article gets one Fetch");
  const rows = await articles(source);
  assert.equal(rows.find(r => r.url.endsWith("/91"))?.body_status, "ok");
});

test("missing API credentials do not create unknown paid receipts or poison future retries", async () => {
  const purpose = `source_credential_test_${T}`;
  const query = `credential test ${T}`;
  const saved = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";
  const hits = deepseek.hits();
  try {
    await assert.rejects(() => deepseekSearch(query, { purpose, subject: SRC, count: 1 }), /DEEPSEEK_API_KEY/);
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts
      WHERE service = 'deepseek_web' AND purpose = ${purpose}`;
    assert.equal(row!.n, 0, "a local credential problem must never claim a provider receipt");
    assert.equal(deepseek.hits(), hits);
  } finally {
    process.env.DEEPSEEK_API_KEY = saved;
  }
  searchReply = () => ({ results: [] });
  await deepseekSearch(query, { purpose, subject: SRC, count: 1 });
  assert.equal(deepseek.hits(), hits + 1, "the next correctly configured run may proceed");
});
