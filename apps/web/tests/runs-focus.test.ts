import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";
import { startWebServer } from "./web-server.ts";

test("runs page prioritizes active problems while retaining detailed diagnostics", async () => {
  const now = new Date().toISOString();
  const runs = {
    checkedAt: now,
    processes: [{ role: "worker", pid: 123, host: "worker-1", release: "dev", startedAt: now, at: now, alive: true }],
    jobs: [{ job: "reports.compose", started_at: now, finished_at: now, status: "failed", error: "Failed composing report", failed_24h: 1, runs_24h: 1 }], timeline: [], queues: [{ name: "cron.reports.compose", state: "retry", n: 31, oldest: now }],
    articleProcessing: { waiting: 4, retrying: 3, failed: 2, filtered: 7, unavailableModel: 0 },
    live24h: { discovered: 25, analyzed: 14, grouped: 12, waiting: 6, failed: 2, filtered: 7, stalled: 3, newestAt: now },
    legacyUnresolved: 2,
    failedJobs: [{ name: "cron.reports.compose", failed: 4, last: now, last_output: "Provider HTTP 500" }],
    grouping: { waiting: 0, needsAttention: 0, items: [] },
    lagging: [], receipts: { counts: {}, unknownTotal: 0, issues: [] }, deliveries: [], errors: [],
    retrying: { count: 3, next: now }, ingest: [], modules: {},
  };
  const api = createServer((req, res) => {
    const path = new URL(req.url!, "http://api.local").pathname;
    res.setHeader("content-type", "application/json");
    if (path === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
    if (path === "/api/admin/me") return res.end(JSON.stringify({ name: "Runs test", csrf: "fixture", dev: true }));
    if (path === "/api/admin/nav-counts") return res.end(JSON.stringify({ runs: 5 }));
    if (path === "/api/admin/runs") return res.end(JSON.stringify(runs));
    res.statusCode = 404;
    return res.end("{}");
  });
  const web = await startWebServer(api);
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const res = await page.goto(web.origin + "/admin/runs");
    assert.equal(res?.status(), 200);
    await expect(page.getByText("新闻处理概览 · 最近 24 小时", { exact: true })).toBeVisible();
    await expect(page.getByText("超时新闻 3")).toBeVisible();
    await expect(page.getByText("失败新闻 2")).toBeVisible();
    await expect(page.getByText("定时任务最近失败 1")).toBeVisible();
    await expect(page.getByText("遗留未完成新闻 2")).toBeVisible();
    await expect(page.getByText("侧栏数字只统计最近 24 小时", { exact: false })).toBeVisible();
    const navBadge = page.locator('aside a[href="/admin/runs"] span[title="最近24小时超时或失败的新闻（按篇计数）"]');
    await expect(navBadge).toHaveText("5");
    await expect(navBadge).toHaveClass(/bg-bg-sunk/);
    await expect(page.getByText("超时未完成", { exact: true })).toBeVisible();
    const queue = page.locator("#runs-queues");
    const news = page.locator("#runs-news");
    await page.getByRole("link", { name: "新闻处理" }).click();
    await expect(news).toHaveJSProperty("open", true);
    await expect(page.getByText("分析完成", { exact: true })).toBeVisible();
    const problems = page.locator("#runs-issues");
    await expect(queue).toHaveJSProperty("open", false);
    await expect(problems).toHaveJSProperty("open", false);
    await page.locator('a[href="#runs-issues"]').first().click();
    await expect(problems).toHaveJSProperty("open", true);
    await expect(page.getByText("Provider HTTP 500")).toBeVisible();
    await page.locator('a[href="#runs-queues"]').first().click();
    await expect(queue).toHaveJSProperty("open", true);
    await expect(page.getByText("cron.reports.compose").first()).toBeVisible();
    await page.clock.install();
    await page.clock.runFor(20_100);
    await expect(queue).toHaveJSProperty("open", true);
    await queue.locator("summary").click();
    await expect(queue).toHaveJSProperty("open", false);
  } finally {
    await browser.close();
    await web.stop();
  }
});
