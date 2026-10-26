// The daily discovery run on real tables (specs/007 §D→T): settings gate, budget/credential skips,
// gap subjects from an active event group, candidate registration, the real previewSource against a
// stubbed DeepSeek API, and the automatic trial start under sourceLifecycle.autoPromote. No network
// beyond the local stub; no source is ever created without a passed preview.
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { runDailyDiscovery } from "@aihot/backend/admin/discovery";

const T = tag();
const EVENT = `红海航运中断升级-${T}`;
const OFFICIAL = `sanctions-${T}.example.gov`;
const QUERY = `${EVENT} site:${OFFICIAL}`;
const IDENTITY = `deepseek:${QUERY.toLowerCase()}`;

const HOUR = 3_600_000;
let hits = 0;
// Discovery asks for feed endpoints; a candidate's preview asks its own site:-scoped query.
const deepseek = await stub((_hit, req) => {
  hits += 1;
  const body = JSON.parse(req.body || "{}") as { query: string };
  if (body.query.includes("site:")) {
    return { results: [1, 2].map((n) => ({
      rerank_score: 2, title: `Official notice ${n}`, url: `https://www.${OFFICIAL}/actions/${n}`,
      snippet: `Notice ${n} snippet.`, summary: "", content: "", site_icon: null,
      date: new Date(Date.now() - HOUR).toISOString(), site_name: "Sanctions Authority", authority: 90,
    })) };
  }
  // Only the event's own search finds its publisher; every other subject finds only noise.
  const leads = body.query.includes("红海") ? [
    { rerank_score: 2, title: "Press releases", url: `https://www.${OFFICIAL}/press-releases`,
      snippet: "Official press releases.", summary: "", content: "", site_icon: null, date: null,
      site_name: "Sanctions Authority", authority: 90 },
  ] : [];
  return { results: [...leads,
    // Blog spam and an anonymous media homepage: search hits, not publisher leads.
    { rerank_score: 1, title: "My AI cost takes", url: "https://medium.com/@someone/ai-costs",
      snippet: "hot take", summary: "", content: "", site_icon: null, date: null, site_name: "Medium", authority: 5 },
  ] };
});
process.env.DEEPSEEK_BASE_URL = deepseek.url;
process.env.DEEPSEEK_API_KEY = "test-key";
config.allowPrivateNetworkFetch = true;

const candidateRow = async () => sql<{ id: string; status: string; config: any; preflight: any }[]>`
  SELECT id, status, config, preflight FROM source_candidates WHERE identity = ${IDENTITY}`;

before(async () => {
  await sql`INSERT INTO budgets (service, per_minute, per_hour, per_day, note) VALUES
            ('deepseek_web', 1000, 10000, 100000, 'test') ON CONFLICT (service) DO NOTHING`;
  // An active event group from the last 48 h: the discovery input's active topic.
  await sql`INSERT INTO stories (public_id, title, latest_at)
            VALUES (gen_random_uuid(), ${EVENT}, now())`;
});

after(async () => {
  await deepseek.close();
  await stopBoss();
  await closeDb();
});

test("off by default: no settings row means no paid search, only the free trial review", async () => {
  const run = await runDailyDiscovery();
  assert.equal(run.skipped, "disabled");
  assert.equal(run.queries, 0);
});

test("a zero deepseek_web budget skips discovery for the day without a search", async () => {
  await sql`INSERT INTO settings (key, value, updated_by) VALUES ('sourceLifecycle.discovery', ${sql.json({ enabled: true, maxGaps: 2, maxCandidates: 4 })}, 'test')`;
  await sql`UPDATE budgets SET per_day = 0 WHERE service = 'deepseek_web'`;
  const before = hits;
  const run = await runDailyDiscovery();
  assert.equal(run.skipped, "budget");
  assert.equal(hits, before);
});

test("a missing credential skips discovery without a search and without a paid receipt", async () => {
  const key = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";
  const before = hits;
  const run = await runDailyDiscovery();
  assert.equal(run.skipped, "credential");
  assert.equal(hits, before);
  // PR#132's fix: the refusal happens before paidRequest claims a receipt, so nothing to clean up.
  const [unknown] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM receipts WHERE service = 'deepseek_web' AND status = 'unknown'`;
  assert.equal(unknown!.n, 0);
  process.env.DEEPSEEK_API_KEY = key;
});

test("a run finds the event's publisher, previews it for real and (autoPromote off) stops there", async () => {
  const run = await runDailyDiscovery();
  assert.equal(run.skipped, undefined);
  assert.ok(run.subjects.some((s) => s.includes("红海航运中断升级")));
  // One discovery search for the event subject; only the official-domain lead registered.
  assert.equal(run.proposed, 1);
  assert.equal(run.registered, 1);
  const [c] = await candidateRow();
  assert.ok(c);
  assert.equal(c.status, "discovered");
  assert.equal(c.config.mode, "deepseek_search");
  assert.equal(c.config.deepseekQuery, QUERY);
  assert.deepEqual(c.config.allowUrlPrefixes, [`https://www.${OFFICIAL}/`]);
  assert.equal(c.config._aihot.initialBackfillLimit, 2);
  // Automated channels may not assert officialLowFrequency (operator verification required).
  const [flag] = await sql<{ official_low_frequency: boolean }[]>`
    SELECT official_low_frequency FROM source_candidates WHERE id = ${c.id}`;
  assert.equal(flag!.official_low_frequency, false);
  // The preview was a real one (a site:-scoped paid query hit the stub) with dated, distinct items.
  assert.ok(hits >= 2);
  assert.equal(run.previewed, 1);
  assert.equal(run.previewPassed, 1);
  assert.equal(c.preflight.previewPassed, true);
  assert.ok(c.preflight.previewDated! >= 1);
  // Trials never start unless the settings allow it.
  assert.equal(run.trialsStarted, 0);
  assert.equal((await sql`SELECT count(*)::int AS n FROM sources WHERE id = ${"lc-" + c.id}`)[0]!.n, 0);
});

