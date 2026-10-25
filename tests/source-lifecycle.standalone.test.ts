// Pure-lifecycle tests (specs/007): preflight refusals, the six-dimension score and the hard rules
// that decide a trial. No database, no network.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BACKFILL_LIMIT_MAX, DiscoveredSource, EXCLUSIVE_PROMOTE, MIN_TRIAL_DAYS,
  decideCandidate, preflightCandidate, scoreCandidate, type TrialEvidence,
} from "../packages/backend/src/admin/lifecycle.ts";

const base = {
  id: "cand-x",
  origin: { channel: "operator" as const },
  kind: "rss" as const,
  name: "X",
  config: {
    feedUrl: "https://example.org/feed.xml",
    publishedAfter: "2026-10-01T00:00:00.000Z",
    _aihot: { initialBackfillLimit: 5 },
  },
  tags: ["制裁"],
  rationale: "coverage gap",
};

const candidate = (patch: Record<string, unknown>) => DiscoveredSource.parse({ ...base, ...patch });

test("a complete candidate passes preflight and gets a normalized identity", () => {
  const pre = preflightCandidate(candidate({}));
  assert.equal(pre.ok, true);
  assert.deepEqual(pre.reasons, []);
  assert.equal(pre.identity, "https://example.org/feed.xml");
});

test("preflight refuses each rule it exists to enforce", () => {
  // A key no collector implements (also how site-specific crawler configs are kept out).
  assert.ok(preflightCandidate(candidate({ config: { ...base.config, itemSelector: "div.card" } })).reasons.join().includes("unsupported-config"));
  assert.ok(preflightCandidate(candidate({ config: { ...base.config, publishedAfter: "2026-10-01" } })).reasons.includes("published-after"));
  assert.ok(preflightCandidate(candidate({ config: { ...base.config, _aihot: { initialBackfillLimit: BACKFILL_LIMIT_MAX + 1 } } })).reasons.includes("backfill-limit"));
  assert.ok(preflightCandidate(candidate({ config: { ...base.config, feedUrl: "http://user:pass@example.org/feed" } })).reasons.includes("address"));
  assert.ok(preflightCandidate(candidate({ origin: { channel: "breaking_event" } })).reasons.includes("expires-at"));
  assert.equal(preflightCandidate(candidate({ origin: { channel: "breaking_event" }, expiresAt: "2026-11-01T00:00:00.000Z" })).ok, true);
});

const strongEvidence: TrialEvidence = {
  trialDays: 20, runs: 100, failed: 2, items: 40, dated: 38, exclusive: 30, selected: 8,
  everOutput: true, healthFailing: false,
};

test("the score rewards exclusivity, dating, reliability and selection", () => {
  assert.ok(scoreCandidate(strongEvidence, 3) >= 70);
  assert.ok(scoreCandidate({ ...strongEvidence, items: 0, exclusive: 0, dated: 0, selected: 0 }, 0) < 40);
  // Same output but nothing exclusive and no new coverage: the duplicate case.
  assert.ok(scoreCandidate({ ...strongEvidence, exclusive: 0 }, 0) < scoreCandidate(strongEvidence, 3));
});

const flags = (patch: Partial<Parameters<typeof decideCandidate>[0]> = {}) => ({
  status: "trial" as const, officialLowFrequency: false, manualHold: false,
  expiresAt: null, previewPassed: true, ...patch,
});

test("hard rules decide before the score does", () => {
  // An official low-frequency publisher is never retired for being quiet.
  const quiet = decideCandidate(flags({ officialLowFrequency: true }), { ...strongEvidence, items: 0, exclusive: 0, dated: 0, selected: 0, everOutput: false }, 1);
  assert.equal(quiet.action, "keep");
  assert.ok(quiet.reasons.includes("official-low-frequency-protected"));
  // Only technical failure ends it.
  assert.equal(decideCandidate(flags({ officialLowFrequency: true }), { ...strongEvidence, healthFailing: true }, 1).action, "retire");
  // A young trial is never judged; a silent one past the minimum retires.
  assert.equal(decideCandidate(flags(), { ...strongEvidence, trialDays: MIN_TRIAL_DAYS - 1 }, 3).reasons.includes("trial-too-young"), true);
  assert.equal(decideCandidate(flags(), { ...strongEvidence, items: 0, exclusive: 0, dated: 0, selected: 0, everOutput: false }, 1).action, "retire");
  // Pure duplication with no new coverage is demoted.
  assert.equal(decideCandidate(flags(), { ...strongEvidence, exclusive: Math.floor(strongEvidence.items * (EXCLUSIVE_PROMOTE / 2)) }, 0).action, "demote");
  // A manual hold freezes the chain; a candidate outside trial is never moved.
  assert.equal(decideCandidate(flags({ manualHold: true }), strongEvidence, 3).reasons.includes("manual-hold"), true);
  assert.equal(decideCandidate(flags({ status: "promoted" }), strongEvidence, 3).reasons.includes("not-in-trial"), true);
});

test("a breaking-event source exits with the event unless it proved itself", () => {
  const expired = { ...flags(), expiresAt: new Date("2026-10-20T00:00:00Z"), now: new Date("2026-10-25T00:00:00Z") };
  const proven = decideCandidate(expired, strongEvidence, 0);
  assert.equal(proven.action, "promote");
  assert.ok(proven.reasons.includes("breaking-event-proved-itself"));
  const unproven = decideCandidate(expired, { ...strongEvidence, items: 0, exclusive: 0, dated: 0, selected: 0, everOutput: true }, 3);
  assert.equal(unproven.action, "retire");
  assert.ok(unproven.reasons.includes("breaking-event-over"));
});

test("promotion needs score, exclusivity and a passed preview together", () => {
  assert.equal(decideCandidate(flags(), strongEvidence, 3).action, "promote");
  assert.equal(decideCandidate(flags({ previewPassed: false }), strongEvidence, 3).action !== "promote", true);
  assert.equal(decideCandidate(flags(), { ...strongEvidence, exclusive: 4 }, 3).action !== "promote", true);
  assert.equal(decideCandidate(flags(), { ...strongEvidence, runs: 100, failed: 60, dated: 5, selected: 0 }, 0).action, "demote");
  assert.equal(decideCandidate(flags(), { ...strongEvidence, selected: 0, dated: 20 }, 1).action, "keep");
});
