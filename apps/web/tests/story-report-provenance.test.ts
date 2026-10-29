import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoryRoute, StoryRouteStation } from "@aihot/contracts/site";
import { reportProvenance } from "../app/features/story/report-provenance.ts";

const station = (
  factId: string, articleId: string, opts: {
    source?: boolean; time?: boolean; revised?: boolean;
  } = {},
): StoryRouteStation => ({
  factId, title: factId, subject: null, action: null, object: null,
  timeEffective: opts.time ? null : "2026-10-25T10:00:00Z",
  timeRecorded: "2026-10-26T10:00:00Z",
  sourceCount: opts.source ? 1 : 2,
  uncertainty: {
    singleSource: !!opts.source,
    occurredAtMissing: !!opts.time,
    revised: !!opts.revised,
  },
  reports: [{
    articleId, url: "https://example.org/report", source: "Example",
    publishedAt: "2026-10-25T10:00:00Z",
    discoveredAt: "2026-10-26T10:00:00Z",
    revision: opts.revised ? 2 : 1,
  }],
});
const route = (...stations: StoryRouteStation[]) =>
  ({ status: "ok", stations } as StoryRoute);

test("story timeline reports carry verifiable source uncertainty without rewriting fact IDs", () => {
  const facts = [station("fact-a", "article-a", { source: true, time: true, revised: true })];
  const evidence = reportProvenance(route(...facts));
  assert.deepEqual(evidence.get("article-a"), {
    revised: true, singleSourceFact: true, reportTimeOnly: true,
  });
  assert.equal(facts[0]!.factId, "fact-a");
  assert.equal(evidence.size, 1);
});

test("multiple distinct facts sharing one report do not imply one shared uncertainty", () => {
  const evidence = reportProvenance(route(
    station("fact-a", "article-a", { source: true, time: true }),
    station("fact-b", "article-a", { source: false, time: false, revised: true }),
  ));
  assert.deepEqual(evidence.get("article-a"), {
    revised: true, singleSourceFact: false, reportTimeOnly: false,
  });
});

test("fact revisions remain visible even when the linked source report is unchanged", () => {
  const fact = station("fact-a", "article-a", { revised: true });
  const evidence = reportProvenance(route({
    ...fact,
    reports: fact.reports.map(report => ({ ...report, revision: 1 })),
  }));
  assert.deepEqual(evidence.get("article-a"), {
    revised: true, singleSourceFact: false, reportTimeOnly: false,
  });
});

test("a missing or insufficient route adds no invented evidence markers", () => {
  assert.equal(reportProvenance(null).size, 0);
  assert.equal(reportProvenance({ status: "insufficient", stations: [] } as unknown as StoryRoute).size, 0);
});
