// The production smoke's hot gate stands on this probe: it must read the same aggregates the ranking
// itself writes (fresh snapshot, rule version, stored/public entries, eligible candidates through the
// real 48 h / two-participant / one-editorial rules, source-clock lag) without writing anything, and
// the acceptance decision must classify the real incident shapes grown from seeded evidence
// (specs/prod-hot-ranking-release-gate-20261109). The evaluator's own branch table, including payloads
// the probe cannot produce, is covered by tests/hot-diagnostic.standalone.test.ts.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { HOT_RULE_VERSION, computeHotRanking } from "@aihot/backend/events/hot";
import { evaluateHotAcceptance, readHotRankingDiagnostic } from "@aihot/backend/operations/hot-diagnostic";

const T = `hotdiag-${tag()}`;
// Real-clock relative: the CLI subprocess checks freshness with its own clock, so the fixtures cannot
// live in 2099; everything else stays deterministic because it is measured against this one NOW.
const NOW = new Date();
const MIN = 60_000;
const run = promisify(execFile);

after(closeDb);

// Fresh by the probe's own clock unless a scenario says otherwise; interval 30 keeps the grace at 90 min.
async function source(key: string, opts: { mode?: string; lastOk?: Date } = {}) {
  const id = `${T}-${key}`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, created_at, next_fetch_at, last_ok_at, interval_minutes)
            VALUES (${id}, ${id}, 'rss', 'T2', ${opts.mode ?? "editorial"}, ${new Date(+NOW - 72 * 3600_000)}, '2100-01-01', ${opts.lastOk ?? new Date(+NOW - 5 * MIN)}, 30)`;
  return id;
}

let n = 0;
async function signal(story: number, sourceId: string, at: Date) {
  n += 1;
  const id = `${T}-a${n}`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
            VALUES (${id}, ${sourceId}, ${id}, ${`https://example.org/${id}`}, ${id}, ${at}, ${at})`;
  const [analysis] = await sql`INSERT INTO analyses (article_id,input_revision,origin,output)
    VALUES (${id},1,'rule',${sql.json({scope:'single'})}) RETURNING id`;
  await sql`INSERT INTO publications (article_id, analysis_id, revision, visibility, eligible, selected, title, source_id, channel, first_party, url, discovered_at, timeline_at, body_mode, sort_at)
    VALUES (${id}, ${analysis!.id}, 1, 'public', true, false, ${id}, ${sourceId}, 'news', false, ${`https://example.org/${id}`}, ${at}, ${at}, 'summary', ${at})`;
  const [f] = await sql`INSERT INTO facts (public_id,story_id,title) VALUES (${id},${story},${id}) RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${f!.id},${id},'report')`;
  await sql`INSERT INTO story_signals (story_id, article_id, participant_key, source_id, kind, observed_at)
            VALUES (${story}, ${id}, ${`source:${sourceId}`}, ${sourceId}, 'editorial', ${at})`;
}

