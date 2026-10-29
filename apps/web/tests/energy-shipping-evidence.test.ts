import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoryDetail, StoryRoute, StoryRouteStation } from "@aihot/contracts/site";
import { energyShippingEvidenceAt } from "../app/features/story/energy-shipping-evidence.ts";

const published = "2026-10-20T12:00:00Z", discovered = "2026-10-22T12:00:00Z";
const report = (id: string, title: string) => ({
  id, title, originalTitle: null, summary: null, english: null, selected: true,
  source: { name: "EIA", firstParty: true }, publishedAt: published, discoveredAt: discovered,
}) satisfies StoryDetail["timeline"][number];
const station = (id: string, url: string) => ({
  factId: id, title: "Station", timeEffective: null, timeRecorded: discovered,
  reports: [{ articleId: id, url, source: "Existing public feed", publishedAt: published,
    discoveredAt: discovered, revision: null }], sourceCount: 1,
  uncertainty: { singleSource: true, occurredAtMissing: true, revised: false },
}) satisfies StoryRouteStation;
const route = (stations: StoryRouteStation[]) => ({
  schemaVersion: 1, story: { publicId: "test", title: "Test" }, status: "ok", reason: null,
  generatedAt: discovered, limits: { stationLimit: 24, reportLimit: 6, truncated: false },
  stations, coverage: { stations: stations.length, reports: stations.length, sources: 1 },
}) satisfies StoryRoute;

test("existing EIA and shipping station evidence is typed, deduplicated and retains provenance", () => {
  const eia = station("e", "https://www.eia.gov/todayinenergy/detail.php?id=1");
  const shipping = station("s", "https://gcaptain.com/shipping-report/");
  const out = energyShippingEvidenceAt(route([shipping, eia, eia]),
    [report("e", "Crude oil inventories"), report("s", "Tanker at Strait of Hormuz")], discovered, "known");
  assert.deepEqual(out.energy.map(x => [x.articleId, x.sourceKind]), [["e", "eia_reporting"]]);
  assert.deepEqual(out.shipping.map(x => [x.articleId, x.sourceKind]), [["s", "shipping_reporting"]]);
  assert.equal(out.energy[0]?.publishedAt, published);
  assert.equal(out.energy[0]?.discoveredAt, discovered);
  assert.equal(out.energy[0]?.revision, null);
  assert.equal(out.shipping[0]?.evidenceKind, "related_reporting");
  assert.ok(!("value" in out.energy[0]!) && !("price" in out.energy[0]!));
});

test("shared replay rejects future discovery, embargoes, unpublished reports and missing routes", () => {
  const s = station("e", "https://www.eia.gov/pressroom/releases.php");
  const news = [report("e", "Energy outlook")], r = route([s]);
  assert.equal(energyShippingEvidenceAt(r, news, published, "known").energy.length, 0);
  assert.equal(energyShippingEvidenceAt(r, news, published, "valid").energy.length, 1);
  s.reports[0]!.publishedAt = "2026-10-23T12:00:00Z";
  assert.equal(energyShippingEvidenceAt(r, news, discovered, "known").energy.length, 0);
  assert.equal(energyShippingEvidenceAt(r, news, discovered, "valid").energy.length, 0);
  assert.deepEqual(energyShippingEvidenceAt(null, news, discovered, "known"), { energy: [], shipping: [] });
  assert.equal(energyShippingEvidenceAt(r, [], discovered, "known").energy.length, 0);
  assert.equal(energyShippingEvidenceAt(r, news, "invalid", "known").energy.length, 0);
});

test("source names, EIA mentions, lookalike hosts and unsafe URLs never authenticate EIA", () => {
  for (const url of ["https://eia.gov.evil.test/report", "https://evil.test/eia.gov",
    "http://www.eia.gov/report", "https://eia.gov@evil.test/report",
    "https://user:pass@www.eia.gov/report", "javascript:alert(1)"]) {
    const out = energyShippingEvidenceAt(route([station("x", url)]),
      [report("x", "EIA energy prices")], discovered, "known");
    assert.equal(out.energy.length, 0, url);
  }
});

test("PortWatch remains excluded and numerical report text never becomes an observation", () => {
  const rows = [station("p", "https://portwatch.imf.org/"), station("f", "https://gcaptain.com/report")];
  const out = energyShippingEvidenceAt(route(rows),
    [report("p", "PortWatch tanker counts 0"), report("f", "Shipping freight index rises to 123")], discovered, "known");
  assert.deepEqual(out.shipping.map(x => x.articleId), ["f"]);
  assert.equal(out.shipping[0]?.title, "Shipping freight index rises to 123");
  assert.ok(out.shipping.every(x => !Object.keys(x).some(k => /price|value|count|change|baseline/i.test(k))));
});
