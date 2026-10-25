// Candidate persistence, dedupe, trial start and the promote/demote decisions on real tables
// (specs/007). No network: preview is recorded, not fetched. autoPromote stays off for the dry-run
// half and is switched on only inside this file's own database copy.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { evaluateCandidate, markPreviewed, registerCandidates, startTrial } from "@aihot/backend/admin/lifecycle";

const T = tag();
const ACTOR = "test-lifecycle";
// Tags no seeded or sibling-trial source can carry, so coverage gain is deterministic.
const gap = (id: string) => [`gap-${id}-a-${T}`, `gap-${id}-b-${T}`, `gap-${id}-c-${T}`];
const cand = (id: string, patch: Record<string, unknown> = {}) => ({
  id: `${id}-${T}`,
  origin: { channel: "operator" },
  kind: "rss",
  name: `Candidate ${id}`,
  config: { feedUrl: `https://${id}.example.org/feed.xml`, publishedAfter: "2026-10-01T00:00:00.000Z", _aihot: { initialBackfillLimit: 5 } },
  tags: gap(id),
  rationale: "coverage gap: sanctions",
  ...patch,
});

before(async () => {
  // A pre-existing source the duplicate candidate collides with.
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes)
    VALUES (${`dup-${T}`}, 'Dup', 'rss', ${sql.json({ feedUrl: `https://dup.example.org/feed.xml` })}, 'T2', 'editorial', 60)`;
});

test("register: valid candidates persist, duplicates and invalid ones are refused on file", async () => {
  const [ok, dup, invalid] = await registerCandidates({ actor: ACTOR, candidates: [
    cand("good"),
    cand("duphit", { config: { feedUrl: "https://dup.example.org/feed.xml", publishedAfter: "2026-10-01T00:00:00.000Z", _aihot: { initialBackfillLimit: 5 } } }),
    cand("noafter", { config: { feedUrl: "https://noafter.example.org/feed.xml", _aihot: { initialBackfillLimit: 5 } } }),
  ] });
  assert.equal(ok.status, "discovered");
  assert.equal(dup.status, "preflight_failed");
  assert.equal(dup.duplicateOf?.id, `dup-${T}`);
  assert.ok(invalid.preflightReasons.includes("published-after"));
  const rows = await sql`SELECT status FROM source_candidates WHERE id = ${`good-${T}`}`;
  assert.equal(rows.length, 1);
  // Re-registering the same candidate changes nothing.
  const [again] = await registerCandidates({ actor: ACTOR, candidates: [cand("good")] });
  assert.ok(again.preflightReasons.includes("duplicate-candidate-id"));
  const [auditRow] = await sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'sourceLifecycle.register' AND subject = ${`candidate:good-${T}`}`;
  assert.equal(auditRow.n, 1);
});

test("trial: no preview means no source; a passed preview creates a T2 hot_signal source", async () => {
  const id = `good-${T}`;
  const refused = await startTrial(id, ACTOR);
  assert.equal(refused.started, false);
  assert.equal(refused.reason, "preview-not-passed");
  assert.equal(await markPreviewed(id, { ok: true, count: 12, dated: 10, actor: ACTOR }), true);
  const started = await startTrial(id, ACTOR);
  assert.equal(started.started, true);
  const [src] = await sql`SELECT tier, participation_mode, enabled, tags FROM sources WHERE id = 'lc-' || ${id}`;
  assert.equal(src.tier, "T2");
  assert.equal(src.participation_mode, "hot_signal");
  assert.equal(src.enabled, true);
  const [dateGate] = await sql<{ config: { publishedAfter: string } }[]>`SELECT config FROM sources WHERE id = 'lc-' || ${id}`;
  assert.ok(Date.parse(dateGate!.config.publishedAfter) > Date.parse("2026-10-24T00:00:00Z"),
    "a newly activated candidate must ingest only future publications");
  assert.ok(src.tags.includes("lifecycle-trial"));
  const [candRow] = await sql`SELECT status, attached_source_id FROM source_candidates WHERE id = ${id}`;
  assert.equal(candRow.status, "trial");
  assert.equal(candRow.attached_source_id, `lc-${id}`);
  // A second trial start is refused.
  assert.equal((await startTrial(id, ACTOR)).started, false);
});

const day = (n: number) => new Date(Date.now() - n * 86_400_000);

