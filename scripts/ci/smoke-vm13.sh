#!/bin/sh
# Executed on the VM13 development host after the preview deployment. Accepts the
# deployed release, the production-data backend (reached through the database
# tunnel), admin availability, a non-destructive editorial-note write/read round
# trip, and browser page checks. Every request goes to the VM13 preview URL or
# the local Docker database; no other environment is contacted.
set -eu
: "${EVENTGRAPH_PREVIEW_URL:?missing VM13 preview URL}"
: "${EVENTGRAPH_PREVIEW_RELEASE:?missing deployed release SHA}"
cd /home/ubuntu/workspace/eventgraph
[ -d node_modules/@playwright ] || { echo "dev host Playwright missing" >&2; exit 1; }
admin_password="$(sed -n 's/^ADMIN_PASSWORD=//p' vm13.env | head -1 | tr -d '\r')"
[ -n "$admin_password" ] || { echo "ADMIN_PASSWORD missing in vm13.env" >&2; exit 1; }

EVENTGRAPH_ADMIN_PASSWORD="$admin_password" node --input-type=module <<'NODE'
import { chromium } from "@playwright/test";

const root = process.env.EVENTGRAPH_PREVIEW_URL.replace(/\/$/, "");
const release = process.env.EVENTGRAPH_PREVIEW_RELEASE;
const adminPassword = process.env.EVENTGRAPH_ADMIN_PASSWORD;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// 1. Health with the deployed source SHA and a live database round trip.
const health = await (await fetch(root + "/api/health")).json();
assert(health.ok === true && health.db === "ok", "VM13 health not ok: " + JSON.stringify(health));
assert(health.release === release, `release ${health.release} != deployed ${release}`);

// 2. Real admin login (the preview reads the production database, so this is the
// production admin credential held in vm13.env).
const login = await fetch(root + "/api/auth/password", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: "password=" + encodeURIComponent(adminPassword) + "&return=/admin",
  redirect: "manual",
});
assert(login.status === 303, "admin login status " + login.status);
const cookie = String(login.headers.get("set-cookie") ?? "").split(";")[0];
assert(cookie.includes("="), "no session cookie from admin login");
const meRes = await fetch(root + "/api/admin/me", { headers: { cookie } });
assert(meRes.status === 200, "/api/admin/me status " + meRes.status);
const me = await meRes.json();
assert(typeof me.csrf === "string" && me.csrf.length > 0, "no CSRF principal");
const admin = { cookie, "x-csrf-token": me.csrf };

// 3. The source registry is the production pack.
const sourceRes = await fetch(root + "/api/admin/sources?page=1", { headers: { cookie } });
assert(sourceRes.status === 200, "admin sources status " + sourceRes.status);
const sourceList = await sourceRes.json();
assert(sourceList.totals?.total >= 40, "production source pack missing: " + JSON.stringify(sourceList.totals));
for (const id of ["rss-ars-technica-ai", "rss-aws-ml", "rss-bair", "rss-bbc-business"]) {
  const res = await fetch(root + "/api/admin/sources?q=" + encodeURIComponent(id), { headers: { cookie } });
  assert(res.status === 200 && (await res.json()).rows.some(s => s.id === id), "production source missing: " + id);
}

// 4. The English archive should expose real English headlines in the API, not
// only the uniform date fallback. Source-original English titles are accepted.
const dailyRes = await fetch(root + "/api/site/reports/daily?en=1");
assert(dailyRes.status === 200, "daily archive API status " + dailyRes.status);
const dailyIndex = await dailyRes.json();
assert(dailyIndex.items?.some(item => item.titleEn && !/[㐀-鿿]/u.test(item.titleEn)),
  "English daily index has no actual English news headline");

