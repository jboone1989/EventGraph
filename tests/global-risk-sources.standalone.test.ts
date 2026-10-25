// Coverage checks for the first global political, military, and disaster source pack.
// Configuration tests do not claim live dev or production ingestion.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertSupportedConfig } from "../packages/backend/src/sources/config-keys.ts";

type Feed = { id: string; name: string; kind: string; config: Record<string, any>;
  tier: string; participation_mode: string; interval_minutes: number; tags: string[];
  site_fulltext: boolean; syndicate_fulltext: boolean };
const { sources } = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")) as { sources: Feed[] };
const byId = new Map(sources.map(s => [s.id, s]));
const expected = [
  "rss-eu-council-press",
  "rss-un-geneva-press",
  "rss-gdacs-disasters-24h",
  "rss-usgs-earthquakes-m45",
  "rss-gdelt-conflict-discovery",
  "rss-gdelt-trade-risk-discovery",
];

test("global-risk source IDs and feed URLs are unique and configs supported", () => {
  assert.equal(byId.size, sources.length, "manifest source IDs must be unique");
  const urls = expected.map(id => {
    const s = byId.get(id);
    assert.ok(s, id);
    assert.equal(s.kind, "rss", id);
    assert.doesNotThrow(() => assertSupportedConfig("rss", s.config), id);
    assert.ok(String(s.config.feedUrl).startsWith("https://"), id);
    assert.equal(s.config.publishedAfter, "2026-10-01T00:00:00.000Z", id);
    assert.ok(s.config._aihot.initialBackfillLimit <= 2, id);
    assert.equal(s.site_fulltext, false, id);
    assert.equal(s.syndicate_fulltext, false, id);
    assert.ok(s.interval_minutes >= 60, id);
    return s.config.feedUrl;
  });
  assert.equal(new Set(urls).size, urls.length, "duplicate new feed URLs");
});

test("official primary publishers differ from monitoring signals and discovery", () => {
  for (const id of ["rss-eu-council-press", "rss-un-geneva-press"]) {
    assert.equal(byId.get(id)?.tier, "T1", id);
    assert.equal(byId.get(id)?.participation_mode, "editorial", id);
  }
  for (const id of expected.slice(2)) {
    assert.equal(byId.get(id)?.participation_mode, "hot_signal", id);
  }
  for (const id of expected.slice(4)) {
    const feed = byId.get(id)!;
    assert.equal(feed.tier, "T2", id);
    const url = new URL(feed.config.feedUrl);
    assert.equal(url.hostname, "api.gdeltproject.org", id);
    assert.equal(url.searchParams.get("mode"), "artlist", id);
    assert.equal(url.searchParams.get("format"), "rss", id);
    assert.equal(url.searchParams.get("timespan"), "1d", id);
    assert.ok((url.searchParams.get("query") ?? "").includes(" OR "), id);
  }
});

test("the new global-risk feeds are not existing news or market-data duplicates", () => {
  const hosts = new Set(["consilium.europa.eu", "ungeneva.org", "gdacs.org", "earthquake.usgs.gov", "api.gdeltproject.org"]);
  for (const id of expected) {
    const u = new URL(byId.get(id)!.config.feedUrl);
    assert.ok(hosts.has(u.hostname) || hosts.has(u.hostname.replace(/^www\./, "")), id);
  }
  assert.ok(!expected.some(id => /binance|okx/.test(id)), "do not fake spot quotes as articles");
});
