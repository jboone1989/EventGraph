// The public news product must start with no Ferro dependency or self-ingested feed.
// This is deliberately a standalone test: no database, agent, API key, or remote service required.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CATEGORIES, TOPIC_TAGS } from "@aihot/industry/taxonomy";
import { SITE, NAV, COMMUNITY_FEEDS } from "@aihot/site";

interface Source {
  id: string;
  kind: string;
  config: { feedUrl?: string };
  participation_mode: string;
  tier: string;
  site_fulltext: boolean;
  syndicate_fulltext: boolean;
}

const { sources } = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")) as { sources: Source[] };

test("the news site has no mandatory AI-author or self-RSS source", () => {
  assert.ok(sources.length >= 45);
  assert.equal(new Set(sources.map(s => s.id)).size, sources.length);
  assert.ok(sources.every(s => s.id !== "ferro"));
  assert.ok(sources.every(s => !/livingruntime\.com\/feed\.xml/i.test(s.config.feedUrl ?? "")));
  assert.ok(sources.every(s => s.participation_mode === "editorial" || s.participation_mode === "hot_signal"));
  assert.deepEqual(new Set(COMMUNITY_FEEDS.dev), new Set(["rss-dev-ai", "rss-dev-crypto"]));
  assert.ok(COMMUNITY_FEEDS.dev.every(id => sources.find(s => s.id === id)?.participation_mode === "hot_signal"));
});

test("public sources cover AI, cryptocurrency and finance on their own", () => {
  const ids = new Set(sources.map(s => s.id));
  for (const id of ["rss-openai-news", "rss-github-ai", "rss-bbc-business", "rss-cointelegraph", "rss-decrypt", "rss-coindesk", "rss-fed-press", "rss-sec-press"]) {
    assert.ok(ids.has(id), id);
  }
  for (const source of sources) {
    assert.equal(source.kind, "rss");
    assert.ok(source.config.feedUrl?.startsWith("https://"), source.id);
    assert.equal(source.site_fulltext, false, source.id);
    assert.equal(source.syndicate_fulltext, false, source.id);
  }
});

test("the site has an independent public navigation and topical taxonomy", () => {
  assert.ok(!NAV.hidden.includes("/hot"));
  assert.ok(!NAV.hidden.includes("/topics"));
  // 全部动态 is reached from the feeds' own 精选 | 全部 switch, not from the sidebar.
  assert.ok(NAV.hidden.includes("/all"));
  assert.deepEqual(CATEGORIES.map(c => c.key), ["ai", "crypto", "finance", "world", "research"]);
  for (const tag of ["AI Agent", "比特币", "稳定币", "ETF", "利率债券"]) {
    assert.ok(TOPIC_TAGS.some(t => t === tag), tag);
  }
  assert.ok(!SITE.description.includes("Ferro"));
});
