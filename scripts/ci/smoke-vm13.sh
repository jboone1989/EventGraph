#!/bin/sh
# Executed from the cn-dev smoke runner against VM13. Validates the
# deployed release and read-only public site data without changing production state.
set -eu
: "${EVENTGRAPH_PREVIEW_URL:?missing VM13 preview URL}"
: "${EVENTGRAPH_PREVIEW_RELEASE:?missing deployed release SHA}"
cd /home/ubuntu/livingruntime-aihot
[ -d node_modules/@playwright ] || { echo "dev host Playwright missing" >&2; exit 1; }
node --input-type=module <<'NODE'
import { chromium } from "@playwright/test";

const root = process.env.EVENTGRAPH_PREVIEW_URL.replace(/\/$/, "");
const release = process.env.EVENTGRAPH_PREVIEW_RELEASE;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// 1. Health with the deployed source SHA and a live database round trip.
const health = await (await fetch(root + "/api/health")).json();
assert(health.ok === true && health.db === "ok", "VM13 health not ok: " + JSON.stringify(health));
assert(health.release === release, `release ${health.release} != deployed ${release}`);

// The preview points at production data, so login/notes-write probes are forbidden.
// 2. The English archive should expose real English headlines in the API, not
// only the uniform date fallback. Source-original English titles are accepted.
const dailyRes = await fetch(root + "/api/site/reports/daily?en=1");
assert(dailyRes.status === 200, "daily archive API status " + dailyRes.status);
const dailyIndex = await dailyRes.json();
assert(dailyIndex.items?.some(item => item.titleEn && !/[㐀-鿿]/u.test(item.titleEn)),
  "English daily index has no actual English news headline");

// 3. Knowledge endpoints serve the production graph through the database tunnel.
const stats = await (await fetch(root + "/api/site/knowledge/stats")).json();
assert(stats.status === "ok" && stats.entities > 0, "knowledge stats not ok: " + JSON.stringify(stats));
const networkRes = await fetch(root + "/api/site/knowledge/network");
const network = await networkRes.json();
assert(networkRes.status === 200 && network.status !== "disabled" && network.nodes?.length > 0,
  "knowledge network not serving: " + networkRes.status + " " + JSON.stringify(network));

// 4. Browser pages: zh/en, desktop/mobile, no console errors, no horizontal overflow.
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