// 5. Non-destructive write: through the VM13 API on a far-past date that no
//    daily page renders, read back through the API, then restore the prior
//    state through the same API.
const day = "2000-01-01";
const before = await (await fetch(root + "/api/admin/notes?days=36500", { headers: { cookie } })).json();
const previous = before.rows.find(row => row.day === day) ?? null;
const probe = `VM13 CD probe ${release} ${Date.now()}`;
const writeRes = await fetch(root + "/api/admin/notes", {
  method: "POST",
  headers: { "content-type": "application/json", ...admin },
  body: JSON.stringify({ day, note: probe }),
});
assert(writeRes.status === 200, "note write status " + writeRes.status);
const after = await (await fetch(root + "/api/admin/notes?days=36500", { headers: { cookie } })).json();
assert(after.rows.find(row => row.day === day)?.note === probe, "probe note not readable through the VM13 API");
if (previous) {
  const restoreRes = await fetch(root + "/api/admin/notes", {
    method: "POST",
    headers: { "content-type": "application/json", ...admin },
    body: JSON.stringify({ day, note: previous.note, noteEn: previous.noteEn }),
  });
  assert(restoreRes.status === 200, "note restore status " + restoreRes.status);
}
const restored = await (await fetch(root + "/api/admin/notes?days=36500", { headers: { cookie } })).json();
const restoredRow = restored.rows.find(row => row.day === day) ?? null;
assert(previous ? restoredRow?.note === previous.note : restoredRow === null, "note state not restored");
console.log(JSON.stringify({ release, admin: me.name, probeDay: day, restored: previous ? "previous note" : "far-past probe left in place" }));

// 6. Knowledge endpoints serve the production graph through the database tunnel.
const stats = await (await fetch(root + "/api/site/knowledge/stats")).json();
assert(stats.status === "ok" && stats.entities > 0, "knowledge stats not ok: " + JSON.stringify(stats));
const networkRes = await fetch(root + "/api/site/knowledge/network");
const network = await networkRes.json();
assert(networkRes.status === 200 && network.status !== "disabled" && network.nodes?.length > 0,
  "knowledge network not serving: " + networkRes.status + " " + JSON.stringify(network));

// 7. Browser pages: zh/en, desktop/mobile, no console errors, no horizontal overflow.
const browser = await chromium.launch({ headless: true });
const checks = [
  { path: '/', width: 1440, lang: 'zh' },
  { path: '/en', width: 1440, lang: 'en' },
  { path: '/daily', width: 1440, lang: 'zh' },
  { path: '/en/daily', width: 1440, lang: 'en' },
  { path: '/en/daily', width: 390, lang: 'en' },
];
let failed = false;
try {
  for (const { path, width, lang } of checks) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    try {
      const response = await page.goto(root + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(250);
      const actual = await page.locator('html').getAttribute('lang');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      const result = { path, width, status: response?.status(), actualLang: actual, overflow, errors };
      console.log(JSON.stringify(result));
      if (response?.status() !== 200 || !actual?.startsWith(lang) || overflow || errors.length) failed = true;
    } catch (error) {
      console.error(JSON.stringify({ path, width, error: String(error) }));
      failed = true;
    } finally {
      await page.close();
    }
  }

  // Admin control center: the deployed VM13 page, not just a GitHub CI fixture.
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const equal = cookie.indexOf("=");
    await context.addCookies([{ name: cookie.slice(0, equal), value: cookie.slice(equal + 1), url: root }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    try {
      const response = await page.goto(root + "/admin", { waitUntil: "domcontentloaded", timeout: 30000 });
      assert(response?.status() === 200, "admin overview route not 200");
      assert(await page.getByRole("heading", { name: "运营总览" }).count() === 1, "admin overview missing");
      assert(await page.getByText("最近 24 小时 · 新新闻处理链路").count() > 0, "admin processing funnel missing");
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), "admin horizontal overflow " + width);
      if (width === 390) {
        const more = page.locator("summary").filter({ hasText: "更多" });
        await more.click();
        const modelLink = page.locator("details").filter({ has: more }).getByRole("link", { name: "Provider 与模型", exact: true });
        assert(await modelLink.isVisible(), "admin More menu is hidden");
        const bounds = await modelLink.boundingBox();
        assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 2, "admin More menu clipped");
        const nav = page.getByRole("navigation", { name: "后台主要操作" });
        const overview = nav.getByRole("link", { name: "运营总览" });
        assert(await overview.getAttribute("aria-current") === "page", "admin overview not selected");
        await nav.getByRole("link", { name: /运行与积压/ }).click();
        await page.waitForURL(url => url.pathname === "/admin/runs", { timeout: 30000 });
        await page.locator('nav[aria-label="后台主要操作"] a[href="/admin"]:not([aria-current="page"])').waitFor({ state: "visible", timeout: 10000 });
        assert(await overview.getAttribute("aria-current") !== "page", "overview remains selected on child route");
      }
      assert(errors.length === 0, "admin JS errors: " + errors.join("; "));
      console.log(JSON.stringify({ adminOverview: true, width, status: response?.status(), mobileMore: width === 390 ? "checked" : "n/a" }));
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
NODE
