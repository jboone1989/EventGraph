import assert from "node:assert/strict";
import { test } from "node:test";
import { landingKind, summarizeLandingPages } from "../packages/backend/src/admin/search-page-types.ts";

test("classify actual Google landing page URLs, including English and query parameters", () => {
  const host = "livingruntime.com";
  assert.equal(landingKind("https://www.livingruntime.com/items/article123?utm_source=google", host), "news");
  assert.equal(landingKind("https://livingruntime.com/en/items/story123#sources", host), "news");
  assert.equal(landingKind("https://www.livingruntime.com/story/event123", host), "story");
  assert.equal(landingKind("https://www.livingruntime.com/en/story/event123", host), "story");
  assert.equal(landingKind("https://www.livingruntime.com/topics/ai-agents/page/2", host), "topic");
  assert.equal(landingKind("https://www.livingruntime.com/en/topics", host), "topic");
  assert.equal(landingKind("https://www.livingruntime.com/en/daily/2026-10-24", host), "daily");
  assert.equal(landingKind("https://www.livingruntime.com/weekly/2026-W42", host), "daily");
  assert.equal(landingKind("https://www.livingruntime.com/", host), "other");
  assert.equal(landingKind("https://dev.livingruntime.com/items/a", host), "other");
  assert.equal(landingKind("https://other.example.com/story/x", host), "other");
  assert.equal(landingKind("javascript:alert(1)", host), "other");
  assert.equal(landingKind("not a URL", host), "other");
});

test("sum only returned page rows and derive weighted CTR/position, not all-site totals", () => {
  const rows = [
    { page: "https://livingruntime.com/items/a", clicks: 1, impressions: 20, ctr: 0.05, position: 4 },
    { page: "https://www.livingruntime.com/en/items/b", clicks: 0, impressions: 80, ctr: 0, position: 10 },
    { page: "https://www.livingruntime.com/story/c", clicks: 2, impressions: 30, ctr: 2 / 30, position: 3 },
    { page: "https://www.livingruntime.com/topics/ai-models", clicks: 0, impressions: 0, ctr: 0, position: 0 },
  ];
  const report = summarizeLandingPages(rows, "livingruntime.com", 1000);
  assert.equal(report.pageRows, 4);
  assert.equal(report.pagesTruncated, false);
  assert.deepEqual(report.pageTypes.map(t => t.pages), [2, 1, 1, 0, 0]);
  const news = report.pageTypes[0]!;
  assert.equal(news.clicks, 1);
  assert.equal(news.impressions, 100);
  assert.equal(news.ctr, 0.01);
  assert.equal(news.position, 8.8);
  assert.equal(report.pageTypes[2]!.position, null, "no-impression group does not invent an average rank");
  assert.deepEqual(report.opportunities.map(x => x.page.split("/").pop()), ["b", "a"], "rank news by impressions, not clicks");
});

test("mark capped Search Console page result as possibly incomplete", () => {
  const rows = [{ page: "https://livingruntime.com/items/a", clicks: 0, impressions: 1, ctr: 0, position: 1 }];
  assert.equal(summarizeLandingPages(rows, "www.livingruntime.com", 1).pagesTruncated, true);
});
