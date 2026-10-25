import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoryDetail, StoryRoute, StoryRouteStation } from "@aihot/contracts/site";
import { impactLeadsAt, marketObservationAt } from "../app/features/story/impact-evidence.ts";

const t0 = "2026-10-20T12:00:00.000Z";
const t1 = "2026-10-21T12:00:00.000Z";
const t2 = "2026-10-22T12:00:00.000Z";
const report = (id: string, title: string, publishedAt = t0, discoveredAt = t1) => ({
  id, title, originalTitle: null, summary: null,
  source: { name: "Example publisher", firstParty: false }, publishedAt, discoveredAt,
  selected: true, english: null,
}) satisfies StoryDetail["timeline"][number];
const station = (id: string, url = "https://news.example.org/article") => ({
  factId: "f-" + id, title: "Reconstructed fact",
  timeEffective: null, timeRecorded: t1,
  reports: [{ articleId: id, url, source: "Example publisher",
    publishedAt: t0, discoveredAt: t1, revision: 2 }],
  sourceCount: 1, uncertainty: { singleSource: true, occurredAtMissing: true, revised: true },
}) satisfies StoryRouteStation;
const route = (stations: StoryRouteStation[]) => ({
  schemaVersion: 1, story: { publicId: "00000000-0000-0000-0000-000000000001", title: "A real event" },
  status: "ok", reason: null, generatedAt: t2,
  limits: { stationLimit: 24, reportLimit: 6, truncated: false },
  stations, coverage: { stations: stations.length, reports: stations.length, sources: 1 },
}) satisfies StoryRoute;

test("known clock rejects an earlier-published report which the system discovered later", () => {
  const r = route([station("p")]);
  const news = [report("p", "Sanctions announced")];
  assert.equal(impactLeadsAt(r, news, t0, "known").policy.length, 0);
  assert.equal(impactLeadsAt(r, news, t0, "valid").policy.length, 1);
  assert.equal(impactLeadsAt(r, news, t1, "known").policy.length, 1);
});

test("only current public route evidence with a dated, safe source URL is displayed", () => {
  const r = route([
    station("a"), station("missing"), station("bad", "javascript:alert(1)"),
    station("not-dated"), station("a"),
  ]);
  r.stations[3]!.reports[0]!.discoveredAt = "not-a-date";
  const news = [
    report("a", "港口航运中断"),
    report("bad", "Port shut"),
    report("not-dated", "Shipping disruption"),
    report("outside", "Sanctions announced"),
  ];
  const leads = impactLeadsAt(r, news, t2, "known");
  assert.deepEqual(leads.logistics.map(x => x.articleId), ["a"]);
  assert.equal(leads.policy.length, 0);
  assert.equal(leads.logistics[0]?.evidenceKind, "related_reporting");
  assert.equal(leads.logistics[0]?.revision, 2);
});

test("mentions and graph co-occurrence never become company damage or verified influence", () => {
  const r = route([station("m"), station("policy"), station("company")]);
  const news = [
    report("m", "Company Foo meets ministers in London"),
    report("policy", "New export restrictions proposed, not enacted"),
    report("company", "Company warns of factory shutdown after storm"),
  ];
  const leads = impactLeadsAt(r, news, t2, "known");
  assert.equal(leads.companies.length, 1);
  assert.equal(leads.policy.length, 1);
  assert.equal(leads.logistics.length, 0);
  assert.ok(Object.values(leads).flat().every(x => x.evidenceKind === "related_reporting"));
  // Keywords signal a report worth checking: this function does not assert policy
  // implementation, company impact, causes, or introduce graph edges.
});

test("missing route, missing source timestamp, and absent market data remain empty", () => {
  const news = [report("p", "Sanctions")];
  assert.equal(impactLeadsAt(null, news, t2, "known").policy.length, 0);
  assert.equal(impactLeadsAt(route([]), news, null, "known").policy.length, 0);
  assert.equal(marketObservationAt(null, t2), null);
});

test("markets cannot show an after-event price before that snapshot exists", () => {
  const market = { eventAt: t0, assets: [
    { asset: "BTC", before: { at: t0, priceUsdt: 100 }, after: { at: t2, priceUsdt: 101 } },
    { asset: "ETH", before: { at: t0, priceUsdt: 200 }, after: { at: t1, priceUsdt: 199 } },
  ] };
  assert.equal(marketObservationAt(market, t0), null);
  assert.deepEqual(marketObservationAt(market, t1)?.assets.map(x => x.asset), ["ETH"]);
  assert.deepEqual(marketObservationAt(market, t2)?.assets.map(x => x.asset), ["BTC", "ETH"]);
});
