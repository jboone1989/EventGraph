// The acceptance decision over the hot diagnostic is a contract boundary: the production smoke feeds
// it JSON from another process, so every branch must hold for arbitrary payloads, not just the ones
// the probe itself can produce (specs/prod-hot-ranking-release-gate-20261109). Fixtures are crafted
// aggregates; the database-backed probe has its own test file.
import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { HOT_RULE_VERSION } from "@aihot/backend/events/hot";
import { HOT_RANKING_FRESH_MS, evaluateHotAcceptance, parseHotDiagnostic, type HotDiagnostic } from "@aihot/backend/operations/hot-diagnostic";

const NOW = Date.parse("2099-03-01T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function diagnostic(overrides: Partial<HotDiagnostic> = {}, snapshot: Partial<HotDiagnostic["snapshot"]> | null = {}): HotDiagnostic {
  const base: HotDiagnostic = {
    probeAt: iso(NOW - 60_000),
    ruleVersion: HOT_RULE_VERSION,
    snapshot: snapshot === null ? null : {
      computedAt: iso(NOW - 5 * 60_000),
      ruleVersion: HOT_RULE_VERSION,
      storedEntries: 0,
      candidates: 0,
      ...snapshot,
    },
    publicEntries: 0,
    eligible: { now: 0, atSnapshot: 0 },
    sources: { scheduled: 12, behind: 0 },
    ...overrides,
  };
  return base;
}

const reasonOf = (payload: unknown, apiEntries = 0) => {
  const outcome = evaluateHotAcceptance(apiEntries, payload, NOW);
  assert.equal(outcome.accepted, false, `expected a failure, got ${JSON.stringify(outcome)}`);
  return outcome.reason;
};

test("a populated answer passes on a fresh, version-matched snapshot, including with lagging sources", () => {
  const payload = diagnostic({ publicEntries: 3, eligible: { now: 3, atSnapshot: 3 }, sources: { scheduled: 12, behind: 2 } }, { storedEntries: 3, candidates: 3 });
  const outcome = evaluateHotAcceptance(3, payload, NOW);
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.verdict, "populated");
});

test("an empty answer passes only as a proven sparse window: fresh, matching, zero everywhere, sources collecting", () => {
  const outcome = evaluateHotAcceptance(0, diagnostic(), NOW);
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.verdict, "expected sparse window");
  // The boundary is the spec's own: three runs of the 5-minute hot.rank cron, no rounding.
  const boundary = evaluateHotAcceptance(0, diagnostic(undefined, { computedAt: iso(NOW - HOT_RANKING_FRESH_MS) }), NOW);
  assert.equal(boundary.accepted && boundary.verdict, "expected sparse window");
  assert.equal(reasonOf(diagnostic(undefined, { computedAt: iso(NOW - HOT_RANKING_FRESH_MS - 1) })), "hot ranking is stale");
});

test("each evidence fault fails with its own reason", () => {
  assert.equal(reasonOf(diagnostic(undefined, null)), "hot ranking is absent");
  assert.equal(reasonOf(diagnostic(undefined, { computedAt: iso(NOW - 30 * 60_000) })), "hot ranking is stale");
  assert.equal(reasonOf(diagnostic(undefined, { computedAt: iso(NOW + 60_000) })), "hot ranking is stale", "a future computed_at is stale");
  assert.equal(reasonOf(diagnostic(undefined, { ruleVersion: "heat-v0" })), "hot rule version is unknown or mismatched");
  assert.equal(reasonOf(diagnostic({ ruleVersion: "heat-v0" })), "hot rule version is unknown or mismatched");
  assert.equal(reasonOf(diagnostic(undefined, { candidates: null })), "hot candidate evidence is missing");
  assert.equal(reasonOf(diagnostic(undefined, { candidates: 2 })), "hot eligible candidates are not publicly visible");
  assert.equal(reasonOf(diagnostic(undefined, { storedEntries: 2 })), "hot eligible candidates are not publicly visible");
  assert.equal(reasonOf(diagnostic({ eligible: { now: 2, atSnapshot: 0 } })), "hot eligible candidates are not publicly visible");
  assert.equal(reasonOf(diagnostic({ eligible: { now: 0, atSnapshot: 2 } })), "hot candidate counts disagree with the recomputed rules");
  assert.equal(reasonOf(diagnostic({ publicEntries: 2 })), "hot publication read layer disagrees with the public API");
  assert.equal(reasonOf(diagnostic({ publicEntries: 0 }, { storedEntries: 2, candidates: 2 }), 2), "hot publication read layer disagrees with the public API");
  assert.equal(reasonOf(diagnostic({ sources: { scheduled: 12, behind: 3 } })), "hot source collection is behind");
});

test("anything that is not the diagnostic contract fails closed as malformed", () => {
  assert.equal(reasonOf(null), "hot diagnostic payload is malformed");
  assert.equal(reasonOf("hot"), "hot diagnostic payload is malformed");
  assert.equal(reasonOf([]), "hot diagnostic payload is malformed");
  assert.equal(reasonOf({}), "hot diagnostic payload is malformed");
  for (const drop of ["probeAt", "ruleVersion", "snapshot", "publicEntries", "eligible", "sources"] as const) {
    const broken: Record<string, unknown> = { ...diagnostic() };
    delete broken[drop];
    assert.equal(reasonOf(broken), "hot diagnostic payload is malformed", `missing ${drop}`);
  }
  assert.equal(reasonOf({ ...diagnostic(), probeAt: "not a date" }), "hot diagnostic payload is malformed");
  assert.equal(reasonOf({ ...diagnostic(), publicEntries: -1 }), "hot diagnostic payload is malformed");
  assert.equal(reasonOf({ ...diagnostic(), eligible: { now: 1.5, atSnapshot: 0 } }), "hot diagnostic payload is malformed");
  // Values of the wrong type only exist after the JSON boundary, so they are crafted untyped.
  const withSnapshot = (snapshot: Record<string, unknown>) => ({ ...diagnostic(), snapshot });
  assert.equal(reasonOf(withSnapshot({ computedAt: 12, ruleVersion: HOT_RULE_VERSION, storedEntries: 0, candidates: 0 })), "hot diagnostic payload is malformed");
  assert.equal(reasonOf(withSnapshot({ computedAt: iso(NOW - 60_000), ruleVersion: HOT_RULE_VERSION, storedEntries: -2, candidates: 0 })), "hot diagnostic payload is malformed");
  assert.equal(reasonOf(withSnapshot({ computedAt: iso(NOW - 60_000), ruleVersion: HOT_RULE_VERSION, storedEntries: 0, candidates: "0" })), "hot diagnostic payload is malformed");
  assert.equal(reasonOf(diagnostic(), -1), "hot diagnostic payload is malformed", "a negative API count is not an answer either");
});

test("the diagnostic validates after crossing a process boundary, and its snapshot stays null for an absent ranking", () => {
  const round = parseHotDiagnostic(JSON.parse(JSON.stringify(diagnostic())));
  assert.deepEqual(round, diagnostic());
  assert.equal(parseHotDiagnostic(JSON.parse(JSON.stringify(diagnostic(undefined, null))))?.snapshot, null);
  assert.equal(parseHotDiagnostic({ ...diagnostic(), eligible: { now: 0, atSnapshot: null } })!.eligible.atSnapshot, null);
});
