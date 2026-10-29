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

test("manual membership and actual decision receipts survive without invented verdicts", () => {
  const result = storyFactDiagnosis(route([station("f1", "a")]), [
    { factId: "f1", articleId: "a", role: "primary", factManual: false, membershipManual: true },
  ], [
    { id: 7, articleId: "a", verdict: "new_fact", candidates: [{id: 1, score: 0.8}], receiptId: 9, createdAt: "2026-10-25" },
  ]);
  const row = result.facts[0]!.reports[0]!;
  assert.equal(row.manual, true);
  assert.equal(row.role, "primary");
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
    receiptId: i + 1, createdAt: "2026-10-25",
  }));
  decisions.push({ id: 99, articleId: "not-public", verdict: "merged", candidates: [], receiptId: 99, createdAt: "2026-10-25" });
  const result = storyFactDiagnosis(route([station("f1", "a")]), [], decisions);
  assert.deepEqual(result.facts[0]!.reports[0]!.groupingHistory.map(d=>d.id), [7,6,5,4,3]);
});
