#!/bin/sh
# Executed on cn-dev after VM13 Web deployment (never on VM13).
set -eu
: "${EVENTGRAPH_PREVIEW_URL:?missing VM13 preview URL}"
: "${EVENTGRAPH_EXPECTED_SHA:?missing expected source SHA}"
cd /home/ubuntu/livingruntime-aihot
[ -d node_modules/@playwright ] || { echo "cn-dev Playwright missing" >&2; exit 1; }
node --input-type=module <<'NODE'
import { chromium } from '@playwright/test';
const root = process.env.EVENTGRAPH_PREVIEW_URL.replace(/\/$/, '');
const expectedRelease = process.env.EVENTGRAPH_EXPECTED_SHA;
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
      const actualRelease = await page.locator('meta[name="livingruntime-release"]').getAttribute('content');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      const result = { path, width, status: response?.status(), actualLang: actual, actualRelease, expectedRelease, overflow, errors };
      console.log(JSON.stringify(result));
      if (response?.status() !== 200 || !actual?.startsWith(lang) || actualRelease !== expectedRelease || overflow || errors.length) failed = true;
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
