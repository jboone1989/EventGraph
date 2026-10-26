#!/bin/sh
# Executed on cn-dev after the VM13 deployment (never on VM13). Accepts the preview:
# deployed release, correct development backend, admin availability, a development
# write visible in the cn-dev development database, and the browser page checks.
# Every request goes to the VM13 preview URL or the local Docker database; production
# is never contacted.
set -eu
: "${EVENTGRAPH_PREVIEW_URL:?missing VM13 preview URL}"
: "${EVENTGRAPH_PREVIEW_RELEASE:?missing deployed release SHA}"
cd /home/ubuntu/livingruntime-aihot
[ -d node_modules/@playwright ] || { echo "cn-dev Playwright missing" >&2; exit 1; }
admin_password="$(sed -n 's/^ADMIN_PASSWORD=//p' .env | head -1 | tr -d '\r')"
[ -n "$admin_password" ] || { echo "ADMIN_PASSWORD missing in cn-dev .env" >&2; exit 1; }

EVENTGRAPH_ADMIN_PASSWORD="$admin_password" node --input-type=module <<'NODE'
import { execSync } from "node:child_process";
import { chromium } from "@playwright/test";

const root = process.env.EVENTGRAPH_PREVIEW_URL.replace(/\/$/, "");
const release = process.env.EVENTGRAPH_PREVIEW_RELEASE;
const adminPassword = process.env.EVENTGRAPH_ADMIN_PASSWORD;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// 1. Health with the deployed source SHA and a live database round trip.
const health = await (await fetch(root + "/api/health")).json();
assert(health.ok === true && health.db === "ok", "VM13 health not ok: " + JSON.stringify(health));
assert(health.release === release, `release ${health.release} != deployed ${release}`);

// 2. Real admin login with the development credential (production would reject it).
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

// 3. Verify the newly shipped sources were inserted into the DEVELOPMENT DB.
// An updated image without source seeding must fail deployment acceptance.
const sourceRes = await fetch(root + "/api/admin/sources?page=1", { headers: { cookie } });
assert(sourceRes.status === 200, "admin sources status " + sourceRes.status);
const sourceList = await sourceRes.json();
assert(sourceList.totals?.total >= 86, "new source pack missing: " + JSON.stringify(sourceList.totals));
for (const id of ["rss-cn-pboc-official", "rss-cn-csrc-official", "rss-un-geneva-press", "rss-gcaptain-maritime"]) {
  assert(sourceList.rows.some(s => s.id === id), "new source not seeded: " + id);
}

// 4. The English archive should expose real English headlines in the API, not
// only the uniform date fallback. Source-original English titles are accepted.
const dailyRes = await fetch(root + "/api/site/reports/daily?en=1");
assert(dailyRes.status === 200, "daily archive API status " + dailyRes.status);
const dailyIndex = await dailyRes.json();
assert(dailyIndex.items?.some(item => item.titleEn && !/[\u3400-\u9fff]/u.test(item.titleEn)),
  "English daily index has no actual English news headline");

// 5. Non-destructive development write: through the VM13 API, read back through the
//    API and directly from the cn-dev development database, then restore.
const day = new Date().toISOString().slice(0, 10);
const before = await (await fetch(root + "/api/admin/notes?days=365", { headers: { cookie } })).json();
const previous = before.rows.find(row => row.day === day) ?? null;
const probe = `VM13 CD probe ${release} ${Date.now()}`;
const writeRes = await fetch(root + "/api/admin/notes", {
  method: "POST",
  headers: { "content-type": "application/json", ...admin },
  body: JSON.stringify({ day, note: probe }),
});
assert(writeRes.status === 200, "note write status " + writeRes.status);
const after = await (await fetch(root + "/api/admin/notes?days=365", { headers: { cookie } })).json();
assert(after.rows.find(row => row.day === day)?.note === probe, "probe note not readable through the VM13 API");
const direct = execSync(
  `sudo -n docker exec aihot-db-1 psql -U aihot -d aihot -Atc "select note from editor_notes where day = '${day}'"`,
  { encoding: "utf8" },
).trim();
assert(direct === probe, "probe note not visible in the cn-dev development database");
if (previous) {
  const restoreRes = await fetch(root + "/api/admin/notes", {
    method: "POST",
    headers: { "content-type": "application/json", ...admin },
    body: JSON.stringify({ day, note: previous.note, noteEn: previous.noteEn }),
  });
  assert(restoreRes.status === 200, "note restore status " + restoreRes.status);
} else {
  execSync(`sudo -n docker exec aihot-db-1 psql -U aihot -d aihot -Atc "delete from editor_notes where day = '${day}'"`);
}
const restored = await (await fetch(root + "/api/admin/notes?days=365", { headers: { cookie } })).json();
const restoredRow = restored.rows.find(row => row.day === day) ?? null;
assert(previous ? restoredRow?.note === previous.note : restoredRow === null, "note state not restored");
console.log(JSON.stringify({ release, admin: me.name, probeDay: day, restored: previous ? "previous note" : "no prior note" }));

// 4. Knowledge endpoints return their built-in disabled state (Graphiti stays on cn-dev).
const stats = await (await fetch(root + "/api/site/knowledge/stats")).json();
assert(stats.status === "disabled", "knowledge stats not disabled: " + JSON.stringify(stats));
const networkRes = await fetch(root + "/api/site/knowledge/network");
const network = await networkRes.json();
assert(networkRes.status === 200 && network.status === "disabled",
  "knowledge network not disabled: " + networkRes.status + " " + JSON.stringify(network));

// 5. Browser pages: zh/en, desktop/mobile, no console errors, no horizontal overflow.
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
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
NODE
