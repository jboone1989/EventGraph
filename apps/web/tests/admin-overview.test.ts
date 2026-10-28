// Spec 009 (specs/009-ops-control-center/spec.md, approved 2026-10-26): the operations overview
// reads only /api/admin/runs and /api/admin/sources; when an endpoint fails the page must show
// 未获取 (not fetched) — never zeros or a healthy banner — and /admin must render the overview
// instead of redirecting away. T11 verified this once in a browser; this file keeps it true.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { startWebServer, type WebServer } from "./web-server.ts";

const totals = { total: 12, enabled: 9, failing: 2, degraded: 1 };

/** The admin API with the two overview endpoints failing on demand; everything else healthy. */
function api(fail: { runs?: boolean; sources?: boolean }) {
  return createServer((req, res) => {
    const path = new URL(req.url!, "http://api.local").pathname;
    res.setHeader("content-type", "application/json");
    if (path === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
    if (path === "/api/admin/me") return res.end(JSON.stringify({ name: "Overview test", csrf: "fixture", dev: true }));
    if (path === "/api/admin/nav-counts") return res.end("{}");
    if (path === "/api/admin/runs") {
      if (fail.runs) {
        res.statusCode = 503;
        return res.end(JSON.stringify({ detail: "runs unavailable" }));
      }
      // Keep the healthy Worker fixture fresh: a fixed 2026 timestamp would
      // eventually make the unrelated sources-failure test report a stale Worker.
      const observedAt = new Date().toISOString();
      return res.end(JSON.stringify({
        checkedAt: observedAt,
        processes: [{ role: "worker", alive: true, host: "cn-dev", at: observedAt }],
        queues: [], jobs: [], lagging: [], failedJobs: [],
        live24h: { discovered: 3, analyzed: 3, grouped: 2, waiting: 0, stalled: 0, failed: 0 },
        articleProcessing: { unavailableModel: 0 },
      }));
    }
    if (path === "/api/admin/sources") {
      if (fail.sources) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ detail: "sources unavailable" }));
      }
      return res.end(JSON.stringify({ rows: [], totals, page: 1 }));
    }
    res.statusCode = 404;
    res.end("{}");
  });
}

async function overview(browser: Browser, web: WebServer) {
  const page = await browser.newPage();
  const response = await page.goto(web.origin + "/admin");
  assert.ok(response, "the overview page must answer");
  assert.equal(response.status(), 200);
  assert.ok(page.url().endsWith("/admin"), `stayed on the overview, not redirected to ${page.url()}`);
  // A Stat cell is the label element plus its next sibling, the value element.
  const stat = (label: string) => page.getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]");
  return { page, stat };
}

test("a failing runs API shows 未获取, not zeros or a healthy banner, while healthy sources still show", async () => {
  const web = await startWebServer(api({ runs: true }));
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ channel: "chromium" });
    const { page, stat } = await overview(browser, web);
    await expect(stat("新发现")).toHaveText("未获取");
    await expect(stat("Worker")).toHaveText("未获取");
    // The healthy endpoint keeps its real numbers: one failure must not flatten the page to zeros.
    await expect(stat("信源总数")).toHaveText("12");
    await expect(stat("失败信源")).toHaveText("2");
    await expect(page.getByText("运行数据未获取 · 不能判定系统健康")).toBeVisible();
    await expect(page.getByText("运行状态未获取，无法判断 Worker 和处理队列是否正常")).toBeVisible();
    await expect(page.getByText("当前已检查的指标未发现异常")).toHaveCount(0);
  } finally {
    await browser?.close();
    await web.stop();
  }
});

test("a failing sources API alone shows 未获取 while healthy runs remain visible", async () => {
  const web = await startWebServer(api({ sources: true }));
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ channel: "chromium" });
    const { page, stat } = await overview(browser, web);
    await expect(stat("信源总数")).toHaveText("未获取");
    await expect(stat("失败信源")).toHaveText("未获取");
    await expect(stat("新发现")).toHaveText("3");
    await expect(stat("Worker")).toContainText("运行中");
    await expect(page.getByText("信源统计未获取，无法确认采集健康度")).toBeVisible();
    await expect(page.getByText("部分数据未获取")).toBeVisible();
    await expect(page.getByText("当前已检查的指标未发现异常")).toHaveCount(0);
  } finally {
    await browser?.close();
    await web.stop();
  }
});

test("both overview APIs failing must never produce a false healthy or zero-data state", async () => {
  const web = await startWebServer(api({ runs: true, sources: true }));
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ channel: "chromium" });
    const { page, stat } = await overview(browser, web);
    for (const label of ["新发现", "Worker", "信源总数", "失败信源"]) {
      await expect(stat(label)).toHaveText("未获取");
    }
    await expect(page.getByText("运行数据未获取 · 不能判定系统健康")).toBeVisible();
    await expect(page.getByText("运行状态未获取，无法判断 Worker 和处理队列是否正常")).toBeVisible();
    await expect(page.getByText("信源统计未获取，无法确认采集健康度")).toBeVisible();
    await expect(page.getByText("当前已检查的指标未发现异常")).toHaveCount(0);
  } finally {
    await browser?.close();
    await web.stop();
  }
});

test("healthy overview baseline retains real Worker and source counts", async () => {
  // Failure-only fixtures can hide a page that always renders 未获取.
  // This control proves the same browser route reads both successful endpoints.
  const web = await startWebServer(api({}));
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ channel: "chromium" });
    const { page, stat } = await overview(browser, web);
    await expect(stat("新发现")).toHaveText("3");
    await expect(stat("Worker")).toContainText("运行中");
    await expect(stat("信源总数")).toHaveText("12");
    await expect(stat("失败信源")).toHaveText("2");
    await expect(page.getByText("运行数据未获取 · 不能判定系统健康")).toHaveCount(0);
    await expect(page.getByText("部分数据未获取")).toHaveCount(0);
  } finally {
    await browser?.close();
    await web.stop();
  }
});
