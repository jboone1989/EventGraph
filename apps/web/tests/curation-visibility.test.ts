// Curation visibility on the pages themselves (specs/003-content-assets CA-01/02/03): a curated page
// names its curation date, an uncurated one does not, and a thin single-source event carries the
// 快讯 label while staying out of the index.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import * as cheerio from 'cheerio';
import { startWebServer, type WebServer } from './web-server.ts';

const at = '2026-10-24T08:00:00.000Z';
const itemBase = { id: 'x', title: '可核实的测试报道', summary: '报道摘要', reason: null, source: { name: 'Fixture' }, links: { original: 'https://example.org/report' }, publishedAt: at, timelineAt: at, category: 'research', tags: [], score: 80, selected: true, channel: 'news', x: null };
const itemDetail = (id: string, curatedAt: string | null) => ({
  ...itemBase, id, x: null, originalTitle: null, links: { original: 'https://example.org/report' }, discoveredAt: at, story: null,
  readingMode: 'full', author: null, body: { zh: '<p>可核实的测试正文。</p>', original: null, zhKind: 'original', complete: true }, outline: [],
  relatedStories: [], topics: [], indexable: curatedAt !== null, curatedAt, englishIndexable: false, markdownAvailable: false, group: null,
  hasTranslation: false, bodyLanguage: 'zh',
});
const storyDetail = (publicId: string, options: { curatedAt: string | null; note: boolean; indexable: boolean }) => ({
  publicId, title: '测试事件的最新进展', status: 'settled', reportCount: 1, sourceCount: 1, firstReportAt: at, latestAt: at,
  digest: '测试事件综述。', digestUpdatedAt: at, summary: null, excerpt: null, latest: null, latestReport: null,
  whyHot: { participants48h: 0, newParticipants6h: 0, recentReports24h: 0, observationComplete: true, rank: null },
  developments: [], officialReports: [], timeline: [{ id: `${publicId}-r`, title: '报道', summary: '摘要', source: { name: 'Fixture', firstParty: true }, publishedAt: at, selected: true }],
  heat: [], related: [], topics: [], indexable: options.indexable, curatedAt: options.curatedAt, note: options.note,
});

const api = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = (req.url ?? '').split('?')[0]!;
  if (url === '/api/health') return res.end(JSON.stringify({ ok: true }));
  if (url === '/api/site/track') { res.statusCode = 204; return res.end(); }
  if (url === '/api/site/meta') return res.end(JSON.stringify({ changelogVersion: '2026-01-01T00:00' }));
  if (url === '/api/site/changelog') return res.end(JSON.stringify({ releases: [], latestVersion: '2026-01-01T00:00' }));
  if (url === '/api/site/stories/curated-note') return res.end(JSON.stringify(storyDetail('curated-note', { curatedAt: at, note: true, indexable: false })));
  if (url === '/api/site/stories/curated-story') return res.end(JSON.stringify(storyDetail('curated-story', { curatedAt: at, note: false, indexable: true })));
  if (url === '/api/site/stories/plain-story') return res.end(JSON.stringify(storyDetail('plain-story', { curatedAt: null, note: false, indexable: true })));
  if (url === '/api/site/items/curated-item') return res.end(JSON.stringify(itemDetail('curated-item', at)));
  if (url === '/api/site/items/plain-item') return res.end(JSON.stringify(itemDetail('plain-item', null)));
  res.statusCode = 404;
  res.end(JSON.stringify({ code: 'not_found' }));
});
let web: WebServer;
before(async () => { web = await startWebServer(api); });
after(() => web.stop());

test('CA-01: a curated event names its curation date; an uncurated one does not', async () => {
  const curated = cheerio.load(await (await fetch(`${web.origin}/story/curated-story`)).text());
  assert.ok(curated('body').text().includes('编辑策展于'), 'the curation line renders');
  assert.ok(curated('body').text().includes('2026-10-24'), 'with its date');
  const plain = cheerio.load(await (await fetch(`${web.origin}/story/plain-story`)).text());
  assert.ok(!plain('body').text().includes('编辑策展于'), 'no curation line without a mark');
});

test('CA-02: a curated item names its curation date; an uncurated one does not', async () => {
  const curated = cheerio.load(await (await fetch(`${web.origin}/items/curated-item`)).text());
  assert.ok(curated('body').text().includes('编辑策展于'), 'the curation line renders on the item page');
  const plain = cheerio.load(await (await fetch(`${web.origin}/items/plain-item`)).text());
  assert.ok(!plain('body').text().includes('编辑策展于'), 'no curation line without a mark');
});

test('EO/FR-003: a quick note event forwards to its one report, reversibly', async () => {
  const res = await fetch(`${web.origin}/story/curated-note`, { redirect: 'manual' });
  assert.equal(res.status, 302, 'the thin single-source event page redirects');
  assert.equal(res.headers.get('location'), '/items/curated-note-r', 'to its only report');
  // A regular event keeps its own page.
  const kept = await fetch(`${web.origin}/story/plain-story`);
  assert.equal(kept.status, 200, 'a multi-report event does not redirect');
});
