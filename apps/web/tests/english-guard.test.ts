// English-layout-parity guards: /en/weekly and /en/monthly resolve, and sampled English pages never
// present Chinese text as English (the site's iron rule). The /en/* routes are asserted on the server
// render; the pages that switch by the reader's language preference are asserted in a browser after
// the preference takes effect.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import * as cheerio from 'cheerio';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startWebServer, type WebServer } from './web-server.ts';
import { SITE } from '@aihot/site';

let web: WebServer;
const api = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = (req.url ?? '').split('?')[0]!;
  if (url === '/api/health') return res.end(JSON.stringify({ ok: true }));
  if (url === '/api/site/track') { res.statusCode = 204; return res.end(); }
  if (url === '/api/site/meta') return res.end(JSON.stringify({ changelogVersion: '2026-01-01T00:00' }));
  if (url === '/api/site/changelog') return res.end(JSON.stringify({ releases: [], latestVersion: '2026-01-01T00:00' }));
  if (/^\/api\/site\/reports\/(daily|weekly|monthly)\/latest-page$/.test(url)) return res.end(JSON.stringify({ index: [], report: null }));
  if (url === '/api/site/reports/daily') return res.end(JSON.stringify({ items: [] }));
  if (url === '/api/site/hot') return res.end(JSON.stringify({ computedAt: null, windowHours: 48, entries: [] }));
  if (url === '/api/site/topics') return res.end(JSON.stringify({ groups: [], topics: [] }));
  if (url === '/api/research/articles') return res.end(JSON.stringify({ articles: [] }));
  res.statusCode = 404;
  res.end(JSON.stringify({ code: 'not_found' }));
});
before(async () => { web = await startWebServer(api); });
after(() => web.stop());

const HAN = /[㐀-鿿豈-﫿]/;
// The language switch names the other language in that language ("中文" on an English page), by design.
const SWITCH = '[aria-label="Language / 语言"]';

// The /en/* routes render English on the server (an /en path is an English page by its address).
for (const path of ['/en/daily', '/en/weekly', '/en/monthly', '/en/hot', '/en/topics', '/en/knowledge', '/en/explore']) {
  test(`${path} renders English layout: no Chinese text nodes`, async () => {
    const response = await fetch(`${web.origin}${path}`);
    assert.equal(response.status, 200, web.logs());
    const $ = cheerio.load(await response.text());
    // The zh-default meta description and serialized loader data live in title/script; the rule is
    // about what readers see.
    $('script, style, title').remove();
    $(SWITCH).remove();
    const text = $('body').text();
    const hit = HAN.exec(text);
    assert.ok(!hit, hit ? `${path} shows Chinese: …${text.slice(Math.max(0, (hit.index ?? 0) - 40), (hit.index ?? 0) + 40).trim()}…` : path);
  });
}

// The tool pages keep one address per language and switch by preference; their server render is
// Chinese, so the English claim needs a browser that has set the preference.
test('preference-switched pages render English once the reader prefers it', async () => {
  const browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('livingruntime-language', 'en'));
  const page = await context.newPage();
  try {
    for (const path of ['/about', '/changelog', '/agent', '/feedback', '/starred', '/terms', '/privacy', '/more', '/daily/archive']) {
      await page.goto(`${web.origin}${path}`, { waitUntil: 'networkidle' });
      await noChineseVisible(page, path);
    }
  } finally {
    await browser.close();
  }
});

/** The preference takes effect on the first hydrated render; poll until the Chinese server copy is gone. */
async function noChineseVisible(page: Page, path: string) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const text = await page.evaluate((switchSel) => {
      document.querySelectorAll(switchSel).forEach((el) => el.remove());
      return document.body.innerText;
    }, SWITCH);
    const hit = HAN.exec(text);
    if (!hit) return;
    if (Date.now() > deadline) {
      assert.fail(`${path} shows Chinese: …${text.slice(Math.max(0, hit.index - 40), hit.index + 40).trim()}…`);
    }
    await page.waitForTimeout(250);
  }
}

// English preference sets recognized browser titles, including the research index.
// Unknown dynamic module pages keep their server-owned metadata instead of `${SITE} · ${SITE}` (T09).
test('preference-switched browser titles keep each page its own, not the bare site name', async () => {
  const browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('livingruntime-language', 'en'));
  const page = await context.newPage();
  try {
    for (const [path, heading] of [['/explore', 'Event explorer'], ['/calendar', 'Policy & data calendar']] as const) {
      await page.goto(`${web.origin}${path}`, { waitUntil: 'networkidle' });
      await titleBecomes(page, `${heading} · ${SITE.name}`, path);
    }
    // The research index uses the same English browser title as /en/research.
    await page.goto(`${web.origin}/research`, { waitUntil: 'networkidle' });
    await noChineseVisible(page, '/research');
    await titleBecomes(page, `Original research · ${SITE.name}`, '/research');
  } finally {
    await browser.close();
  }
});

async function titleBecomes(page: Page, expected: string, path: string) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    if ((await page.title()) === expected) return;
    if (Date.now() > deadline) assert.fail(`${path} title is ${JSON.stringify(await page.title())}, expected ${JSON.stringify(expected)}`);
    await page.waitForTimeout(250);
  }
}
