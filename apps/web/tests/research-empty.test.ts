// The research section's three public states (specs/adsense-minimal-readiness-20261111 US1): an empty
// section keeps its pages open but out of the index and out of the navigation; a published piece brings
// both back with no redeploy; an unreadable api fails closed — HTTP 503, noindex,follow, no entries
// anywhere, the error logged — and never stands in as "no research yet".
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import * as cheerio from 'cheerio';
import { startWebServer, type WebServer } from './web-server.ts';

let web: WebServer;
// What /api/research/articles answers now; the same site must move between states with no redeploy.
let mode: 'empty' | 'one' | 'down' = 'empty';

const summary = {
  slug: 'method-check', title: '口径核对', title_en: 'Counting methods', author: 'Jianbo Wang', author_note: 'EventGraph 编辑',
  summary: '对齐三种口径。', summary_en: 'Aligning three methods.', status: 'published',
  published_at: '2026-10-24T08:00:00.000Z', created_at: '2026-10-24T08:00:00.000Z', updated_at: '2026-10-24T08:00:00.000Z',
};
const api = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = (req.url ?? '').split('?')[0]!;
  if (url === '/api/health') return res.end(JSON.stringify({ ok: true }));
  if (url === '/api/site/track') { res.statusCode = 204; return res.end(); }
  if (url === '/api/site/meta') return res.end(JSON.stringify({ changelogVersion: '2026-01-01T00:00' }));
  if (url === '/api/site/changelog') return res.end(JSON.stringify({ releases: [], latestVersion: '2026-01-01T00:00' }));
  if (url === '/api/site/contact') return res.end(JSON.stringify({ wechatQr: null, feishuQr: null, makerAvatar: null }));
  if (url === '/api/site/stats') return res.end(JSON.stringify({ sources: 12, sourceKinds: { rss: 12 }, items: 300, selected: 40, dailies: 5, day: { collected: 20, selected: 3 }, sampleSources: [], latest: [] }));
  if (url === '/api/research/articles') {
    if (mode === 'down') { res.statusCode = 503; return res.end(JSON.stringify({ code: 'temporarily_unavailable' })); }
    return res.end(JSON.stringify({ articles: mode === 'one' ? [summary] : [] }));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ code: 'not_found' }));
});
before(async () => { web = await startWebServer(api); });
after(() => web.stop());

const open = async (path: string) => {
  const res = await fetch(`${web.origin}${path}`);
  return { res, $: cheerio.load(await res.text()) };
};
const robots = ($: cheerio.CheerioAPI) => $('meta[name="robots"]').attr("content") ?? "";
const entryLinks = ($: cheerio.CheerioAPI) => $('a[href="/research"]').length;
const tabBarResearch = ($: cheerio.CheerioAPI) => $('nav[aria-label="底部导航"] a[href="/research"], nav[aria-label="Bottom navigation"] a[href="/research"]').length;

test("with nothing published the pages open, out of the index, and no entry leads to them", async () => {
  mode = 'empty';
  const zh = await open('/research');
  assert.equal(zh.res.status, 200);
  assert.equal(robots(zh.$), "noindex, follow");
  assert.ok(zh.$('body').text().includes('还没有公开发表的研究'), 'the empty state says plainly that nothing is published');
  const en = await open('/en/research');
  assert.equal(en.res.status, 200);
  assert.equal(robots(en.$), "noindex, follow");
  assert.ok(en.$('body').text().includes('No research has been published yet'), 'the English empty state says the same');
  // Desktop sidebar, /more tools (its rows are the same DOM on desktop and 390px) and /about: no empty-section entry.
  for (const path of ['/about', '/more']) {
    const page = await open(path);
    assert.equal(entryLinks(page.$), 0, `${path} shows no research entry`);
    assert.equal(tabBarResearch(page.$), 0, `${path}: the phone tab bar gains no research tab`);
  }
});

test("one published piece restores the indexable list and the entries with no redeploy", async () => {
  mode = 'one';
  const zh = await open('/research');
  assert.equal(zh.res.status, 200);
  assert.equal(robots(zh.$), "", 'a list with a published piece is indexable');
  assert.equal(zh.$('a[href="/research/method-check"]').length, 1);
  const en = await open('/en/research');
  assert.equal(en.$('a[href="/en/research/method-check"]').length, 1);
  assert.equal(robots(en.$), "");
  const about = await open('/about');
  assert.equal(entryLinks(about.$), 2, 'about: the sidebar entry and the section button');
  assert.equal(tabBarResearch(about.$), 0, 'the tab bar still has no research tab');
  const more = await open('/more');
  assert.equal(entryLinks(more.$), 2, 'more: the sidebar entry and the tools row');
});

test("back to nothing published, entries and indexing withdraw again", async () => {
  mode = 'empty';
  const zh = await open('/research');
  assert.equal(zh.res.status, 200);
  assert.equal(robots(zh.$), "noindex, follow");
  const about = await open('/about');
  assert.equal(entryLinks(about.$), 0);
});

test("an unreadable research api fails closed and is not an empty list", async () => {
  mode = 'down';
  const zh = await open('/research');
  assert.equal(zh.res.status, 503);
  assert.match(zh.res.headers.get('x-robots-tag') ?? '', /noindex,\s*follow/);
  assert.match(zh.res.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(robots(zh.$), "noindex, follow");
  const text = zh.$('body').text();
  assert.ok(text.includes('研究暂时无法加载'), 'the page says the section cannot be loaded');
  assert.ok(!text.includes('还没有公开发表的研究'), 'a failure is never presented as "nothing published"');
  const en = await open('/en/research');
  assert.equal(en.res.status, 503);
  assert.ok(en.$('body').text().includes('Research is temporarily unavailable'));
  // Other pages render normally, with the research entries hidden and the failure logged.
  const about = await open('/about');
  assert.equal(about.res.status, 200);
  assert.equal(entryLinks(about.$), 0);
  const more = await open('/more');
  assert.equal(more.res.status, 200);
  assert.equal(entryLinks(more.$), 0);
  const logs = web.logs();
  assert.ok(logs.includes('"msg":"ssr api request failed"') && logs.includes('/api/research/articles'), 'the failed read is logged, not swallowed');
});

test("recovery brings the entries straight back", async () => {
  mode = 'one';
  const zh = await open('/research');
  assert.equal(zh.res.status, 200);
  assert.equal(zh.$('a[href="/research/method-check"]').length, 1);
  const about = await open('/about');
  assert.equal(entryLinks(about.$), 2);
});
