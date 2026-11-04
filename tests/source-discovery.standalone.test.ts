// Pure discovery tests (specs/007 §D): which search results qualify as publisher leads, the
// candidates they become, preflight of deepseek_search configs without config.url, and the
// per-run caps. No database, no network: the search is injected.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseDiscoverySubjects, discoverViaDeepSeek, leadFromResult, type GapSubject } from "../packages/backend/src/admin/discovery.ts";
import { preflightCandidate, DiscoveredSource } from "../packages/backend/src/admin/lifecycle.ts";
import { sourceIdentity } from "../packages/backend/src/admin/sources.ts";
import { BudgetExceededError } from "../packages/backend/src/providers/receipts.ts";

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
  assert.equal(leadFromResult(gap, hit({ url: "https://someone.substack.com/feed" }), NOW), null);
  assert.equal(leadFromResult(gap, hit({ url: "https://foo.wordpress.com/feed/" }), NOW), null);
  assert.equal(leadFromResult(gap, hit({ url: "https://x.blogspot.com/rss.xml" }), NOW), null);
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
  assert.equal(result.failures, 1);
  assert.match(result.firstError!, /temporary search outage/);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.kind, "rss");
});

test("long conflict titles are truncated to the DeepSeek 128 Unicode-char limit, preserving site scope", async () => {
  const long = { ...event, subject: "地区冲突军援制裁与供应链影响".repeat(14) };
  const lead = leadFromResult(long, hit(), NOW) as DiscoveredSource;
  assert.ok(Array.from(String(lead.config.deepseekQuery)).length <= 128);
  assert.ok(String(lead.config.deepseekQuery).endsWith(" site:sanctions.example.gov"));
  assert.equal(preflightCandidate(lead).ok, true);
  const sent: string[] = [];
  await discoverViaDeepSeek([long], new Set(), {
    maxCandidates: 2, now: NOW,
    search: async (q: string) => { sent.push(q); return []; },
  });
  assert.equal(sent.length, 1);
  assert.ok(Array.from(sent[0]!).length <= 128);
  const invalid = DiscoveredSource.parse({ ...lead, config: { ...lead.config, deepseekQuery: "x".repeat(129) } });
  assert.ok(preflightCandidate(invalid).reasons.includes("address"));
});

test("Chinese-language topics on the same authority domain receive different stable candidate ids", () => {
  const a = leadFromResult({ subject: "军事冲突", event: false, tags: ["军事"] }, hit(), NOW) as DiscoveredSource;
  const b = leadFromResult({ subject: "出口管制", event: false, tags: ["贸易"] }, hit(), NOW) as DiscoveredSource;
  assert.notEqual(a.id, b.id);
  assert.notEqual(sourceIdentity(a.kind, a.config), sourceIdentity(b.kind, b.config));
  assert.equal(a.id, leadFromResult({ subject: "军事冲突", event: false, tags: ["军事"] }, hit(), NOW)?.id);
});

test("a domain with sources never stops discovery: rotate covered and uncovered topics", () => {
  const topics: GapSubject[] = [
    { subject: "军情", tags: ["军事"], event: false },
    { subject: "贸易", tags: ["贸易"], event: false },
    { subject: "海运", tags: ["海运"], event: false },
    { subject: "能源", tags: ["能源"], event: false },
    { subject: "制裁", tags: ["制裁"], event: false },
  ];
  const covered = new Set(["军事", "贸易", "能源", "海运"]);
  const eventSubjects: GapSubject[] = [{ subject: "红海通航", tags: [], event: true }];
  const today = chooseDiscoverySubjects(eventSubjects, topics, covered, 4, 100);
  const tomorrow = chooseDiscoverySubjects(eventSubjects, topics, covered, 4, 101);
  assert.ok(today.some(t => t.event), "active conflict always reserves a slot");
  assert.ok(today.some(t => t.subject === "制裁"), "uncovered gaps retain priority");
  assert.ok(today.some(t => t.subject !== "制裁" && !t.event), "covered domains still get independent discovery");
  assert.notDeepEqual(today.map(t => t.subject), tomorrow.map(t => t.subject), "daily rotation reaches other covered sectors");
  const allCovered = chooseDiscoverySubjects([], topics, new Set(["军事","贸易","海运","能源","制裁"]), 2, 102);
  assert.equal(allCovered.length, 2, "discovery continues after every topic has one publisher");
});

test("official news.xml feeds are RSS leads; they are previewed rather than scraped", () => {
  const lead = leadFromResult(gap, hit({
    url: "https://www.mod.go.jp/j/rss/news.xml", site_name: "Japan Ministry of Defense",
  }), NOW) as DiscoveredSource;
  assert.equal(lead.kind, "rss");
  assert.equal(lead.config.feedUrl, "https://www.mod.go.jp/j/rss/news.xml");
  assert.equal(preflightCandidate(lead).ok, true);
  assert.equal(lead.officialLowFrequency, false);
});

test("a long feed URL does not abort discovery or overflow candidate provenance", async () => {
  const longUrl = "https://feeds.example-media.com/market/rss.xml?q=" + "a".repeat(700);
  const result = await discoverViaDeepSeek([gap], new Set(), {
    maxCandidates: 4, now: NOW,
    search: async () => [hit({ url: longUrl }), hit({ url: "https://www.sanctions.example.gov/press/feed.xml" })],
  });
  assert.equal(result.candidates.length, 2);
  assert.ok((result.candidates[0]!.origin.note ?? "").length <= 500);
});

test("a later budget outage preserves leads from earlier successful searches", async () => {
  let calls = 0;
  const result = await discoverViaDeepSeek([gap, event], new Set(), {
    maxCandidates: 4, now: NOW,
    search: async () => {
      calls++;
      if (calls === 2) throw new BudgetExceededError("deepseek_web", "day", 60);
      return [hit({ url: "https://www.sanctions.example.gov/press/feed.xml" })];
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.skipped, "budget");
  assert.equal(result.queries, 1);
  assert.equal(result.candidates.length, 1);
});
