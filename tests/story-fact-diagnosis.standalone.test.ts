import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoryRoute, StoryRouteStation } from "../packages/contracts/src/site.ts";
import { storyFactDiagnosis } from "../scripts/story-fact-diagnosis-core.ts";

const station = (id: string, articleId: string): StoryRouteStation => ({
  factId: id, title: `Fact ${id}`, subject: "issuer", action: "objected", object: "plan",
  timeEffective: null, timeRecorded: "2026-10-25T10:00:00Z", sourceCount: 1,
  uncertainty: { singleSource: true, occurredAtMissing: true, revised: false },
  reports: [{ articleId, url: `https://example.org/${articleId}`,
    source: "Example", publishedAt: "2026-10-24T10:00:00Z",
    discoveredAt: "2026-10-25T10:00:00Z", revision: null }],
});
const route = (stations: StoryRouteStation[], truncated = false): StoryRoute => ({
  schemaVersion: 1, story: { publicId: "test", title: "Evidence" },
  status: "ok", reason: null, generatedAt: "2026-10-26T00:00:00Z",
  limits: { stationLimit: 24, reportLimit: 6, truncated }, stations,
  coverage: { stations: stations.length, reports: stations.length, sources: 1 },
});

test("shared report is flagged for human inspection, not automatically merged", () => {
  const a = station("f1", "report"), b = station("f2", "report");
  const result = storyFactDiagnosis(route([a,b]), [], []);
  assert.equal(result.facts.length, 2);
  assert.deepEqual(result.facts[0]!.reports[0]!.alsoInFactIds, ["f2"]);
  assert.deepEqual(result.facts[1]!.reports[0]!.alsoInFactIds, ["f1"]);
  assert.equal(result.decision, "human_source_review_required");
  assert.equal(result.facts[0]!.reports[0]!.manual, null);
});

test("a visible report's memberships in other Facts are flagged without exposing other reports", () => {
  const external = { factId: "other-story-fact", articleId: "a", role: "report",
    factManual: false, membershipManual: false, evidence: null };
  const hidden = { ...external, factId: "private-fact", articleId: "not-public" };
  const result = storyFactDiagnosis(route([station("public-fact", "a")]),
    [external, hidden], []);
  assert.equal(result.facts.length, 1);
  assert.deepEqual(result.facts[0]!.reports[0]!.alsoInFactIds, ["other-story-fact"]);
  assert.equal(result.facts[0]!.reports[0]!.manual, null);
  assert.deepEqual(result.facts[0]!.reports[0]!.groupingHistory, []);
});

test("manual membership and actual decision receipts survive without invented verdicts", () => {
  const result = storyFactDiagnosis(route([station("f1", "a")]), [
    { factId: "f1", articleId: "a", role: "primary", factManual: false,
      membershipManual: true, evidence: "issuer filed a dated objection" },
  ], [
    { id: 7, articleId: "a", verdict: "new_fact", candidates: [{id: 1, score: 0.8}],
      factId: 42, storyId: 13, receiptId: 9, createdAt: "2026-10-25" },
  ]);
  const row = result.facts[0]!.reports[0]!;
  assert.equal(row.manual, true);
  assert.equal(row.role, "primary");
  assert.equal(row.membershipEvidence, "issuer filed a dated objection");
  assert.equal(row.groupingHistory[0]!.factId, 42);
  assert.equal(row.groupingHistory[0]!.storyId, 13);
  assert.equal(row.groupingHistory[0]!.receiptId, 9);
  assert.deepEqual(row.groupingHistory[0]!.candidates, [{id: 1, score: 0.8}]);
});

test("missing decision history stays empty: neither rejection nor recall failure is inferred", () => {
  const result = storyFactDiagnosis(route([station("f1", "a")]), [], []);
  assert.deepEqual(result.facts[0]!.reports[0]!.groupingHistory, []);
  assert.equal(result.facts[0]!.flags.occurrenceTimeMissing, true);
});

