import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";
import { startWebServer } from "./web-server.ts";

test("three live queues show per-news failure and one-click retry moves one article to pending", async () => {
  const now = new Date().toISOString();
  const rows = [
    { id: "article-failed", title: "失败新闻", status: "failed", stage: "新闻统一分析", error: "Provider HTTP 429",
      discoveredAt: now, retryAt: null, attempts: 4, jobName: null, jobState: null, queuedAt: null, startedAt: null,
      unverifiedReceiptId: null, receiptStatus: null },
    { id: "article-group", title: "归组失败新闻", status: "failed", stage: "事件归组", error: "Group Provider 503",
      discoveredAt: now, retryAt: null, attempts: 0, jobName: null, jobState: null, queuedAt: null, startedAt: null,
      unverifiedReceiptId: null, receiptStatus: null },
    { id: "article-new", title: "等待新闻", status: "pending", stage: "正文提取", error: null,
      discoveredAt: now, retryAt: null, attempts: 0, jobName: "content.extract-body", jobState: "created", queuedAt: now, startedAt: null,
      unverifiedReceiptId: null, receiptStatus: null },
    { id: "article-active", title: "正在分析的新闻", status: "processing", stage: "新闻统一分析", error: null,
      discoveredAt: now, retryAt: null, attempts: 0, jobName: "content.analyze", jobState: "active", queuedAt: now, startedAt: now,
      unverifiedReceiptId: null, receiptStatus: null },
  ];
  const run = {
    checkedAt: now, processes: [{ role: "worker", pid: 1, host: "worker", release: "dev", startedAt: now, at: now, alive: true }],
    currentNews: { pending: 1, processing: 1, failed: 2 }, currentNewsItems: rows,
  };
  let retried = 0;
  const api = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://api.local").pathname;
    res.setHeader("content-type", "application/json");
    if (path === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
    if (path === "/api/admin/me") return res.end(JSON.stringify({ name: "Runs test", csrf: "fixture", dev: true }));
    if (path === "/api/admin/nav-counts") return res.end(JSON.stringify({ runs: 2 }));
    if (path === "/api/admin/runs") return res.end(JSON.stringify(run));
    if (path === "/api/admin/processing/requeue" && req.method === "POST") {
      let request = "";
      for await (const chunk of req) request += String(chunk);
      const payload = JSON.parse(request);
      assert.equal(payload.articleId, "article-failed");
      retried += 1;
      rows[0]!.status = "pending";
      rows[0]!.error = null;
      run.currentNews.pending += 1;
      run.currentNews.failed -= 1;
      return res.end(JSON.stringify({ requeued: 1, jobId: "job-test" }));
    }
    if (path === "/api/admin/content/article-group/rerun" && req.method === "POST") {
      rows[1]!.status = "pending";
      rows[1]!.error = null;
      run.currentNews.pending += 1;
      run.currentNews.failed -= 1;
      return res.end(JSON.stringify({ jobId: "group-job-test" }));
    }
    res.statusCode = 404;
    res.end("{}");
  });
  const web = await startWebServer(api);
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const res = await page.goto(web.origin + "/admin/runs");
    assert.equal(res?.status(), 200);
    await expect(page.getByRole("button", { name: /待处理/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /正在处理/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /处理失败/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "失败新闻" })).toBeVisible();
    await expect(page.getByText("Provider HTTP 429", { exact: true })).toBeVisible();
    await expect(page.getByText("新闻统一分析", { exact: true })).toBeVisible();
    for (const obsolete of ["积压原因诊断", "今日记录与诊断", "模型请求诊断", "队列与定时任务 · 技术诊断"]) {
      await expect(page.getByText(obsolete, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole("link", { name: "归组失败新闻" })).toBeVisible();
    await expect(page.getByText("Group Provider 503", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "重新入队" }).first().click();
    await expect(page.getByRole("link", { name: "失败新闻" })).toHaveCount(0);
    await page.getByRole("button", { name: "重新入队" }).click();
    await expect(page.getByRole("link", { name: "归组失败新闻" })).toHaveCount(0);
    await page.getByRole("button", { name: /待处理/ }).click();
    await expect(page.getByRole("link", { name: "失败新闻" })).toBeVisible();
    await expect(page.getByRole("link", { name: "归组失败新闻" })).toBeVisible();
    assert.equal(retried, 1);
  } finally {
    await browser.close();
    await web.stop();
  }
});
