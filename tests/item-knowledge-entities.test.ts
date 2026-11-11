// A report page's "关联知识实体" block: only its own current-revision episode's direct mentions,
// behind the knowledge graph's public rules (withdrawn, unreleased and licence-limited stay silent).
import './setup.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import Fastify from 'fastify';
import { sql, closeDb } from '@aihot/backend/db';
import { itemKnowledgeEntities, normalizeEpisodeEntities } from '@aihot/backend/publication/knowledge';
import { registerKnowledge } from '../apps/api/src/routes/knowledge.ts';

// What the fake Graphiti would answer per episode ("article:rN"), or an HTTP status to fail with.
const episodes = new Map<string, Array<{ key: string; name: string }> | number>();
const requests: string[] = [];
let server: http.Server;

before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    requests.push(req.url ?? '');
    const url = new URL(req.url ?? '/', 'http://graphiti');
    const match = /^\/articles\/([^/]+)\/entities$/.exec(url.pathname);
    const revision = Number(url.searchParams.get('revision'));
    if (!match || !Number.isInteger(revision) || revision < 1) { res.statusCode = 400; return res.end('{}'); }
    const episode = episodes.get(`${decodeURIComponent(match[1]!)}:r${revision}`);
    if (typeof episode === 'number') { res.statusCode = episode; return res.end('{}'); }
    res.end(JSON.stringify({ entities: episode ?? [] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.GRAPHITI_API_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES ('ike-src','IKE','rss','T1','editorial','2100-01-01')`;
  const at = new Date(Date.now() - 3600_000);
  const insert = async (id: string, options: {
    revision?: number; visibility?: string; selected?: boolean; visibleAfter?: Date; ingested?: number[];
  } = {}) => {
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at,revision)
      VALUES (${id},'ike-src',${id},${'https://example.org/' + id},${id},${at},${at},${options.revision ?? 1})`;
    await sql`INSERT INTO publications (article_id,source_id,title,url,timeline_at,discovered_at,sort_at,body_mode,eligible,channel,visibility,selected,visible_after)
      VALUES (${id},'ike-src',${id},${'https://example.org/' + id},${at},${at},${at},'summary',true,'news',
        ${options.visibility ?? 'public'},${options.selected ?? false},${options.visibleAfter ?? at})`;
    for (const revision of options.ingested ?? [])
      await sql`INSERT INTO graphiti_ingestions (article_id,revision,episode_id) VALUES (${id},${revision},${'ep-' + id + '-r' + revision})`;
  };
  // A released selected report, its current revision ingested.
  await insert('ike-live', { revision: 2, selected: true, ingested: [2] });
  episodes.set('ike-live:r2', [
    { key: 'ent-jensen', name: '  Jensen Huang  ' },
    { key: 'ent-nvidia', name: 'nvidia' },
    { key: 'ent-nvidia-2', name: 'NVIDIA' },
    { key: 'ent-openai', name: 'OpenAI "GPT-5" <lab>' },
    { key: 'ent-huawei', name: '华为' },
    { key: 'ent-jensen', name: 'Jensen Huang' },          // duplicate key: one chip
    { key: 'ent-blank', name: '   ' },                     // no real name
    { key: 'ent-link', name: 'https://example.com/x' },    // a URL is not an entity
    { key: 'ent-site', name: 'www.example.com' },          // ditto
  ]);
  // Another report of the same story: its entities must never reach ike-live's block.
  await insert('ike-story-mate', { selected: true, ingested: [1] });
  episodes.set('ike-story-mate:r1', [{ key: 'ent-mate', name: 'Mate Entity' }]);
  // The corrected article (revision 3) has only its outdated revision 2 in the graph.
  await insert('ike-stale', { revision: 3, selected: true, ingested: [2] });
  episodes.set('ike-stale:r2', [{ key: 'ent-old', name: 'Old Revision Entity' }]);
  // Public, never ingested.
  await insert('ike-never');
  // Hidden or restricted material, all with an episode behind it.
  await insert('ike-withdrawn', { visibility: 'withdrawn', selected: true, ingested: [1] });
  episodes.set('ike-withdrawn:r1', [{ key: 'ent-withdrawn', name: 'Withdrawn Entity' }]);
  await insert('ike-held', { selected: true, visibleAfter: new Date(Date.now() + 3600_000), ingested: [1] });
  episodes.set('ike-held:r1', [{ key: 'ent-held', name: 'Held Entity' }]);
  await insert('ike-summary', { visibility: 'summary-only', selected: true, ingested: [1] });
  episodes.set('ike-summary:r1', [{ key: 'ent-summary', name: 'Summary Entity' }]);
  // Ingested, but the episode only extracted debris.
  await insert('ike-empty', { selected: true, ingested: [1] });
  episodes.set('ike-empty:r1', [{ key: 'ent-link2', name: 'http://example.com/y' }, { key: 'ent-blank2', name: '' }]);
  // Ingested with far more entities than the block shows.
  await insert('ike-many', { selected: true, ingested: [1] });
  episodes.set('ike-many:r1', Array.from({ length: 60 }, (_, i) => ({ key: `ent-many-${String(i).padStart(2, '0')}`, name: `Entity ${String(i).padStart(2, '0')}` })));
  // Ingested, but Graphiti fails for it.
  await insert('ike-fail', { selected: true, ingested: [1] });
  episodes.set('ike-fail:r1', 500);
});

