import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";
import { startWebServer } from "./web-server.ts";

test("runs page shows actionable backlog, every grouping item through pagination, and no raw diagnostic KPI noise", async () => {
  const now = new Date().toISOString();
  const grouped = Array.from({ length: 33 }, (_, i) => ({
    articleId: `selected-${i + 1}`, title: `待去重精选 ${i + 1}`, since: now,
    failed: false, recovery: "automatic", receiptId: null, error: null,
  }));
  const runs = {
    checkedAt: now,
    processes: [{ role: "worker", pid: 123, host: "worker-1", release: "dev", startedAt: now, at: now, alive: true }],
    jobs: [{ job: "reports.compose", started_at: now, finished_at: now, status: "failed", error: "Report failed", failed_today: 1, runs_today: 1 }],
    timeline: Array.from({ length: 80 }, (_, i) => ({ id: i, job: "unused", started_at: now, status: "ok" })),
    queues: [{ name: "cron.reports.compose", state: "retry", n: 31, oldest: now }],
    articleProcessing: { waiting: 4, retrying: 3, failed: 2, filtered: 7, unavailableModel: 0 },
    live24h: { discovered: 25, analyzed: 14, grouped: 12, waiting: 6, failed: 2, filtered: 7, stalled: 3, newestAt: now },
    legacyUnresolved: 2,
    currentNews: { pending: 4, processing: 2, failed: 2 },
    backlogCauses: [
      { kind: "provider_retry", count: 3, oldest: now, exampleArticleId: "article-2", exampleError: "Provider HTTP 429 rate limit", nextRetryAt: now },
      { kind: "article_failed", count: 2, oldest: now, exampleArticleId: "article-1", exampleError: "No eligible configured model", nextRetryAt: null },
    ],
    failedJobs: [{ name: "cron.reports.compose", failed: 4, last: now, last_output: "Provider HTTP 500" }],
    grouping: { waiting: grouped.length, needsAttention: 10, items: grouped },
    lagging: [], receipts: { counts: {}, unknownTotal: 0, issues: [] }, deliveries: [],
    errors: [{ error: "Temporary model error", n: 2, last: now, example: "article-1" }],
    retrying: { count: 3, next: now }, ingest: [], modules: {},
    routingEffect: { attempts: 200, successful: 111, failed: 89, unknown: 0, pending: 0, fallbackSuccess: 1, p95Ms: 1200, providers: [], stages: [] },
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
    await expect(page.getByText("新闻处理 · 当前队列", { exact: true })).toBeVisible();
    await expect(page.getByText("待处理", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("处理中", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("失败新闻 2 条")).toBeVisible();
    await expect(page.getByText("Worker 运行中")).toBeVisible();
    await expect(page.getByText("积压原因诊断", { exact: true })).toBeVisible();
    await expect(page.getByText("模型/Provider 错误，等待重试", { exact: true })).toBeVisible();
    await expect(page.getByText("Provider HTTP 429 rate limit", { exact: false })).toBeVisible();
    await expect(page.getByText("新闻处理最终失败", { exact: true })).toBeVisible();
    await expect(page.getByText("归组未完成，当前仍由系统负责", { exact: false })).toBeVisible();
    await expect(page.getByText("精选去重 · 尚未完成")).toBeVisible();
    await expect(page.getByText("共 33 条 · 第 1/2 页")).toBeVisible();
    await expect(page.getByText("待去重精选 1", { exact: true })).toBeVisible();
    await expect(page.getByText("待去重精选 21", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "下一页" }).click();
    await expect(page.getByText("共 33 条 · 第 2/2 页")).toBeVisible();
    await expect(page.getByText("待去重精选 33", { exact: true })).toBeVisible();
    await expect(page.getByText("待去重精选 1", { exact: true })).toHaveCount(0);
    await expect(page.getByText("UTC 今日仍失败的定时任务", { exact: true })).toBeVisible();
    await expect(page.getByText("Report failed", { exact: true })).toBeVisible();
    for (const removed of ["新闻队列说明 · UTC 当天", "队列与定时任务 · 技术诊断", "今日记录与诊断", "模型请求诊断"]) {
      await expect(page.getByText(removed, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByText("55.5%", { exact: true })).toHaveCount(0);
    await page.clock.install();
    await page.clock.runFor(20_100);
    await expect(page.getByText("待去重精选 33", { exact: true })).toBeVisible();
    const navBadge = page.locator('aside a[href="/admin/runs"] span[title="当前 UTC 日未完成新闻（按篇计数）"]');
    await expect(navBadge).toHaveText("5");
  } finally {
    await browser.close();
    await web.stop();
  }
});
