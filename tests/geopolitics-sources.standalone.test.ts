// New conflict, policy and regional-news source pack. Tests are offline; the live
// fetchRss audit is recorded separately in the rollout evidence.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertSupportedConfig } from "../packages/backend/src/sources/config-keys.ts";
import { admitListing } from "../packages/backend/src/sources/filters.ts";

type Feed = { id: string; kind: string; config: Record<string, any>;
  tier: string; participation_mode: string; interval_minutes: number;
  site_fulltext: boolean; syndicate_fulltext: boolean };
const doc = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")) as { sources: Feed[] };
const sources = new Map(doc.sources.map(x => [x.id, x]));
const ids = [
  "rss-japan-mod-press",
  "rss-defensenews-global",
  "rss-breaking-defense",
  "rss-aljazeera-global",
  "rss-france24-world",
  "rss-arabnews-global",
  "rss-the-diplomat-asia",
  "rss-war-on-the-rocks",
  "rss-guardian-world",
  "rss-npr-news",
];
test("all new publishers are unique, supported, date-gated RSS with bounded initial history", () => {
  assert.equal(sources.size, doc.sources.length, "no source ID collisions");
  const urls = ids.map(id => {
    const s = sources.get(id);
    assert.ok(s, id);
    assert.equal(s.kind, "rss");
    assert.doesNotThrow(() => assertSupportedConfig("rss", s.config), id);
    assert.ok(String(s.config.feedUrl).startsWith("https://"), id);
    assert.equal(s.config.publishedAfter, "2026-10-01T00:00:00.000Z", id);
    assert.ok(s.config._aihot.initialBackfillLimit <= 2, id);
    assert.equal(s.site_fulltext, false, id);
    assert.equal(s.syndicate_fulltext, false, id);
    assert.ok(s.interval_minutes >= 120, id);
    return s.config.feedUrl;
  });
  assert.equal(new Set(urls).size, urls.length);
});
test("Japanese defense links are normalized without any site HTML crawler", () => {
  const s = sources.get("rss-japan-mod-press")!;
  assert.equal(s.tier, "T1");
  const entries = admitListing([{
    url: "/j/press/news/2026/10/23c.html",
    title: "Ministry of Defense announcement",
    publishedAt: new Date("2026-10-23T09:05:54Z"),
    excerpt: null
  }] as never, s as never);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.url, "https://www.mod.go.jp/j/press/news/2026/10/23c.html");
});
test("high-volume news wires stay non-primary signals with original links", () => {
  for (const id of ["rss-aljazeera-global", "rss-arabnews-global", "rss-guardian-world", "rss-npr-news"]) {
    const s = sources.get(id)!;
    assert.equal(s.tier, "T2", id);
    assert.equal(s.participation_mode, "hot_signal", id);
  }
});
