import assert from "node:assert/strict";
import { test } from "node:test";
import type { CaseStudyResponse, StoryRouteStation } from "@aihot/contracts/site";
import { caseStudyAt } from "../app/features/story/case-time.ts";

const early = "2026-10-20T12:00:00.000Z";
const later = "2026-10-22T12:00:00.000Z";
const station = (id: string, discoveredAt = later): StoryRouteStation => ({
  factId: id, title: id, timeEffective: null, timeRecorded: discoveredAt,
  reports: [{ articleId: id, url: "https://example.org/" + id, source: "Wire",
    publishedAt: early, discoveredAt, revision: null }],
  sourceCount: 1, uncertainty: { singleSource: true, occurredAtMissing: true, revised: false },
});
const fixture = (): CaseStudyResponse => ({
  schemaVersion: 1, id: "test", title: "案例", titleEn: "Case", summary: "当前描述", summaryEn: "Current description",
  updated: "2026-10-26", generatedAt: later,
  tracks: ["a", "b"].map(key => ({ key, label: key, labelEn: key,
    story: { publicId: key, title: key }, status: "ok", stations: [station(key)],
    coverage: { stations: 1, reports: 1, sources: 1 } })),
  links: [{ key: "link", from: "a", to: "b", type: "citation", note: "后来的解释", noteEn: "Later interpretation",
    evidence: { url: "https://example.org/link", source: "Wire", publishedAt: early }, curatedAt: "2026-10-26" }],
  unlinked: [{ track: "a", note: "当前核对未联系", noteEn: "Currently unlinked" }],
});

test("case replay removes stations and links before their evidence was recorded", () => {
  const source = fixture();
  const at = caseStudyAt(source, early, "known");
  assert.deepEqual(at.tracks.map(t => t.stations), [[], []]);
  assert.deepEqual(at.tracks.map(t => t.coverage), [
    { stations: 0, reports: 0, sources: 0 }, { stations: 0, reports: 0, sources: 0 },
  ]);
  assert.deepEqual(at.links, []);
  assert.equal(source.tracks[0]!.stations.length, 1, "projection must not mutate the current public data");
});

test("valid time uses source publication while known time uses discovery", () => {
  assert.equal(caseStudyAt(fixture(), early, "valid").tracks[0]!.stations.length, 1);
  assert.equal(caseStudyAt(fixture(), early, "known").tracks[0]!.stations.length, 0);
});

test("later curated interpretations stay out of known history even if the cited source is old", () => {
  assert.deepEqual(caseStudyAt(fixture(), later, "known").links, []);
  assert.deepEqual(caseStudyAt(fixture(), "2026-10-26T12:00:00Z", "known").links, [], "date-only curation has no known hour");
  assert.equal(caseStudyAt(fixture(), "2026-10-27T00:00:00Z", "known").links.length, 1);
  assert.deepEqual(caseStudyAt(fixture(), later, "known").unlinked, [], "undated editorial notes are current metadata");
});

test("future publication, missing publication and unproven dates cannot leak into replay", () => {
  const data = fixture();
  const reports = data.tracks[0]!.stations[0]!.reports;
  reports[0]!.discoveredAt = early;
  reports[0]!.publishedAt = later;
  assert.equal(caseStudyAt(data, early, "known").tracks[0]!.stations.length, 0);
  reports[0]!.publishedAt = null;
  assert.equal(caseStudyAt(data, early, "valid").tracks[0]!.stations.length, 0);
  reports[0]!.discoveredAt = "invalid";
  assert.equal(caseStudyAt(data, early, "known").tracks[0]!.stations.length, 0);
  assert.equal(caseStudyAt(data, "invalid", "known"), data, "an invalid deep link must recover the latest view");
});

test("replay recomputes evidence counts and drops links when an endpoint has no evidence", () => {
  const data = fixture();
  data.tracks[1]!.stations = [];
  const s = data.tracks[0]!.stations[0]!;
  s.reports.push({ ...s.reports[0]!, articleId: "future", source: "Other", discoveredAt: "2026-11-01T00:00:00Z" });
  s.sourceCount = 2;
  const at = caseStudyAt(data, "2026-10-27T00:00:00Z", "known");
  assert.deepEqual(at.tracks[0]!.coverage, { stations: 1, reports: 1, sources: 1 });
  assert.equal(at.tracks[0]!.stations[0]!.uncertainty.singleSource, true);
  assert.equal(at.tracks[1]!.status, "insufficient");
  assert.deepEqual(at.links, []);
});

test("latest view preserves the current case including negative examples", () => {
  const data = fixture();
  assert.equal(caseStudyAt(data, null, "known"), data);
});

test("station order retains the server's earliest discovery when selected evidence is filtered", () => {
  const data = fixture();
  const first = station("originally-first", "2026-10-20T00:00:00Z");
  first.reports[0]!.publishedAt = "2026-10-30T00:00:00Z";
  first.reports.push({ ...first.reports[0]!, articleId: "visible-later", publishedAt: early, discoveredAt: "2026-10-23T00:00:00Z" });
  const second = station("originally-second", "2026-10-22T00:00:00Z");
  data.tracks[0]!.stations = [first, second];
  for (const clock of ["known", "valid"] as const) {
    const stations = caseStudyAt(data, "2026-10-24T00:00:00Z", clock).tracks[0]!.stations;
    assert.deepEqual(stations.map(s => s.factId), ["originally-first", "originally-second"]);
    assert.equal(stations[0]!.timeRecorded, "2026-10-20T00:00:00Z");
  }
});

test("a truncated report list cannot rewrite authoritative station source aggregates", () => {
  const data = fixture();
  const s = data.tracks[0]!.stations[0]!;
  s.sourceCount = 8;
  s.uncertainty.singleSource = false;
  s.timeRecorded = "2026-10-19T00:00:00Z";
  const at = caseStudyAt(data, "2026-10-27T00:00:00Z", "known");
  assert.equal(at.tracks[0]!.stations[0]!.sourceCount, 8);
  assert.equal(at.tracks[0]!.stations[0]!.uncertainty.singleSource, false);
  assert.equal(at.tracks[0]!.stations[0]!.timeRecorded, "2026-10-19T00:00:00Z");
  assert.deepEqual(at.tracks[0]!.coverage, { stations: 1, reports: 1, sources: 1 }, "displayed coverage is a lower bound, not full station metadata");
});

test("date-only and zoneless cutoffs recover latest instead of an empty historical case", () => {
  const data = fixture();
  for (const asOf of ["2026-10-20", "2026-10-20T12:00:00", "invalid"]) {
    assert.equal(caseStudyAt(data, asOf, "known"), data);
  }
});