test("with autoPromote on, the same daily run starts a T2 hot_signal trial and reviews it", async () => {
  await sql`INSERT INTO settings (key, value, updated_by) VALUES ('sourceLifecycle.autoPromote', ${sql.json({ enabled: true })}, 'test')`;
  // The previously previewed candidate must still start its free/authorized trial
  // when a new paid discovery search cannot run.
  await sql`UPDATE budgets SET per_day = 0 WHERE service = 'deepseek_web'`;
  const priorCalls = hits;
  const run = await runDailyDiscovery();
  assert.equal(run.skipped, "budget");
  assert.equal(hits, priorCalls);
  assert.equal(run.trialsStarted, 1);
  await sql`UPDATE budgets SET per_day = 100000 WHERE service = 'deepseek_web'`;
  const [c0] = await candidateRow();
  const [src] = await sql<{ tier: string; participation_mode: string; tags: string[] }[]>`
    SELECT tier, participation_mode, tags FROM sources WHERE id = ${"lc-" + c0.id}`;
  assert.equal(src.tier, "T2");
  assert.equal(src.participation_mode, "hot_signal");
  assert.ok(src.tags.includes("lifecycle-event"));
  assert.ok(src.tags.includes("一手"));
  const [c] = await candidateRow();
  assert.equal(c.status, "trial");
});

test("the next day's run does not duplicate the candidate or restart its trial", async () => {
  const run = await runDailyDiscovery();
  // The trial source already carries the candidate's identity (query + publisher prefix): the lead
  // is dropped by identity before even a query for it, and its trial is not restarted.
  assert.equal(run.proposed, 0);
  assert.equal(run.registered, 0);
  assert.equal(run.trialsStarted, 0);
  assert.equal((await sql`SELECT count(*)::int AS n FROM source_candidates WHERE identity = ${IDENTITY}`)[0]!.n, 1);
  // The free evaluation cycle ran over the trial at the start of the run: a young trial is kept.
  assert.equal(run.evaluated, 1);
  const [decision] = await sql<{ last_decision: string | null }[]>`
    SELECT last_decision FROM source_candidates WHERE identity = ${IDENTITY}`;
  assert.equal(decision.last_decision, "keep");
  const [c] = await candidateRow();
  assert.equal(c.status, "trial");
});

// A failed first preview is terminal (not a new paid DeepSeek preview every morning).
// Expired breaking-event candidates must not launch trials, even with a passed preview.
test("failed previews and expired event candidates are not retried or trialled", async () => {
  const failedId = `test-discovery-failed-${T}`;
  const expiredId = `test-discovery-expired-${T}`;
  const configValue = sql.json({ mode: "deepseek_search", deepseekQuery: `unmatched query ${T}`,
    allowUrlPrefixes: ["https://missing.example.gov/"], publishedAfter: new Date().toISOString() });
  await sql`INSERT INTO source_candidates
    (id, identity, status, origin_channel, kind, name, config, tags, rationale, preflight)
    VALUES (${failedId}, ${`deepseek:unmatched query ${T}`}, 'discovered', 'deepseek', 'json_list',
      'Missing publisher', ${configValue}, ARRAY['测试'], 'test', ${sql.json({ ok: true, reasons: [] })})`;
  await sql`INSERT INTO source_candidates
    (id, identity, status, origin_channel, kind, name, config, tags, rationale, preflight, expires_at)
    VALUES (${expiredId}, ${`deepseek:expired query ${T}`}, 'discovered', 'breaking_event', 'json_list',
      'Expired publisher', ${configValue}, ARRAY['测试'], 'test',
      ${sql.json({ ok: true, reasons: [], previewPassed: true })}, now() - interval '1 day')`;
  const first = await runDailyDiscovery({ search: async () => [] });
  assert.equal(first.previewed, 1);
  assert.equal(first.previewPassed, 0);
  const candidates = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM source_candidates WHERE id = ANY(${[failedId, expiredId]}::text[])`;
  assert.deepEqual(candidates.map(c => c.status).sort(), ["preflight_failed", "preflight_failed"]);
  const second = await runDailyDiscovery({ search: async () => [] });
  assert.equal(second.previewed, 0, "terminal failures are not re-previewed at a cost");
  assert.equal(second.trialsStarted, 0, "expired event candidates never enter trials");
  await sql`UPDATE budgets SET per_day = 100000 WHERE service = 'deepseek_web'`;
});
