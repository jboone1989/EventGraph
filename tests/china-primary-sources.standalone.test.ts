// The three Chinese regulator sources preview-tested on cn-dev: PBoC's RSS with its
// scheme-less links rewritten to https, and CSRC/MIIT listings whose article pages carry
// the authoritative publication date. Config must stay exactly what the collectors implement.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertSupportedConfig } from "../packages/backend/src/sources/config-keys.ts";

type Feed = { id:string; name:string; kind:string; config:Record<string, any>; tier:string;
  participation_mode:string; interval_minutes:number; tags:string[]; site_fulltext:boolean; syndicate_fulltext:boolean };
const { sources } = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8")) as {sources:Feed[]};
const byId = new Map(sources.map(x => [x.id, x]));
const additions = ["rss-cn-pboc-official", "rss-cn-csrc-official", "rss-cn-miit-official"];

test("three Chinese regulator sources match the preview-verified configs", () => {
  for (const id of additions) {
    const source = byId.get(id);
    assert.ok(source, id);
    assert.doesNotThrow(() => assertSupportedConfig(source.kind as any, source.config), id);
    assert.equal(source.tier, "T1", id);
    assert.equal(source.participation_mode, "editorial", id);
    assert.ok(source.interval_minutes >= 180 && source.interval_minutes <= 240, id);
    assert.ok(source.tags.includes("中国"), id);
    assert.ok(source.tags.includes("金融监管") || source.tags.includes("产业政策"), id);
    assert.equal(source.site_fulltext, false, id);
    assert.equal(source.syndicate_fulltext, false, id);
    assert.ok(Number(source.config._aihot.initialBackfillLimit) <= 2, id);
  }
});

test("PBoC RSS keeps only its own links and rewrites them to https", () => {
  const config = byId.get("rss-cn-pboc-official")!.config;
  assert.equal(config.feedUrl, "https://www.pbc.gov.cn/goutongjiaoliu/113456/2986536/index.html");
  assert.equal(config.publishedAtUtcOffset, "+08:00");
  assert.deepEqual(config.allowUrlPrefixes, ["www.pbc.gov.cn/"]);
  // The official RSS may truncate titles; fetchDetail restores the article's full heading.
  assert.equal(config.detail.maxFetches, 6);
  assert.equal(config.detail.titleAuthoritative, true);
  const fullTitle = "潘功胜在2026年金融工作会议上的讲话";
  assert.equal(new RegExp(config.detail.titleRegex).exec(`<title>${fullTitle}</title>`)?.[1], fullTitle);
  const rw = config.itemUrlPrefixRewrite;
  const url = "www.pbc.gov.cn/goutongjiaoliu/113456/4012345/4012346/index.html";
  assert.equal(rw.to + url.slice(rw.from.length), "https://" + url);
});

test("CSRC and MIIT listings deny their index pages and trust only detail dates", () => {
  for (const id of ["rss-cn-csrc-official", "rss-cn-miit-official"]) {
    const config = byId.get(id)!.config;
    assert.equal(config.parseMode, "html", id);
    assert.ok(/^https:\/\/www\.(csrc|miit)\.gov\.cn\//.test(config.url), id);
    assert.equal(config.publishedAfter, "2026-10-01T00:00:00.000Z", id);
    assert.ok(config.denyUrlPrefixes.length === 1, id);
    assert.ok(config.allowUrlPrefixes.every((p:string) => !config.denyUrlPrefixes.includes(p)), id);
    const detail = config.detail;
    assert.ok(detail.maxFetches >= 1 && detail.maxFetches <= 8, id);
    assert.ok(detail.publishedAtRegex.includes("(\\d{4}-\\d{2}-\\d{2})"), id);
    assert.equal(detail.publishedAtUtcOffset, "+08:00", id);
    assert.equal(detail.publishedAtAuthoritative, true, id);
  }
});