async function story() {
  const [s] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title) VALUES (${randomUUID()}, ${T}) RETURNING id`;
  return s!.id;
}

const failing = (payload: unknown, apiEntries = 0) => {
  const outcome = evaluateHotAcceptance(apiEntries, payload, +NOW);
  assert.equal(outcome.accepted, false, `expected a failure, got ${JSON.stringify(outcome)}`);
  return outcome.reason;
};

test("the probe reuses the ranking's own queries and the decision classifies each incident shape", async () => {
  // Populated success: two editorial participants on one story with visible reports.
  const hot = await story();
  await signal(hot, await source("hot-a"), new Date(+NOW - 60 * MIN));
  await signal(hot, await source("hot-b"), new Date(+NOW - 60 * MIN));
  assert.equal((await computeHotRanking(new Date(+NOW - 3 * MIN))).entries, 1);
  const before = await sql`SELECT count(*)::int AS n FROM hot_rankings`;
  const populated = await readHotRankingDiagnostic(NOW);
  const after = await sql`SELECT count(*)::int AS n FROM hot_rankings`;
  assert.deepEqual(after, before, "the diagnostic is read-only");
  assert.equal(populated.snapshot?.computedAt, new Date(+NOW - 3 * MIN).toISOString());
  assert.equal(populated.snapshot?.ruleVersion, HOT_RULE_VERSION);
  assert.equal(populated.snapshot?.storedEntries, 1);
  assert.equal(populated.snapshot?.candidates, 1);
  assert.equal(populated.publicEntries, 1);
  assert.equal(populated.eligible.now, 1);
  assert.equal(populated.eligible.atSnapshot, 1);
  assert.equal(populated.sources.behind, 0);
  const ok = evaluateHotAcceptance(1, populated, +NOW);
  assert.equal(ok.accepted && ok.verdict, "populated");

  // Genuine sparse window: stories exist, none qualify (one participant), sources collecting.
  await sql`DELETE FROM story_signals WHERE story_id = ${hot}`;
  const lone = await story();
  await signal(lone, await source("lone"), new Date(+NOW - 30 * MIN));
  await computeHotRanking(new Date(+NOW - 2 * MIN));
  const sparse = await readHotRankingDiagnostic(NOW);
  assert.equal(sparse.snapshot?.storedEntries, 0);
  assert.equal(sparse.snapshot?.candidates, 0);
  assert.equal(sparse.publicEntries, 0);
  assert.equal(sparse.eligible.now, 0);
  assert.equal(sparse.eligible.atSnapshot, 0);
  const empty = evaluateHotAcceptance(0, sparse, +NOW);
  assert.equal(empty.accepted && empty.verdict, "expected sparse window");

  // The deployed-image contract the smoke consumes: one JSON line, non-zero exit on a bad call.
  const cli = JSON.parse((await run(process.execPath, ["scripts/hot-diagnose.ts", "--api-entries", "0"])).stdout);
  assert.equal(cli.acceptance.verdict, "expected sparse window");
  assert.equal(cli.diagnostic.snapshot.candidates, 0);
  await assert.rejects(run(process.execPath, ["scripts/hot-diagnose.ts"]));

  // Absent ranking: nothing published at all.
  await sql`DELETE FROM hot_rankings`;
  assert.equal(failing(await readHotRankingDiagnostic(NOW)), "hot ranking is absent");

  // Stale ranking: the last snapshot is older than three runs of the */5 hot.rank cron.
  await computeHotRanking(new Date(+NOW - 40 * MIN));
  assert.equal(failing(await readHotRankingDiagnostic(NOW)), "hot ranking is stale");

  // Eligible but publicly hidden: a fresh empty snapshot, then evidence that qualifies right after it.
  await computeHotRanking(new Date(+NOW - 2 * MIN));
  const fresh = await story();
  await signal(fresh, await source("fresh-a"), new Date(+NOW - MIN));
  await signal(fresh, await source("fresh-b"), new Date(+NOW - MIN));
  const hidden = await readHotRankingDiagnostic(NOW);
  assert.equal(hidden.snapshot?.candidates, 0);
  assert.equal(hidden.eligible.now, 1, "one story qualifies now");
  assert.equal(hidden.eligible.atSnapshot, 0, "nothing qualified at computed_at");
  assert.equal(failing(hidden), "hot eligible candidates are not publicly visible");

  // Incomplete source evidence: no scheduled source has fetched recently, so a zero pass is not allowed.
  await sql`DELETE FROM story_signals WHERE story_id = ${fresh}`;
  await computeHotRanking(new Date(+NOW - MIN));
  await sql`UPDATE sources SET last_ok_at = ${new Date(+NOW - 3 * 3600_000)} WHERE id LIKE ${`${T}-%`}`;
  const lagging = await readHotRankingDiagnostic(NOW);
  assert.equal(lagging.snapshot?.candidates, 0);
  assert.equal(lagging.sources.behind, lagging.sources.scheduled);
  assert.equal(failing(lagging), "hot source collection is behind");
});
