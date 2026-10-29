import assert from "node:assert/strict";
import { createServer } from "node:http";
import { before, after, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import type { CaseStudyResponse } from "@aihot/contracts/site";
import { startWebServer, type WebServer } from "./web-server.ts";

const caseData: CaseStudyResponse = {
  schemaVersion: 1, id: "temporal-fixture", title: "时间案例", titleEn: "Temporal case",
  summary: "当前摘要含后来的解释", summaryEn: "Current summary with hindsight", updated: "2026-10-26", generatedAt: "2026-10-27T00:00:00Z",
  tracks: ["alpha", "beta"].map(key => ({ key, label: key, labelEn: key, status: "ok",
    story: { publicId: key, title: key }, coverage: { stations: 1, reports: 1, sources: 1 },
    stations: [{ factId: key, title: "Station " + key, subject: null, action: null, object: null,
      timeEffective: null, timeRecorded: "2026-10-22T12:00:00Z",
      reports: [{ articleId: key, url: "https://example.org/" + key, source: "Wire", publishedAt: "2026-10-20T12:00:00Z",
        discoveredAt: "2026-10-22T12:00:00Z", revision: null }], sourceCount: 1,
      uncertainty: { singleSource: true, occurredAtMissing: true, revised: false } }],
  })),
  links: [{ key: "later", from: "alpha", to: "beta", type: "citation", note: "后来标注的联系", noteEn: "Later annotated connection",
    evidence: { url: "https://example.org/link", source: "Wire", publishedAt: "2026-10-20T12:00:00Z" }, curatedAt: "2026-10-26" }],
  unlinked: [],
};
const api = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url?.startsWith("/api/site/case-studies/")) return res.end(JSON.stringify(caseData));
  if (req.url === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "fixture" }));
  if (req.url === "/api/site/track") { res.statusCode = 204; return res.end(); }
  res.statusCode = 404; res.end("{}");
});
let web: WebServer;
let browser: Browser;
before(async () => {
  web = await startWebServer(api);
  browser = await chromium.launch({ channel: "chromium" });
});
after(async () => { await browser?.close(); await web?.stop(); });

for (const language of ["zh", "en"] as const) for (const width of [390, 1440]) {
  test(`case replay respects the deep-link cutoff and clock ${language} ${width}`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    try {
      await page.addInitScript(lang => localStorage.setItem("livingruntime-language", lang), language);
      const prefix = language === "en" ? "/en" : "";
      await page.goto(web.origin + prefix + "/explore?case=temporal-fixture&clock=known&asOf=2026-10-20T12%3A00%3A00Z");
      await expect(page.getByRole("heading", { name: language === "en" ? "Temporal case" : "时间案例", exact: true })).toBeVisible();
      await expect(page.getByText("Station alpha", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Current summary with hindsight", { exact: true })).toHaveCount(0);
      await expect(page.getByText("当前摘要含后来的解释", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: language === "en" ? "Valid time" : "事实生效时间", exact: true }).click();
      await expect(page.getByText("Station alpha", { exact: true })).toBeVisible();
      await expect(page.getByText(language === "en" ? /Currently displayable lower bounds/ : /当前可展示的下界/).first()).toBeVisible();
      await expect(page.getByText(language === "en" ? "· Single source" : "· 单一来源", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: language === "en" ? "Check source ↗" : "核查原文 ↗", exact: true }).first()).toHaveAttribute("href", "https://example.org/alpha");
      await page.getByRole("button", { name: language === "en" ? "Recorded-time reconstruction" : "按收录时间重建", exact: true }).click();
      await expect(page.getByText("Station alpha", { exact: true })).toHaveCount(0);
      await expect(page.getByText(language === "en" ? "Later annotated connection" : "后来标注的联系", { exact: true })).toHaveCount(0);
      await page.reload();
      await expect(page.getByText("Station alpha", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: language === "en" ? "Back to latest" : "回到最新", exact: true }).click();
      await expect(page.getByText("Station alpha", { exact: true })).toBeVisible();
      await expect(page.getByText(language === "en" ? "Later annotated connection" : "后来标注的联系", { exact: true })).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await page.goto(web.origin + prefix + "/explore?case=temporal-fixture&asOf=2026-10-20");
      await expect(page.getByText("Station alpha", { exact: true })).toBeVisible();
      await expect(page.getByText(language === "en" ? "Current summary with hindsight" : "当前摘要含后来的解释", { exact: true })).toBeVisible();
      await expect(page.getByRole("status")).toHaveCount(0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await context.close(); }
  });
}
