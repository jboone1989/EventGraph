import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertSupportedConfig } from "../packages/backend/src/sources/config-keys.ts";

type Feed = { id:string; name:string; kind:string; config:Record<string, unknown>; tier:string;
  participation_mode:string; site_fulltext:boolean; syndicate_fulltext:boolean; tags:string[] };
const { sources } = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")) as {sources:Feed[]};
const additions = [
 "rss-cn-chinanews-finance", "rss-cn-chinanews-china", "rss-cn-chinanews-world",
 "rss-cn-chinanews-gba", "rss-cn-qbitai-ai", "rss-cn-ithome-tech", "rss-hkma-press",
 "rss-cn-panews-articles", "rss-cn-panews-flashes",
];
test("nine Chinese-source configs use existing RSS collector with safe bounded initial sync", () => {
 const byId = new Map(sources.map(x => [x.id, x]));
 assert.equal(byId.size, sources.length, "unique IDs");
 for(const id of additions) {
   const source = byId.get(id);
   assert.ok(source, id);
   assert.equal(source.kind, "rss", id);
   assert.doesNotThrow(() => assertSupportedConfig("rss", source.config), id);
   assert.ok(String(source.config.feedUrl).startsWith("https://"), id);
   assert.ok(Number((source.config._aihot as {initialBackfillLimit:number}).initialBackfillLimit) <= 3, id);
   assert.equal(source.site_fulltext, false, id);
   assert.equal(source.syndicate_fulltext, false, id);
   assert.ok(source.tags.includes("中国"), id);
 }
 assert.equal(byId.get("rss-hkma-press")?.tier, "T1");
 assert.equal(byId.get("rss-cn-panews-flashes")?.participation_mode, "hot_signal");
 assert.equal(byId.get("rss-cn-ithome-tech")?.participation_mode, "hot_signal");
 const keys = additions.map(id => String(byId.get(id)!.config.feedUrl));
 assert.equal(new Set(keys).size, additions.length, "no duplicated feeds");
});

test("PBOC/CSRC/MIIT official sources reuse supported collectors, normalized links and actual publication dates", () => {
 const byId = new Map(sources.map(x => [x.id, x]));
 const official = ["rss-cn-pboc-official", "rss-cn-csrc-official", "rss-cn-miit-official"];
 for (const id of official) {
   const source = byId.get(id);
   assert.ok(source, id);
   assert.equal(source.tier, "T1", id);
   assert.equal(source.participation_mode, "editorial", id);
   assert.equal(source.site_fulltext, false, id);
   assert.equal(source.syndicate_fulltext, false, id);
   assert.doesNotThrow(() => assertSupportedConfig(source.kind as "rss" | "web_list", source.config));
   assert.equal((source.config._aihot as {initialBackfillLimit:number}).initialBackfillLimit, 2);
   assert.equal(typeof source.config.publishedAfter, "string");
 }
 const pbc = byId.get("rss-cn-pboc-official")!;
 assert.equal(pbc.kind, "rss");
 assert.deepEqual(pbc.config.itemUrlPrefixRewrite, { from:"www.pbc.gov.cn/",to:"https://www.pbc.gov.cn/" });
 assert.equal((pbc.config.detail as {titleAuthoritative:boolean}).titleAuthoritative, true);
 for(const id of official.slice(1)){
   const src=byId.get(id)!;
   assert.equal(src.kind,"web_list");
   assert.equal((src.config.detail as {publishedAtAuthoritative:boolean}).publishedAtAuthoritative,true);
   assert.ok((src.config.allowUrlPrefixes as string[]).length);
 }
});
