// The content-assets layer (specs/003-content-assets): the daily's editor note, the topic briefs, the
// knowledge page's graph-changes text, and the phone entry to the research section.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import * as cheerio from 'cheerio';
import { startWebServer, type WebServer } from './web-server.ts';
import { TOPIC_BRIEFS } from '@aihot/site/topic-briefs';

const at = '2026-10-24T08:00:00.000Z';
const item = { id: 'asset-item', title: '可核实的测试报道', summary: '报道摘要', reason: null, source: { name: 'Fixture' }, links: { original: 'https://example.org/report' }, publishedAt: at, timelineAt: at, category: 'research', tags: [], score: 80, selected: true, channel: 'news', x: null };
const report = {
  kind: 'daily', key: '2026-10-24', issueNumber: 1, title: '测试日报', generatedAt: at,
  lead: { title: '今日要闻', leadParagraph: '今天的导读。' }, leadItemId: item.id, overview: null, overviewEn: null,
  // The note rides with the report answer now (specs/004-editorial-ops FR-001), written in the admin.
  editorNote: { note: '今天起，日报最前面多了一小块编辑手记，由人写。', noteEn: 'A short editor-written note opens the daily from today on.' },
  highlights: [], sections: [], flashes: [], tail: [], cover: null, metrics: {}, readingMinutes: 1, prev: null, next: null,
};
let graphState: 'ok' | 'empty' | 'unavailable' = 'ok';
const changes = {
  key: '2026-10-24', windowStart: '2026-10-23T00:00:00.000Z', windowEnd: '2026-10-24T00:00:00.000Z', status: 'ok',
  added: { count: 1, edges: [{ id: 'e1', subject: { key: 'a', name: 'Entity A' }, predicate: 'PROVIDES', object: { key: 'b', name: 'Entity B' }, fact: 'A provides B.' }] },
  ended: { count: 0, edges: [] }, newEntities: { count: 1, items: [{ key: 'c', name: 'Entity C' }] },
};
const topic = (slug: string, name: string) => ({
  topic: { slug, name, group: 'field', groupName: '领域', definition: '测试主题', brand: null, total: 1, recent: 1, indexable: true, poolTotal: 1, latest: null },
  modules: {}, items: [item], page: 1, pageCount: 1, pageSize: 30,
});

let web: WebServer;
const api = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = (req.url ?? '').split('?')[0]!;
  if (url === '/api/health') return res.end(JSON.stringify({ ok: true }));
  if (url === '/api/site/track') { res.statusCode = 204; return res.end(); }
  if (url === '/api/site/meta') return res.end(JSON.stringify({ changelogVersion: '2026-01-01T00:00' }));
  if (url === '/api/site/changelog') return res.end(JSON.stringify({ releases: [], latestVersion: '2026-01-01T00:00' }));
  if (url === '/api/site/reports/daily/latest-page') return res.end(JSON.stringify({ index: [], report }));
  if (url === '/api/site/reports/daily/navigation/2026-10-24') return res.end(JSON.stringify({ items: [] }));
  const daily = /^\/api\/site\/reports\/daily\/(\d{4}-\d{2}-\d{2})$/.exec(url);
  // Only the seeded day carries a note; other days answer without one (FR-001's absent case).
  if (daily) return res.end(JSON.stringify({ ...report, key: daily[1], editorNote: daily[1] === '2026-10-24' ? report.editorNote : null }));
  if (url === '/api/site/knowledge/daily/2026-10-24') return res.end(JSON.stringify(graphState === 'ok' ? changes : { ...changes, status: graphState === 'empty' ? 'ok' : 'unavailable', added: {count: 0, edges: []}, ended: {count: 0, edges: []}, newEntities: {count: 0, items: []} }));
  if (url === '/api/site/knowledge/stats') return res.end(JSON.stringify({ episodes: 1, entities: 1, relations: 1, status: 'ok' }));
  const topicRoute = /^\/api\/site\/topics\/([a-z0-9-]+)$/.exec(url);
  if (topicRoute) return res.end(JSON.stringify(topic(topicRoute[1]!, topicRoute[1]!)));
  res.statusCode = 404;
  res.end(JSON.stringify({ code: 'not_found' }));
});
before(async () => { web = await startWebServer(api); });
after(() => web.stop());

test("the daily shows the editor's note only where one is written", async () => {
  const withNote = cheerio.load(await (await fetch(`${web.origin}/daily/2026-10-24`)).text());
  assert.ok(withNote('body').text().includes('编辑手记'), 'the note block renders');
  assert.ok(withNote('body').text().includes('今天起，日报最前面多了一小块'), 'the note itself renders');
  const noNote = cheerio.load(await (await fetch(`${web.origin}/daily/2026-10-22`)).text());
  assert.ok(!noNote('body').text().includes('编辑手记'), 'a day without a note shows no placeholder');
});

test("a daily's page cache stays within the api's freshness so a saved note lands soon", async () => {
  const res = await fetch(`${web.origin}/daily/2026-10-24`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 0);
  assert.ok(maxAge > 0 && maxAge <= 120, `daily page max-age ${maxAge}s is bounded by the api's 120s`);
});

test('every configured topic carries a brief; an unconfigured one does not', async () => {
  // The six topics the spec names all render the brief; bitcoin has none configured (spec CA-05).
  for (const slug of Object.keys(TOPIC_BRIEFS)) {
    const page = cheerio.load(await (await fetch(`${web.origin}/topics/${slug}`)).text());
    assert.ok(page('body').text().includes('本主题跟踪什么'), `${slug} shows its brief`);
  }
  const plain = cheerio.load(await (await fetch(`${web.origin}/topics/bitcoin`)).text());
  assert.ok(!plain('body').text().includes('本主题跟踪什么'), 'no brief for an unconfigured topic');
});

test("the knowledge page carries the latest graph changes as text", async () => {
  const $ = cheerio.load(await (await fetch(`${web.origin}/knowledge`)).text());
  const text = $('body').text();
  assert.ok(text.includes('图谱今日变化'), 'the changes block renders');
  assert.ok(text.includes('Entity A'), 'relation subjects render');
  assert.ok($('a[href="/daily/2026-10-24"]').length > 0, 'it links the issue it came from');
});

test('the knowledge page hides change links on empty or unavailable windows', async () => {
  for (const state of ['empty', 'unavailable'] as const) {
    graphState = state;
    try {
      const $ = cheerio.load(await (await fetch(`${web.origin}/knowledge`)).text());
      assert.equal($('a[href="/daily/2026-10-24"]').length, 0, `${state}: no isolated issue link`);
      assert.ok(!$('body').text().includes('这一期的时间窗口由日报收刊时间决定'), `${state}: no empty graph section`);
    } finally { graphState = 'ok'; }
  }
});

test('English knowledge page links to the English daily edition', async () => {
  const $ = cheerio.load(await (await fetch(`${web.origin}/en/knowledge`)).text());
  assert.ok($('a[href="/en/daily/2026-10-24"]').length > 0);
});

test('the phone 我的 page links the research section', async () => {
  const $ = cheerio.load(await (await fetch(`${web.origin}/more`)).text());
  assert.ok($('a[href="/research"]').length > 0, 'a research entry exists on /more');
});