after(async () => {
  delete process.env.GRAPHITI_API_URL;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await closeDb();
});

test('an episode\'s mentions keep only real names, deduped by key, in the fixed order', () => {
  const sorted = normalizeEpisodeEntities([
    { key: 'b', name: 'nvidia' }, { key: 'c', name: 'NVIDIA' }, { key: 'a', name: 'Jensen Huang' },
    { key: 'd', name: '华为' }, { key: 'e', name: 'https://x.example/z' }, { key: 'f', name: 'www.x.example' },
    { key: 'g', name: '   ' }, { key: 'h', name: '' }, { key: '', name: 'No Key' },
    { key: 'a', name: 'Jensen Huang (dup)' }, { key: 'x', name: 42 }, { key: 'y' },
  ]);
  assert.deepEqual(sorted, [
    { key: 'a', name: 'Jensen Huang' },        // code point order, case folded for English
    { key: 'b', name: 'nvidia' },              // folded equal → the stable key decides
    { key: 'c', name: 'NVIDIA' },
    { key: 'd', name: '华为' },                 // CJK after Latin, by code point
  ]);
  // Astral-plane names sort by code point, not by UTF-16 units (😀 U+1F600 > Ａ U+FF21).
  assert.deepEqual(
    normalizeEpisodeEntities([{ key: 'k1', name: '😀 Labs' }, { key: 'k2', name: 'ＡＩ' }]).map(e => e.key),
    ['k2', 'k1']);
});

test('a public report gets exactly its own current episode\'s direct mentions', async () => {
  requests.length = 0;
  const result = await itemKnowledgeEntities('ike-live');
  assert.equal(result.kind, 'found');
  if (result.kind !== 'found') return;
  assert.equal(result.value.status, 'ok');
  assert.deepEqual(result.value.entities.map(e => e.key), ['ent-jensen', 'ent-nvidia', 'ent-nvidia-2', 'ent-openai', 'ent-huawei']);
  assert.deepEqual(result.value.entities.map(e => e.name), ['Jensen Huang', 'nvidia', 'NVIDIA', 'OpenAI "GPT-5" <lab>', '华为']);
  assert.equal(result.value.totalCount, 5);
  assert.equal(result.value.truncated, false);
  // The story-mate's entity never arrives through this report's block.
  assert.ok(!result.value.entities.some(e => e.key === 'ent-mate'));
  // One read, naming the article and its current revision only.
  assert.deepEqual(requests, ['/articles/ike-live/entities?revision=2']);
  // A repeat read is served from the short-lived cache, not by Graphiti again.
  await itemKnowledgeEntities('ike-live');
  assert.deepEqual(requests, ['/articles/ike-live/entities?revision=2']);
});

test('an outdated or missing episode reads as not_ingested, without asking Graphiti', async () => {
  requests.length = 0;
  for (const id of ['ike-stale', 'ike-never']) {
    const result = await itemKnowledgeEntities(id);
    assert.equal(result.kind, 'found');
    if (result.kind !== 'found') return;
    assert.deepEqual(result.value, { status: 'not_ingested', entities: [], totalCount: 0, truncated: false }, id);
  }
  assert.deepEqual(requests, [], 'no Graphiti read for a revision that was never ingested');
});

