// Pure discovery tests (specs/007 §D): which search results qualify as publisher leads, the
// candidates they become, preflight of deepseek_search configs without config.url, and the
// per-run caps. No database, no network: the search is injected.
import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverViaDeepSeek, leadFromResult, type GapSubject } from "../packages/backend/src/admin/discovery.ts";
import { preflightCandidate, DiscoveredSource } from "../packages/backend/src/admin/lifecycle.ts";
import { sourceIdentity } from "../packages/backend/src/admin/sources.ts";

const NOW = new Date("2026-10-25T12:00:00.000Z");
const gap: GapSubject = { subject: "算力与 AI 成本", tags: ["算力与芯片", "AI 成本"], event: false };
const event: GapSubject = { subject: "红海航运中断升级", tags: [], event: true };
const hit = (over: Record<string, unknown> = {}) => ({
  url: "https://www.sanctions.example.gov/press-releases", title: "Recent Actions",
  snippet: "Official press releases.", summary: "", date: null, site_name: "Sanctions Authority",
  authority: 80, rerank_score: 2, ...over,
});

test("an official domain becomes a scoped deepseek_search candidate, never a scraper", () => {
  const lead = leadFromResult(gap, hit(), NOW) as DiscoveredSource;
  assert.equal(lead.kind, "json_list");
  assert.equal(lead.origin.channel, "deepseek");
  assert.ok((lead.origin.note ?? "").includes("publisher=sanctions.example.gov"));
  assert.equal(lead.config.mode, "deepseek_search");
  assert.equal(lead.config.deepseekQuery, "算力与 AI 成本 site:sanctions.example.gov");
  assert.deepEqual(lead.config.allowUrlPrefixes, ["https://www.sanctions.example.gov/"]);
  // No history replay: a one-week window and a two-item first collection.
  assert.equal((lead.config._aihot as { initialBackoffLimit?: number; initialBackfillLimit: number }).initialBackfillLimit, 2);
  assert.equal(lead.config.publishedAfter, "2026-10-18T12:00:00.000Z");
  // officialLowFrequency is an operator attestation: an automated channel may not assert it.
  assert.equal(lead.officialLowFrequency, false);
  assert.deepEqual(lead.tags, ["算力与芯片", "AI 成本", "一手"]);
  // The PR#137 preflight bug: json_list without config.url must pass the address rule now.
  const pre = preflightCandidate(lead);
  assert.equal(pre.ok, true);
  assert.equal(pre.identity, "deepseek:算力与 ai 成本 site:sanctions.example.gov");
});

test("a feed endpoint becomes an rss candidate; a breaking event expires and never gets low-frequency protection", () => {
  const feed = leadFromResult({ subject: "加密市场", tags: ["加密货币"], event: false }, hit({
    url: "https://feeds.example-media.com/market/rss.xml", site_name: "Example Market News",
  }), NOW) as DiscoveredSource;
  assert.equal(feed.kind, "rss");
  assert.equal(feed.config.feedUrl, "https://feeds.example-media.com/market/rss.xml");
  assert.equal(feed.officialLowFrequency, false);
  assert.ok(feed.tags.includes("二手"));
  assert.equal(feed.expiresAt, undefined);

  const ev = leadFromResult(event, hit({ url: "https://www.mod.example.gov/en/news/" }), NOW) as DiscoveredSource;
  assert.equal(ev.origin.channel, "breaking_event");
  assert.equal(ev.expiresAt, "2026-11-08T12:00:00.000Z");
  // Event sources must be able to retire when the event does.
  assert.equal(ev.officialLowFrequency, false);
  assert.equal(preflightCandidate(ev).ok, true);
});

test("blog platforms, anonymous media homepages and non-http hits are not leads", () => {
  assert.equal(leadFromResult(gap, hit({ url: "https://medium.com/@someone/ai-costs" }), NOW), null);
  assert.equal(leadFromResult(gap, hit({ url: "ftp://example.gov/feed.xml" }), NOW), null);
  // A plain media page with no feed endpoint and no official domain: a search hit, not a source.
  assert.equal(leadFromResult(gap, hit({ url: "https://www.news.example.com/story/1" }), NOW), null);
  assert.equal(leadFromResult(gap, hit({ url: "not a url" }), NOW), null);
});

test("de-dup is by candidate identity, not by domain: the same publisher may offer several feeds", async () => {
  const queries: string[] = [];
  const search = async (query: string) => {
    queries.push(query);
    return [
      hit({ url: "https://www.sanctions.example.gov/press/feed.xml" }),
      // The same feed endpoint again: the same canonical URL, not a second candidate.
      hit({ url: "https://www.sanctions.example.gov/press/feed.xml" }),
      // A second, independent feed on the same publisher domain: kept, each feed is its own identity.
      hit({ url: "https://www.sanctions.example.gov/statements/rss.xml" }),
      // A feed already on file: skipped by identity.
      hit({ url: "https://www.trade.example.gov/news/feed.xml" }),
    ];
  };
  const known = new Set([sourceIdentity("rss", { feedUrl: "https://www.trade.example.gov/news/feed.xml" })!]);
  const { candidates, queries: n } = await discoverViaDeepSeek([gap], known, { maxCandidates: 5, now: NOW, search });
  assert.equal(n, 1);
  assert.deepEqual(queries, ["算力与 AI 成本 official newsroom press release RSS feed"]);
  assert.deepEqual(candidates.map((c) => c.config.feedUrl), [
    "https://www.sanctions.example.gov/press/feed.xml",
    "https://www.sanctions.example.gov/statements/rss.xml",
  ]);
  // Distinct identities get distinct deterministic ids.
  assert.notEqual(candidates[0]!.id, candidates[1]!.id);
  const capped = await discoverViaDeepSeek([gap, event], new Set(), { maxCandidates: 1, now: NOW, search });
  assert.equal(capped.candidates.length, 1);
});

test("preflight refuses deepseek_search candidates without a usable scope", () => {
  const lead = leadFromResult(gap, hit(), NOW) as DiscoveredSource;
  const broken = (patch: Record<string, unknown>) => preflightCandidate(
    DiscoveredSource.parse({ ...lead, config: { ...lead.config, ...patch } }));
  assert.ok(broken({ deepseekQuery: "" }).reasons.includes("address"));
  assert.ok(broken({ allowUrlPrefixes: [] }).reasons.includes("address"));
  assert.ok(broken({ allowUrlPrefixes: ["javascript:alert(1)"] }).reasons.includes("address"));
});

test("an automated candidate asserting officialLowFrequency is refused until an operator verifies it", () => {
  const lead = leadFromResult(gap, hit(), NOW) as DiscoveredSource;
  const auto = DiscoveredSource.parse({ ...lead, officialLowFrequency: true });
  assert.ok(preflightCandidate(auto).reasons.includes("official-requires-operator-verification"));
  assert.ok(preflightCandidate(DiscoveredSource.parse({ ...auto, origin: { ...auto.origin, channel: "operator" } })).ok);
});

test("one transiently failed search does not discard another subject's good publisher feeds", async () => {
  let calls = 0;
  const search = async (_query: string) => {
    calls += 1;
    if (calls === 1) throw new Error("temporary search outage");
    return [hit({ url: "https://www.sanctions.example.gov/press/feed.xml" })];
  };
  const result = await discoverViaDeepSeek([gap, event], new Set(), { maxCandidates: 4, now: NOW, search });
  assert.equal(calls, 2);
  assert.equal(result.queries, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.kind, "rss");
});