test("truncated public route cannot be presented as complete Fact audit", () => {
  const result = storyFactDiagnosis(route([station("f1", "a")], true), [], []);
  assert.equal(result.publicRouteUntruncated, false);
  assert.equal(result.facts[0]!.flags.routeTruncated, true);
});

test("decision history includes only visible reports and five most recent receipts", () => {
  const decisions = Array.from({length: 7}, (_, i) => ({
    id: i+1, articleId: "a", verdict: "new_fact", candidates: [],
    factId: null, storyId: null,
    receiptId: i + 1, createdAt: "2026-10-25",
  }));
  decisions.push({ id: 99, articleId: "not-public", verdict: "merged", candidates: [],
    factId: null, storyId: null, receiptId: 99, createdAt: "2026-10-25" });
  const result = storyFactDiagnosis(route([station("f1", "a")]), [], decisions);
  assert.deepEqual(result.facts[0]!.reports[0]!.groupingHistory.map(d=>d.id), [7,6,5,4,3]);
});

test("original source and revision stay attributable to the individual report", () => {
  const a = station("f1", "revised"), b = station("f1", "original");
  a.reports[0]!.revision = 3;
  b.reports[0]!.source = "Another outlet";
  const combined = { ...a, reports: [...a.reports, ...b.reports], sourceCount: 2 };
  const result = storyFactDiagnosis(route([combined]), [], []);
  assert.equal(result.facts[0]!.reports[0]!.revision, 3);
  assert.equal(result.facts[0]!.reports[0]!.source, "Example");
  assert.equal(result.facts[0]!.reports[1]!.revision, null);
  assert.equal(result.facts[0]!.reports[1]!.source, "Another outlet");
  assert.equal(result.facts[0]!.reports[1]!.membershipEvidence, null);
  assert.equal(result.facts[0]!.reports[1]!.groupingHistory.length, 0);
});

test("mention-only cross-Fact references are not mislabeled as shared occurrence evidence", () => {
  const result = storyFactDiagnosis(route([station("visible", "a")]), [
    { factId: "mentioned-fact", articleId: "a", role: "mention",
      factManual: false, membershipManual: false, evidence: null },
    { factId: "supported-fact", articleId: "a", role: "report",
      factManual: true, membershipManual: true, evidence: "public report" },
  ], []);
  const row = result.facts[0]!.reports[0]!;
  assert.deepEqual(row.alsoInFactIds, ["supported-fact"]);
  assert.deepEqual(row.mentionedInFactIds, ["mentioned-fact"]);
  assert.equal(result.decision, "human_source_review_required");
  assert.equal(result.facts.length, 1);
});


test("source tiers are recorded provenance, not independently verified originals", () => {
  const result = storyFactDiagnosis(route([station("f1", "a"), station("f2", "b")]), [], [], [
    { articleId: "a", tier: "T1", bodyMode: "summary" },
    { articleId: "b", tier: "T2", bodyMode: "full" },
  ]);
  assert.deepEqual(result.facts[0]!.reports[0]!.sourceRecord, {
    tier: "T1", bodyMode: "summary", attribution: "recorded_first_party",
    originalSourceVerified: false,
  });
  assert.deepEqual(result.facts[1]!.reports[0]!.sourceRecord, {
    tier: "T2", bodyMode: "full", attribution: "recorded_other",
    originalSourceVerified: false,
  });
});

test("missing source metadata stays unknown; unrelated records cannot enter public audit", () => {
  const result = storyFactDiagnosis(route([station("f1", "a")]), [], [], [
    { articleId: "not-public", tier: "T1", bodyMode: "full" },
  ]);
  assert.deepEqual(result.facts[0]!.reports[0]!.sourceRecord, {
    tier: null, bodyMode: null, attribution: "metadata_missing",
    originalSourceVerified: false,
  });
});
