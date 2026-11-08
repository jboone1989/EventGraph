import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, expect, type Locator, type Page } from "@playwright/test";
import { startWebServer } from "./web-server.ts";

// The 运行与积压 badge is the runs page's 处理失败 total: today's failed execution units,
// unaffected by the page's local kind filter, and refreshed together with the page.
test("runs badge equals the failed execution units and refreshes with the page", async () => {
  const now = new Date().toISOString();
  const item = (n: number, kind: "article" | "model" | "delivery", status: "failed" | "pending" | "processing") => ({
    key: `${kind}:${n}`, kind, status,
    process: kind === "model" ? "group_article" : kind === "delivery" ? "notify.selected" : "新闻统一分析",
    subject: status === "failed" ? `失败单元 ${n}` : status === "pending" ? `等待单元 ${n}` : `执行中单元 ${n}`,
    articleId: kind === "article" ? `news-${n}` : null,
    provider: kind === "model" ? "Groq" : null, model: kind === "model" ? "test-model" : null,
    error: status === "failed" ? "Model cannot route text: Model is disabled" : null,
    at: now, retryAt: null, jobId: null, receiptId: null,
  });
  const rows = [
    ...Array.from({ length: 18 }, (_, i) => item(i + 1, "article", "failed")),
    item(19, "model", "failed"), item(20, "model", "failed"), item(21, "delivery", "failed"),
    item(22, "article", "pending"), item(23, "article", "processing"),
  ];
  const state = { runs: rows.filter(r => r.status === "failed").length, rows: [...rows] };
  let runsCalls = 0;
  let navCalls = 0;
  const api = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://api.local").pathname;
    res.setHeader("content-type", "application/json");
    if (path === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
    if (path === "/api/admin/me") return res.end(JSON.stringify({ name: "Runs badge test", csrf: "fixture", dev: true }));
    if (path === "/api/admin/nav-counts") { navCalls += 1; return res.end(JSON.stringify({ runs: state.runs })); }
    if (path === "/api/admin/runs") {
      runsCalls += 1;
      return res.end(JSON.stringify({ checkedAt: now, processes: [], flowItems: state.rows }));
    }
    res.statusCode = 404;
    return res.end("{}");
  });
  const web = await startWebServer(api);
  const browser = await chromium.launch({ channel: "chromium" });
  const title = "UTC 今日失败执行单元（按执行单元计数，非新闻篇数）";
  // The badge exists for the desktop sidebar and the mobile top bar; only one is visible per viewport.
  const badge = (page: Page): Locator => page.getByTitle(title).filter({ visible: true });
  try {
    // Desktop 1530px: the sidebar badge sits next to the 运行与积压 entry it explains.
    const page = await browser.newPage({ viewport: { width: 1530, height: 960 } });
    assert.equal((await page.goto(web.origin + "/admin/runs"))?.status(), 200);
    await expect(page.getByText("所有流程 · 三个实时状态")).toBeVisible();
    await expect(badge(page)).toHaveText("21");
    await expect(page.locator('[aria-label="UTC 今日失败执行单元 21"]').filter({ visible: true })).toBeVisible();
    await expect(page.getByText("按执行单元计数，与新闻篇数不同")).toBeVisible();
    // The all-kind failed total, its detail row count and pagination all describe the same 21 units.
    await expect(page.getByRole("button", { name: "处理失败" })).toContainText("21");
    await expect(page.getByText("21 项 · 第 1/2 页")).toBeVisible();
    assert.equal(await page.locator("tbody tr").count(), 20, "page size stays 20 rows");
    await expect(page.getByText("失败单元 21")).toHaveCount(0);
    await page.getByRole("button", { name: "下一页" }).click();
    await expect(page.getByText("失败单元 21")).toBeVisible();
    await page.getByRole("button", { name: "上一页" }).click();
    // The local kind filter narrows the page's cards but never the global badge.
    await page.getByLabel("流程类型").selectOption("model");
    await expect(page.getByRole("button", { name: "处理失败" })).toContainText("2");
    await expect(badge(page)).toHaveText("21");
    await page.getByLabel("流程类型").selectOption("all");
    await expect(page.getByRole("button", { name: "处理失败" })).toContainText("21");

    // Mobile 390px: the same badge and its explanation stay reachable in the top bar.
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    assert.equal((await mobile.goto(web.origin + "/admin/runs"))?.status(), 200);
    await expect(badge(mobile)).toHaveText("21");
    await expect(mobile.getByRole("button", { name: "重新入队" }).first()).toBeVisible();
    await mobile.close();

    // One refresh updates the badge and the page from the same pass: a recovered unit drops
    // from both, and zero failures hide the badge while the empty state spells it out.
    state.rows[0] = { ...state.rows[0]!, status: "processing", subject: "执行中单元 1" };
    state.runs = 20;
    const runsBefore = runsCalls, navBefore = navCalls;
    await page.getByRole("button", { name: "刷新" }).click();
    await expect(badge(page)).toHaveText("20");
    await expect(page.getByRole("button", { name: "处理失败" })).toContainText("20");
    await expect(page.getByText("20 项 · 第 1/1 页")).toBeVisible();
    assert.ok(runsCalls > runsBefore && navCalls > navBefore, "one refresh refetches the page and the badge together");

    state.rows = state.rows.map(row => row.status === "failed" ? { ...row, status: "processing" as const } : row);
    state.runs = 0;
    await page.getByRole("button", { name: "刷新" }).click();
    await expect(page.getByTitle(title)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "处理失败" })).toContainText("0");
    await expect(page.getByText("当前没有对应执行项")).toBeVisible();
    await page.close();
  } finally {
    await browser.close();
    await web.stop();
  }
});
