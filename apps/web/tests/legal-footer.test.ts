// The legal footer (specs/002-adsense-readiness FR-002/FR-003): every public page carries the privacy,
// terms and contact links, in the page's own language, before any review submission.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import * as cheerio from 'cheerio';
import { startWebServer, type WebServer } from './web-server.ts';

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
  res.statusCode = 404;
  res.end(JSON.stringify({ code: 'not_found' }));
});
before(async () => { web = await startWebServer(api); });
after(() => web.stop());

for (const [path, privacyHref, termsHref, contactLabel] of [
  ['/daily', '/privacy', '/terms', '联系 login@livingruntime.com'],
  ['/hot', '/privacy', '/terms', '联系 login@livingruntime.com'],
  ['/en/hot', '/en/privacy', '/en/terms', 'Contact login@livingruntime.com'],
  ['/en/topics', '/en/privacy', '/en/terms', 'Contact login@livingruntime.com'],
] as const) {
  test(`${path} carries the legal footer`, async () => {
    const response = await fetch(`${web.origin}${path}`);
    assert.equal(response.status, 200, web.logs());
    const $ = cheerio.load(await response.text());
    const mailto = $(`a[href="mailto:login@livingruntime.com"]`);
    assert.equal(mailto.length, 1, `${path}: exactly one contact mailto`);
    assert.match(mailto.text() ?? '', new RegExp(contactLabel.slice(0, 12)), `${path}: contact label language`);
    assert.equal($(`footer a[href="${privacyHref}"]`).length, 1, `${path}: privacy link -> ${privacyHref}`);
    assert.equal($(`footer a[href="${termsHref}"]`).length, 1, `${path}: terms link -> ${termsHref}`);
  });
}

test('/privacy and /terms render the filled-in facts, not placeholders', async () => {
  for (const path of ['/privacy', '/terms']) {
    const $ = cheerio.load(await (await fetch(`${web.origin}${path}`)).text());
    const text = $('body').text();
    assert.ok(!text.includes('请填写'), `${path}: no 请填写`);
    assert.ok(!text.includes('请写明'), `${path}: no 请写明`);
    assert.ok(text.includes('Jianbo Wang'), `${path}: operator named`);
    assert.ok(text.includes('login@livingruntime.com'), `${path}: contact shown`);
  }
});

test('/en/privacy and /en/terms resolve with English facts', async () => {
  for (const path of ['/en/privacy', '/en/terms']) {
    const response = await fetch(`${web.origin}${path}`);
    assert.equal(response.status, 200, web.logs());
    const $ = cheerio.load(await response.text());
    assert.equal($('html').attr('lang'), 'en', `${path}: English document`);
    const text = $('body').text();
    assert.ok(text.includes('Jianbo Wang'), `${path}: operator named`);
    assert.ok(text.includes('login@livingruntime.com'), `${path}: contact shown`);
  }
});
