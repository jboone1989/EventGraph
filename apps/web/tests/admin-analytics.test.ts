import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";
import { startWebServer } from "./web-server.ts";

const api = createServer((req, res) => {
  const path = new URL(req.url!, "http://api.local").pathname;
  res.setHeader("content-type", "application/json");
  if (path === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
  if (path === "/api/admin/me") return res.end(JSON.stringify({ name: "Analytics test", csrf: "fixture", dev: true }));
  if (path === "/api/admin/nav-counts") return res.end("{}");
  if (path === "/api/admin/analytics") return res.end(JSON.stringify({
    periodDays: 30, asOf: "2026-11-05T08:00:00.000Z",
    ingestion: { total_events: 50, last_event_at: "2026-11-05T07:59:00Z" },
    summary: { today: 12, yesterday: 32, seven_days: 90, thirty_days: 120 },
    daily: [{ day: "2026-11-04", page_views: 32 }, { day: "2026-11-05", page_views: 12 }],
    pageTypes: [{ page_type: "home", page_views: 45 }, { page_type: "item", page_views: 50 }],
    content: [{ page_type: "item", content_id: "article1", count: 9 }],
    referrers: [{ host: "www.google.com", page_views: 17 }],
    cloudflare: { state: "ready", data: { pageViews: 91, daily: [] }, refreshedAt: "2026-11-05T08:00:00Z" },
    searchConsole: { state: "ready", refreshedAt: "2026-11-05T08:00:00Z", data: {
      clicks: 5, impressions: 120, ctr: 5 / 120, position: 12,
      startDate: "2026-10-05", endDate: "2026-11-03",
      pageRows: 1, pagesTruncated: false,
      pageTypes: [{ kind: "news", pages: 1, clicks: 5, impressions: 120, ctr: 5 / 120 }],
      opportunities: [{ page: "https://example.com/items/article1", clicks: 5, impressions: 120 }],
    } },
  }));
  res.statusCode = 404;
  res.end("{}");
});

test("PV dashboard shows one primary source, page counts and no invented AdSense revenue", async () => {
  const web = await startWebServer(api);
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      try {
        const response = await page.goto(web.origin + "/admin/analytics");
        assert.equal(response?.status(), 200);
        await expect(page.getByRole("heading", { name: "流量与广告", exact: true })).toBeVisible();
        const stat = (label: string) => page.getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]");
        await expect(stat("今日 PV")).toHaveText("12");
        await expect(stat("近 30 天 PV")).toHaveText("120");
        await expect(page.getByText("新闻 · article1")).toBeVisible();
        await expect(page.getByText("9 次")).toBeVisible();
        await expect(page.getByText("尚未接入 AdSense 报表。", { exact: false })).toBeVisible();
        await expect(page.getByText("PostHog", { exact: false })).toHaveCount(0);
        const details = page.locator("details").filter({ hasText: "有搜索曝光的新闻落地页" });
        await details.locator("summary").click();
        await expect(details.locator('a[href="https://example.com/items/article1"]')).toBeVisible();
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await web.stop();
  }
});
