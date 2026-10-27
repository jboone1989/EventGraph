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
import { SITE, subjectAfter } from '@aihot/site';
import type { FeedItemSummary } from '@aihot/contracts/site';

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
  if (url === '/api/site/pool') {
    const page = Number(new URL(req.url!, 'http://local').searchParams.get('page') || 1);
    const item: FeedItemSummary = {
      id: `title-fixture-${page}`, title: `全部第 ${page} 页`, summary: 'Fixture summary', reason: null,
      source: { name: 'Fixture' }, links: { original: 'https://example.org/a' }, publishedAt: '2026-10-27T00:00:00.000Z',
      timelineAt: '2026-10-27T00:00:00.000Z', category: 'research', tags: [], score: 80, selected: true, channel: 'news', english: null, x: null,
    };
    return res.end(JSON.stringify({ filters: { channel: 'all', category: null, tag: null, q: null, tab: 'time' }, items: [item], page, pageCount: 3, total: 3, todayCount: 1, freshness: '2026-10-27T00:00:00.000Z' }));
  }
  if (url === '/api/site/topics') return res.end(JSON.stringify({ groups: [], topics: [] }));
  if (url === '/api/research/articles') return res.end(JSON.stringify({ articles: [] }));
  if (url === '/api/site/case-studies/t09-title-fixture') return res.end(JSON.stringify({
    schemaVersion: 1, id: 't09-title-fixture', title: 'T09 fixture case', titleEn: 'T09 fixture case',
    summary: 'Fixture summary', summaryEn: 'Fixture summary', updated: '2026-10-27',
    generatedAt: '2026-10-27T00:00:00Z', tracks: [], links: [], unlinked: [],
  }));
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
    // A selected case has its own SSR title; the generic explorer index must not overwrite it.
    await page.goto(`${web.origin}/explore?case=t09-title-fixture`, { waitUntil: 'networkidle' });
    await titleBecomes(page, `T09 fixture case · 跨事件阅读实验 · ${SITE.name}`, '/explore?case=t09-title-fixture');
    // The research index uses the same English browser title as /en/research.
    await page.goto(`${web.origin}/research`, { waitUntil: 'networkidle' });
    await noChineseVisible(page, '/research');
    await titleBecomes(page, `Original research · ${SITE.name}`, '/research');
  } finally {
    await browser.close();
  }
});

// A query-string navigation (/all paging, search) must not resurrect the first visit's cached title,
// and a language switch back must restore the current view's own server title, not a stale one.
test('query-string navigation and language switches keep the current view its own title', async () => {
  const browser = await chromium.launch({ channel: 'chromium' });
  // The floating language switch is a phone control (lg:hidden in root.tsx); 390px is the accepted width.
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const all = `${subjectAfter('全部', '动态')} · ${SITE.name}`;
  try {
    await page.goto(`${web.origin}/all`, { waitUntil: 'networkidle' });
    await titleBecomes(page, all, '/all');
    // Client-side paging: the router owns the page-2 title; no cached page-1 title may overwrite it.
    await page.getByRole('link', { name: '下一页' }).click();
    await page.waitForURL('**/all?page=2');
    const page2 = `${subjectAfter('全部', '动态')} · 第 2 页 · ${SITE.name}`;
    await titleBecomes(page, page2, '/all?page=2');
    await page.waitForTimeout(800);
    assert.equal(await page.title(), page2, '/all?page=2 title must stay the query-owned one');
    // Switching to EN replaces it with the section label, and back restores this page's own title.
    await page.locator(`${SWITCH} button`, { hasText: 'EN' }).click();
    await titleBecomes(page, `All News · ${SITE.name}`, '/all?page=2 en');
    await page.locator(`${SWITCH} button`, { hasText: '中文' }).click();
    await titleBecomes(page, page2, '/all?page=2 zh');
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
