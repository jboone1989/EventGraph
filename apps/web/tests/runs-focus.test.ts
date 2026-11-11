import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";
import { startWebServer } from "./web-server.ts";

test("three live queues cover news, worker, schedules and model failures with their original errors", async () => {
  const now = new Date().toISOString();
  const rows = [
    { key: "article:news-1", kind: "article", status: "failed", process: "新闻统一分析",
      subject: "失败新闻", articleId: "news-1", provider: "groq", model: "llama-3.3-70b",
      error: "Provider HTTP 429", at: now, retryAt: null, jobId: null, receiptId: null,
      originState: "failed", replayStep: "analyze", replayTargetId: "news-1" },
    { key: "job:aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", kind: "job", status: "failed", process: "events.digest",
      subject: "事件 99", articleId: null, provider: null, model: null,
      error: "digest exception", at: now, retryAt: null, jobId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", receiptId: null },
    { key: "schedule:knowledge.graphiti.ingest", kind: "schedule", status: "failed", process: "cron.knowledge.graphiti.ingest",
      subject: "knowledge.graphiti.ingest", articleId: null, provider: null, model: null,
      error: "Graphiti HTTP 500", at: now, retryAt: null, jobId: null, receiptId: null },
    { key: "model:17", kind: "model", status: "failed", process: "group_article",
      subject: "新闻关联分析", articleId: "news-2", provider: "OpenRouter", model: "nemotron-model",
      error: "Provider HTTP 503", at: now, retryAt: null, jobId: null, receiptId: 17, receiptStatus: "failed",
      originState: "failed", replayStep: "group", replayTargetId: "news-2" },
    { key: "article:news-3", kind: "article", status: "pending", process: "正文提取",
      subject: "等待新闻", articleId: "news-3", provider: null, model: null,
      error: null, at: now, retryAt: null, jobId: null, receiptId: null },
    { key: "job:bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", kind: "job", status: "processing", process: "sources.fetch",
      subject: "信源采集中", articleId: null, provider: null, model: null,
      error: null, at: now, retryAt: null, jobId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", receiptId: null },
  ];
  const runs = { checkedAt: now, previewRuntime: { apiRelease: "new-develop-sha", workerRelease: "old-main-sha" }, processes: [{ role: "worker", pid: 1, host: "worker", release: "old-main-sha", startedAt: now, at: now, alive: true }],
    flowItems: rows, currentNews: { pending: 1, processing: 0, failed: 1 } };
  let retried = 0;
  const api = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://api.local").pathname;
    res.setHeader("content-type", "application/json");
    if (path === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
    if (path === "/api/admin/me") return res.end(JSON.stringify({ name: "Runs test", csrf: "fixture", dev: true }));
    if (path === "/api/admin/nav-counts") return res.end(JSON.stringify({ runs: 1 }));
    if (path === "/api/admin/runs") return res.end(JSON.stringify(runs));
    if (req.method === "POST" && (path === "/api/admin/content/news-1/rerun" ||
        path === "/api/admin/jobs/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/retry" ||
        path === "/api/admin/schedules/knowledge.graphiti.ingest/retry")) {
      if (path === "/api/admin/content/news-1/rerun") {
        let body = ""; for await (const chunk of req) body += String(chunk);
        assert.equal(JSON.parse(body).step, "analyze");
        assert.ok(String(req.headers["idempotency-key"] ?? "").length >= 8);
        rows[0]!.status = "pending";
      } else if (path.includes("/jobs/")) rows[1]!.status = "pending";
      else rows[2]!.status = "pending";
      retried += 1;
      return res.end(JSON.stringify({ requeued: 1, jobId: "job-recovery-" + retried }));
    }
    res.statusCode = 404;
    return res.end("{}");
  });
  const web = await startWebServer(api);
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    assert.equal((await page.goto(web.origin + "/admin/runs"))?.status(), 200);
    await expect(page.getByText("所有流程 · 三个实时状态")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "当前版本不一致" })).toBeVisible();
    await expect(page.getByRole("button", { name: /待处理/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /正在处理/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /处理失败/ })).toBeVisible();
    await expect(page.getByText("Graphiti HTTP 500")).toBeVisible();
    await expect(page.getByText("Provider HTTP 503")).toBeVisible();
    await expect(page.getByText("OpenRouter / nemotron-model")).toBeVisible();
    await expect(page.getByText("digest exception")).toBeVisible();
    for (const obsolete of ["积压原因诊断", "模型请求诊断", "今日记录与诊断", "队列与定时任务 · 技术诊断"]) {
      await expect(page.getByText(obsolete, { exact: true })).toHaveCount(0);
    }
    await page.getByRole("button", { name: "重新执行该流程" }).first().click();
    await expect(page.getByRole("link", { name: "失败新闻", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /待处理/ }).click();
    await expect(page.getByRole("link", { name: "失败新闻", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /处理失败/ }).click();
    await page.getByRole("checkbox", { name: /选择 事件综述/ }).check();
    await page.getByRole("checkbox", { name: /选择 Graphiti 知识入库/ }).check();
    await expect(page.getByRole("button", { name: /重新执行选中流程（2）/ })).toBeEnabled();
    await page.getByRole("button", { name: /重新执行选中流程（2）/ }).click();
    await expect(page.getByText("digest exception")).toHaveCount(0);
    await expect(page.getByText("Graphiti HTTP 500")).toHaveCount(0);
    assert.equal(retried, 3);
  } finally {
    await browser.close();
    await web.stop();
  }
});
