// The admin surface of the candidate lifecycle (specs/007): the list with live trial state, hold,
// and one-click revival — through the real routes with a dev session, so wiring mistakes (a swapped
// argument, a missing await) fail here instead of in production. No network: candidates are
// registered and previewed on file, never fetched.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { markPreviewed, registerCandidates, startTrial } from "@aihot/backend/admin/lifecycle";
import { buildApp } from "../apps/api/src/app.ts";
import { tag } from "./setup.ts";

const T = tag();
config.devAdmin = { displayName: "Candidates test" };
const DEV_ACTOR = "dev:Candidates test";
const app = await buildApp();
const headers = { "x-csrf-token": "dev" };

after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

const cand = (id: string, patch: Record<string, unknown> = {}) => ({
  id: `${id}-${T}`,
  origin: { channel: "operator" },
  kind: "rss",
  name: `Candidate ${id}`,
  config: { feedUrl: `https://${id}.example.org/feed-${T}.xml`, publishedAfter: "2026-10-01T00:00:00.000Z", _aihot: { initialBackfillLimit: 5 }, ...patch },
  tags: [`gap-${T}`],
  rationale: "coverage gap",
});

test("the list shows status, preflight failures and the live trial source", async () => {
  const [listed] = await registerCandidates({ actor: "test", candidates: [cand("list")] });
  const [failed] = await registerCandidates({ actor: "test", candidates: [cand("bad", { publishedAfter: undefined })] });
  assert.equal(listed.status, "discovered");
  assert.equal(failed.status, "preflight_failed");
  await markPreviewed(`list-${T}`, { ok: true, count: 3, dated: 3, actor: "test" });
  const { started } = await startTrial(`list-${T}`, "test");
  assert.equal(started, true);

  const res = await app.inject({ method: "GET", url: "/api/admin/source-candidates" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  const mine = body.rows.filter((r: { id: string }) => r.id.endsWith(T));
  assert.equal(mine.length, 2);
  const trial = mine.find((r: { id: string }) => r.id === `list-${T}`);
  const refused = mine.find((r: { id: string }) => r.id === `bad-${T}`);
  assert.equal(trial.attached_source_id, `lc-list-${T}`);
  assert.equal(trial.source_enabled, true);
  assert.equal(trial.preflight.previewPassed, true);
  assert.ok(refused.preflight.reasons.includes("published-after"), "the preflight refusal is on file for the operator");
  assert.equal(body.totals.trial >= 1, true);

  const filtered = await app.inject({ method: "GET", url: `/api/admin/source-candidates?status=preflight_failed&q=${encodeURIComponent("Candidate bad")}` });
  assert.equal(filtered.statusCode, 200);
  const rows = filtered.json().rows as Array<{ id: string }>;
  assert.ok(rows.some((r) => r.id === `bad-${T}`));
  assert.ok(!rows.some((r) => r.id === `list-${T}`));

  // The list route is behind the admin session: without a session, and with the dev stand-in off,
  // it is a 401.
  config.devAdmin = null;
  try {
    assert.equal((await app.inject({ method: "GET", url: "/api/admin/source-candidates" })).statusCode, 401);
  } finally {
    config.devAdmin = { displayName: "Candidates test" };
  }
});

test("hold is applied by the session actor with the operator's reason, and unknown candidates 404", async () => {
  const id = `list-${T}`;
  const held = await app.inject({ method: "POST", url: `/api/admin/source-candidates/${id}/hold`, headers, payload: { hold: true, reason: "人工复核中" } });
  assert.equal(held.statusCode, 200);
  assert.equal(held.json().held, true);
  const [auditRow] = await sql`SELECT actor, reason FROM audit_log WHERE action = 'sourceLifecycle.hold' AND subject = ${`candidate:${id}`} ORDER BY created_at DESC LIMIT 1`;
  // A swapped argument order would put the reason in actor and the actor in note.
  assert.equal(auditRow!.actor, DEV_ACTOR);
  assert.equal(auditRow!.reason, "人工复核中");
  const [row] = await sql`SELECT manual_hold FROM source_candidates WHERE id = ${id}`;
  assert.equal(row!.manual_hold, true);

  // Malformed requests must never silently release a hold.
  for (const payload of [{ reason: "x" }, { hold: "false", reason: "x" }, { hold: false }, { hold: false, reason: "  " }]) {
    const rejected = await app.inject({ method: "POST", url: `/api/admin/source-candidates/${id}/hold`, headers, payload });
    assert.equal(rejected.statusCode, 400);
    const [stillHeld] = await sql`SELECT manual_hold FROM source_candidates WHERE id = ${id}`;
    assert.equal(stillHeld!.manual_hold, true);
  }

  // The refusal is a 404, not a silent success (a truthy unresolved promise would be).
  assert.equal((await app.inject({ method: "POST", url: `/api/admin/source-candidates/no-such-${T}/hold`, headers, payload: { hold: true, reason: "x" } })).statusCode, 404);
});

test("revival re-enables the source, restarts the trial window and is audited", async () => {
  const id = `list-${T}`;
  await sql`UPDATE source_candidates SET manual_hold = false, status = 'demoted', last_decision = 'demote' WHERE id = ${id}`;
  await sql`UPDATE sources SET enabled = false, health = 'paused' WHERE id = 'lc-' || ${id}`;
  const [before] = await sql`SELECT trial_started_at FROM source_candidates WHERE id = ${id}`;
  await sql`UPDATE source_candidates SET trial_started_at = now() - interval '30 days' WHERE id = ${id}`;

  // A revival without a reason is a client error, like every audited manual override.
  const refused = await app.inject({ method: "POST", url: `/api/admin/source-candidates/${id}/revive`, headers, payload: { reason: "  " } });
  assert.equal(refused.statusCode, 400);

  const revived = await app.inject({ method: "POST", url: `/api/admin/source-candidates/${id}/revive`, headers, payload: { reason: "再次需要该领域一手信源" } });
  assert.equal(revived.statusCode, 200);
  assert.equal(revived.json().revived, true);
  const [candRow] = await sql`SELECT status, trial_started_at, last_decision FROM source_candidates WHERE id = ${id}`;
  assert.equal(candRow!.status, "trial");
  assert.equal(candRow!.last_decision, "revived");
  assert.ok(candRow!.trial_started_at > before!.trial_started_at, "the evidence window restarts with the revival");
  const [src] = await sql`SELECT enabled FROM sources WHERE id = 'lc-' || ${id}`;
  assert.equal(src!.enabled, true);
  const [auditRow] = await sql`SELECT actor, action FROM audit_log WHERE action = 'sourceLifecycle.revive' AND subject = ${`candidate:${id}`} ORDER BY created_at DESC LIMIT 1`;
  assert.equal(auditRow!.actor, DEV_ACTOR);

  // Only demoted and retired candidates may be revived.
  const again = await app.inject({ method: "POST", url: `/api/admin/source-candidates/${id}/revive`, headers, payload: { reason: "再来一次" } });
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().revived, false);
  assert.match(again.json().reason, /status:trial/);
});


test("expired event candidates are not revived into an immediately expired trial", async () => {
  const id = `expired-${T}`;
  const [registered] = await registerCandidates({ actor: "test", candidates: [cand("expired")] });
  assert.equal(registered.status, "discovered");
  await markPreviewed(id, { ok: true, count: 2, dated: 2, actor: "test" });
  assert.equal((await startTrial(id, "test")).started, true);
  await sql`UPDATE source_candidates
    SET status = 'retired', expires_at = now() - interval '1 day'
    WHERE id = ${id}`;
  await sql`UPDATE sources SET enabled = false WHERE id = ${`lc-${id}`}`;

  const res = await app.inject({
    method: "POST", url: `/api/admin/source-candidates/${id}/revive`,
    headers, payload: { reason: "重新启用已结束事件" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().revived, false);
  assert.equal(res.json().reason, "expired");
  const [candidate] = await sql`SELECT status FROM source_candidates WHERE id = ${id}`;
  const [source] = await sql`SELECT enabled FROM sources WHERE id = ${`lc-${id}`}`;
  assert.equal(candidate!.status, "retired");
  assert.equal(source!.enabled, false);
});
