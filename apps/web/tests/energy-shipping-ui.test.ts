import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

test("source drawer renders bilingual evidence and honest gaps at the shared cutoff", async () => {
  const server = await createServer({
    root: new URL("..", import.meta.url).pathname, configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
  });
  try {
    const { EnergyShippingEvidence } = await server.ssrLoadModule("/app/features/story/EnergyShippingEvidence.tsx");
    const publishedAt = "2026-10-20T12:00:00Z", discoveredAt = "2026-10-22T12:00:00Z";
    const report = { id: "energy", title: "能源报告", originalTitle: "Energy report",
      english: null, summary: null, publishedAt, discoveredAt };
    const props = {
      story: { timeline: [report] }, clock: "known", asOf: discoveredAt,
      route: { status: "ok", stations: [{ reports: [{ articleId: "energy",
        url: "https://www.eia.gov/todayinenergy/detail.php?id=1", source: "EIA",
        publishedAt, discoveredAt, revision: null }] }] },
    };
    const render = (path: string, asOf: string) => renderToStaticMarkup(createElement(MemoryRouter,
      { initialEntries: [path] }, createElement(EnergyShippingEvidence, { ...props, asOf })));
    const en = render("/en/explore", discoveredAt), zh = render("/explore", discoveredAt);
    assert.match(en, /Energy &amp; shipping evidence/);
    assert.match(en, /Energy report/);
    assert.match(en, /Source: U.S. Energy Information Administration/);
    assert.match(en, /data-evidence-domain="energy"/);
    assert.match(en, /data-evidence-domain="shipping"/);
    assert.match(en, /No loaded public evidence at this cutoff/);
    assert.match(en, /Source &amp; times/);
    assert.match(en, /Published/);
    assert.match(en, /Discovered/);
    assert.match(en, /Current revision.*Original/);
    assert.match(en, /href="\/en\/items\/energy"/);
    assert.match(en, /No comparable numeric series/);
    assert.match(en, /PortWatch data is withheld/);
    assert.match(en, /Co-occurrence does not establish an event effect/);
    assert.match(zh, /能源与航运证据/);
    assert.match(zh, /尚无可比数值序列/);
    assert.match(zh, /来源与时间/);
    assert.match(zh, /href="\/items\/energy"/);
    const early = render("/en/explore", publishedAt);
    assert.doesNotMatch(early, /Energy report|eia.gov\/todayinenergy/);
    assert.match(early, /data-testid="energy-shipping-evidence"/);
    assert.match(early, /No loaded public evidence at this cutoff/);
    assert.doesNotMatch(en, /<svg|<canvas|data-edge|priceUsdt/);
  } finally { await server.close(); }
});