async function makeTrial(id: string, patch: Record<string, unknown>, evidence: {
  items: [number, boolean][]; runs: [number, string][]; selected?: number; startDays: number;
}): Promise<string> {
  await registerCandidates({ actor: ACTOR, candidates: [cand(id, patch)] });
  await markPreviewed(`${id}-${T}`, { ok: true, count: 10, dated: 10, actor: ACTOR });
  const { sourceId } = (await startTrial(`${id}-${T}`, ACTOR)) as { started: true; sourceId: string };
  await sql`UPDATE source_candidates SET trial_started_at = ${day(evidence.startDays)} WHERE id = ${`${id}-${T}`}`;
  // An older source already delivered the duplicated identities; one real-world item is one article
  // row owned by whoever found it first, and the trial source's later find is an article_discoveries row.
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes)
    VALUES (${`old-${id}-${T}`}, 'Old', 'rss', ${sql.json({ feedUrl: `https://old-${id}.example.org/feed.xml` })}, 'T2', 'editorial', 60)`;
  let n = 0;
  for (const [daysAgo, exclusive] of evidence.items) {
    const key = `${T}-${id}-${n}`;
    if (exclusive) {
      const [row] = await sql`INSERT INTO articles (id, source_id, identity_key, url, title, published_at, discovered_at, timeline_at)
        VALUES (${`a-${key}-t`}, ${sourceId}, ${key}, ${`https://new.example.org/${key}`}, 'Item', ${day(daysAgo)}, ${day(daysAgo)}, ${day(daysAgo)}) RETURNING id`;
      if (evidence.selected && n + 1 <= evidence.selected) {
        await sql`INSERT INTO publications (article_id, source_id, selected, title, channel, url, discovered_at, timeline_at, sort_at)
          VALUES (${row.id}, ${sourceId}, true, 'Item', 'news', ${`https://new.example.org/${key}`}, ${day(daysAgo)}, ${day(daysAgo)}, ${day(daysAgo)})`;
      }
    } else {
      const [row] = await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
        VALUES (${`a-${key}-o`}, ${`old-${id}-${T}`}, ${key}, ${`https://old.example.org/${key}`}, 'First', ${day(daysAgo + 1)}, ${day(daysAgo + 1)}) RETURNING id`;
      await sql`INSERT INTO article_discoveries (article_id, source_id, via, discovered_at)
        VALUES (${row.id}, ${sourceId}, 'fetch', ${day(daysAgo)})`;
    }
    n += 1;
  }
  for (const [daysAgo, status] of evidence.runs) {
    await sql`INSERT INTO fetch_runs (source_id, started_at, finished_at, status) VALUES (${sourceId}, ${day(daysAgo)}, ${day(daysAgo)}, ${status})`;
  }
  return `${id}-${T}`;
}

test("dry-run: with autoPromote off the decision is recorded and nothing is applied", async () => {
  const cid = await makeTrial("dry", {}, {
    items: [[2, true], [3, true], [4, true], [5, false], [6, false], [7, false]],
    runs: [[1, "ok"], [2, "ok"], [3, "ok"], [4, "ok"]],
    selected: 2, startDays: 20,
  });
  const result = await evaluateCandidate(cid, { actor: ACTOR });
  assert.ok(result);
  assert.equal(result.applied, false);
  assert.equal(result.decision.action, "promote");
  assert.equal(result.evidence.exclusive, 3);
  assert.equal(result.evidence.items, 6);
  const [src] = await sql`SELECT participation_mode, enabled FROM sources WHERE id = 'lc-' || ${cid}`;
  assert.equal(src.participation_mode, "hot_signal");
  assert.equal(src.enabled, true);
  const [candRow] = await sql`SELECT last_decision, status FROM source_candidates WHERE id = ${cid}`;
  assert.equal(candRow.last_decision, "promote");
  assert.equal(candRow.status, "trial");
});

test("autoPromote on: promotion flips the trial source to editorial through updateSource", async () => {
  await sql`INSERT INTO settings (key, value, updated_by) VALUES ('sourceLifecycle.autoPromote', ${sql.json({ enabled: true })}, 'test')`;
  const cid = await makeTrial("winner", {}, {
    items: [[2, true], [3, true], [4, true], [5, false]],
    runs: [[1, "ok"], [2, "ok"], [3, "ok"]],
    selected: 1, startDays: 20,
  });
  const result = await evaluateCandidate(cid, { actor: ACTOR });
  assert.equal(result?.applied, true);
  assert.equal(result?.decision.action, "promote");
  const [src] = await sql`SELECT participation_mode, enabled FROM sources WHERE id = 'lc-' || ${cid}`;
  assert.equal(src.participation_mode, "editorial");
  assert.equal(src.enabled, true);
  const [candRow] = await sql`SELECT status FROM source_candidates WHERE id = ${cid}`;
  assert.equal(candRow.status, "promoted");
  const [auditRow] = await sql`SELECT count(*)::int AS n FROM audit_log WHERE actor = ${ACTOR} AND subject = ${`candidate:${cid}`}`;
  assert.ok(auditRow.n >= 3, "register, startTrial and evaluate are all audited");
});

test("autoPromote on: pure duplicates are demoted and disabled, officials are protected", async () => {
  // A tag another enabled source already carries: the copycat adds no coverage.
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, tags)
    VALUES (${`cover-${T}`}, 'Cover', 'rss', ${sql.json({ feedUrl: `https://cover.example.org/feed.xml` })}, 'T2', 'editorial', 60, ${sql.array([`covered-${T}`])})`;
  const dupCid = await makeTrial("copycat", { tags: [`covered-${T}`] }, {
    items: [[2, false], [3, false], [4, false], [5, false]],
    runs: [[1, "ok"], [2, "ok"], [3, "ok"]],
    startDays: 20,
  });
  const demoted = await evaluateCandidate(dupCid, { actor: ACTOR });
  assert.equal(demoted?.decision.action, "demote");
  assert.equal(demoted?.applied, true);
  const [dupSrc] = await sql`SELECT enabled FROM sources WHERE id = 'lc-' || ${dupCid}`;
  assert.equal(dupSrc.enabled, false);
  const [dupCand] = await sql`SELECT status FROM source_candidates WHERE id = ${dupCid}`;
  assert.equal(dupCand.status, "demoted");

  // A sanctions body that published nothing in three weeks: volume never retires it.
  const officialCid = await makeTrial("ofac", { officialLowFrequency: true }, {
    items: [], runs: [[1, "ok"], [5, "ok"]], startDays: 21,
  });
  const kept = await evaluateCandidate(officialCid, { actor: ACTOR });
  assert.equal(kept?.decision.action, "keep");
  assert.ok(kept?.decision.reasons.includes("official-low-frequency-protected"));
  const [officialSrc] = await sql`SELECT enabled FROM sources WHERE id = 'lc-' || ${officialCid}`;
  assert.equal(officialSrc.enabled, true);
});

after(async () => {
  await stopBoss();
  await closeDb();
});
