// The research section's public pages (specs/002-adsense-readiness US3, AD-11): the list names the
// author, the article page carries the byline, the method note and Article structured data.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import * as cheerio from 'cheerio';
import { startWebServer, type WebServer } from './web-server.ts';

let web: WebServer;
const article = {
  slug: 'method-check', title: '口径核对', title_en: 'Counting methods', author: 'Jianbo Wang', author_note: 'EventGraph 编辑',
  summary: '对齐三种口径。', summary_en: 'Aligning three methods.', method: '数据与口径：站内热度。\n来源：公开报道。', body_md: '## 结论\n\n差异来自口径。', body_md_en: null,
  status: 'published', published_at: '2026-10-24T08:00:00.000Z', created_at: '2026-10-24T08:00:00.000Z', updated_at: '2026-10-24T08:00:00.000Z',
};
const api = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = (req.url ?? '').split('?')[0]!;
  if (url === '/api/health') return res.end(JSON.stringify({ ok: true }));
  if (url === '/api/site/track') { res.statusCode = 204; return res.end(); }
  if (url === '/api/site/meta') return res.end(JSON.stringify({ changelogVersion: '2026-01-01T00:00' }));
  if (url === '/api/site/changelog') return res.end(JSON.stringify({ releases: [], latestVersion: '2026-01-01T00:00' }));
  if (url === '/api/research/articles') return res.end(JSON.stringify({ articles: [{ ...article, method: undefined, body_md: undefined, body_md_en: undefined }] }));
  if (url === '/api/research/articles/method-check') return res.end(JSON.stringify({ article }));
  res.statusCode = 404;
  res.end(JSON.stringify({ code: 'not_found' }));
});
before(async () => { web = await startWebServer(api); });
after(() => web.stop());

test('/research lists the signed piece with its author', async () => {
  const $ = cheerio.load(await (await fetch(`${web.origin}/research`)).text());
  assert.ok($('h1').first().text().includes('原创研究'), 'the section headline renders');
  const card = $('a[href="/research/method-check"]');
  assert.equal(card.length, 1);
  assert.ok(card.text().includes('Jianbo Wang'), 'the byline shows on the list');
});

test('/research/:slug carries the byline, the method and Article structured data', async () => {
  const $ = cheerio.load(await (await fetch(`${web.origin}/research/method-check`)).text());
  const text = $('body').text();
  assert.ok($('h1').first().text().includes('口径核对'));
  assert.ok(text.includes('Jianbo Wang'), 'author');
  assert.ok(text.includes('方法与数据来源'), 'the method note renders');
  const scripts = $('script[type="application/ld+json"]').toArray().map((el) => $(el).text());
  const parsed = scripts.map((s) => JSON.parse(s) as { '@type'?: string; author?: { name?: string } }).find((v) => v['@type'] === 'Article');
  assert.ok(parsed, 'an Article structured-data block exists');
  assert.equal(parsed['@type'], 'Article');
  assert.equal(parsed.author?.name, 'Jianbo Wang');
});

test('/en/research reads English fields where the piece has them', async () => {
  const $ = cheerio.load(await (await fetch(`${web.origin}/en/research`)).text());
  const card = $('a[href="/en/research/method-check"]');
  assert.equal(card.length, 1);
  assert.ok(card.text().includes('Counting methods'), 'the English title leads the card');
});