test('missing, withdrawn, unreleased and licence-limited reports answer nothing at all', async () => {
  const app = Fastify(); registerKnowledge(app);
  try {
    for (const url of [
      '/api/site/knowledge/items/ike-none/entities',
      '/api/site/knowledge/items/ike-withdrawn/entities',
      '/api/site/knowledge/items/ike-held/entities',
      '/api/site/knowledge/items/ike-summary/entities',
      '/api/site/knowledge/items/' + 'x'.repeat(81) + '/entities',
    ]) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 404, url);
      assert.equal(response.json().error, 'not_found', url);
      assert.ok(!('entities' in response.json()), url);
    }
  } finally { await app.close(); }
});

test('the API serves settled answers as cacheable and transient states as no-store', async () => {
  const app = Fastify(); registerKnowledge(app);
  try {
    const ok = await app.inject({ method: 'GET', url: '/api/site/knowledge/items/ike-live/entities' });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.headers['cache-control'], 'public, max-age=60');
    const body = ok.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.entities.length, 5);
    assert.equal(body.totalCount, 5);

    const empty = await app.inject({ method: 'GET', url: '/api/site/knowledge/items/ike-empty/entities' });
    assert.equal(empty.statusCode, 200);
    assert.deepEqual(empty.json(), { status: 'empty', entities: [], totalCount: 0, truncated: false });
    assert.equal(empty.headers['cache-control'], 'public, max-age=60');

    const pending = await app.inject({ method: 'GET', url: '/api/site/knowledge/items/ike-never/entities' });
    assert.equal(pending.json().status, 'not_ingested');
    assert.equal(pending.headers['cache-control'], 'no-store');

    // More entities than the block shows: exactly 50, with the true count and the truncation flag.
    const many = await app.inject({ method: 'GET', url: '/api/site/knowledge/items/ike-many/entities' });
    assert.equal(many.json().status, 'ok');
    assert.equal(many.json().entities.length, 50);
    assert.equal(many.json().entities[0]!.name, 'Entity 00');
    assert.equal(many.json().totalCount, 60);
    assert.equal(many.json().truncated, true);

    // A Graphiti failure is a 200 with an explicit status, never the news page's problem, and never
    // cached as a result: the next reader asks again.
    requests.length = 0;
    for (let i = 0; i < 2; i++) {
      const failing = await app.inject({ method: 'GET', url: '/api/site/knowledge/items/ike-fail/entities' });
      assert.equal(failing.statusCode, 200);
      assert.deepEqual(failing.json(), { status: 'unavailable', entities: [], totalCount: 0, truncated: false });
      assert.equal(failing.headers['cache-control'], 'no-store');
    }
    assert.deepEqual(requests, ['/articles/ike-fail/entities?revision=1', '/articles/ike-fail/entities?revision=1']);
  } finally { await app.close(); }
});

test('without a knowledge service the answer is disabled, rendered as no block at all', async () => {
  const url = process.env.GRAPHITI_API_URL;
  delete process.env.GRAPHITI_API_URL;
  try {
    // A report with no cached read yet: the endpoint answers from its own configuration.
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at)
      VALUES ('ike-graphless','ike-src','ike-graphless','https://example.org/ike-graphless','ike-graphless',now(),now())`;
    await sql`INSERT INTO publications (article_id,source_id,title,url,timeline_at,discovered_at,sort_at,body_mode,eligible,channel,selected,visible_after)
      VALUES ('ike-graphless','ike-src','ike-graphless','https://example.org/ike-graphless',now(),now(),now(),'summary',true,'news',true,now())`;
    await sql`INSERT INTO graphiti_ingestions (article_id,revision,episode_id) VALUES ('ike-graphless',1,'ep-ike-graphless-r1')`;
    const without = await itemKnowledgeEntities('ike-graphless');
    assert.equal(without.kind, 'found');
    if (without.kind !== 'found') return;
    assert.deepEqual(without.value, { status: 'disabled', entities: [], totalCount: 0, truncated: false });
  } finally {
    process.env.GRAPHITI_API_URL = url;
  }
});
