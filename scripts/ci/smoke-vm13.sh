#!/bin/sh
# Run on a GitHub-hosted runner against VM13, independent of cn-dev.
# Validate the deployed develop Web/API and writable production DB session.
# No state is mutated by this public-browser smoke; the deploy runs a rolled-back SQL probe.
set -eu
: "${EVENTGRAPH_PREVIEW_URL:?missing VM13 preview URL}"
: "${EVENTGRAPH_PREVIEW_RELEASE:?missing deployed release SHA}"
cd "$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
[ -d node_modules/@playwright ] || { echo "Playwright dependency missing in checkout" >&2; exit 1; }
node --input-type=module <<'NODE'
import { chromium } from "@playwright/test";

const root = process.env.EVENTGRAPH_PREVIEW_URL.replace(/\/$/, "");
const release = process.env.EVENTGRAPH_PREVIEW_RELEASE;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// 1. Health with the deployed source SHA and a live database round trip.
const health = await (await fetch(root + "/api/health")).json();
assert(health.ok === true && health.db === "ok", "VM13 health not ok: " + JSON.stringify(health));
assert(health.release === release, `release ${health.release} != deployed ${release}`);
assert(health.dbReadOnly === false, "VM13 PostgreSQL session remains read-only");

// The preview now permits admin writes to production, but the public smoke
// remains non-mutating; the deploy already proved transactional writes.
// 2. The English archive should expose real English headlines in the API, not
// only the uniform date fallback. Source-original English titles are accepted.
const dailyRes = await fetch(root + "/api/site/reports/daily?en=1");
assert(dailyRes.status === 200, "daily archive API status " + dailyRes.status);
const dailyIndex = await dailyRes.json();
assert(dailyIndex.items?.some(item => item.titleEn && !/[㐀-鿿]/u.test(item.titleEn)),
  "English daily index has no actual English news headline");

// 3. Knowledge endpoints serve the production graph through the database tunnel.
const stats = await (await fetch(root + "/api/site/knowledge/stats")).json();
assert(Number.isInteger(stats.entities) && stats.entities > 0 && Number.isInteger(stats.relations) && stats.relations > 0,
  "knowledge stats not ok: " + JSON.stringify(stats));
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
// Log the failing request, not just Chromium's unhelpful "Failed to load resource: 502".
// Keep credentials out of public Actions logs, including nested source-image URLs.
const diagnosticUrl = (raw) => {
  try {
    const url = new URL(raw);
    const source = url.searchParams.get('u');
    const values = [...url.searchParams.keys()];
    for (const key of values) {
      if (key === 'u' && source) {
        try {
          const upstream = new URL(source);
          upstream.username = '';
          upstream.password = '';
          upstream.search = '';
          upstream.hash = '';
          url.searchParams.set('u', upstream.toString());
        } catch {
          url.searchParams.set('u', '[invalid upstream URL]');
        }
      } else if (key !== 'mode' && key !== 'exp') {
        url.searchParams.set(key, '[redacted]');
      }
    }
    url.username = '';
    url.password = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '[invalid URL]';
  }
};
let failed = false;
try {
  for (const { path, width, lang } of checks) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    const httpErrors = [];
    const networkFailures = [];
    page.on('response', response => {
      if (response.status() < 400) return;
      const request = response.request();
      httpErrors.push({
        status: response.status(),
        method: request.method(),
        resourceType: request.resourceType(),
        url: diagnosticUrl(response.url()),
      });
    });
    page.on('requestfailed', request => {
      networkFailures.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url: diagnosticUrl(request.url()),
        failure: request.failure()?.errorText ?? 'unknown network failure',
      });
    });
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    try {
      const response = await page.goto(root + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(250);
      const actual = await page.locator('html').getAttribute('lang');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      const result = { path, width, status: response?.status(), actualLang: actual, overflow, errors, httpErrors, networkFailures };
      console.log(JSON.stringify(result));
      if (response?.status() !== 200 || !actual?.startsWith(lang) || overflow || errors.length || httpErrors.length || networkFailures.length) failed = true;
    } catch (error) {
      console.error(JSON.stringify({ path, width, error: String(error), httpErrors, networkFailures }));
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
