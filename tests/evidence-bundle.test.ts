// The evidence bundle (EG-T14): one structured public object behind a story, an entity or a
// single relation — object/edge/source ids, original URLs, clocks, limits — shared by the site
// API and MCP. Withdrawn or unreleased reports can never appear in it.
import './setup.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { publicEvidenceBundle } from '@aihot/backend/publication/knowledge';
import { graphForStory, graphForEntity } from '../packages/backend/src/knowledge/graphiti.ts';

const edge = (id: string, articleIds: string[]) => ({
  id, subject: { key: 'ent-alpha', name: 'Alpha Corp', kind: 'entity' }, predicate: 'PARTNERED_WITH', object: { key: 'ent-beta', name: 'Beta Labs', kind: 'entity' },
  fact: `Alpha Corp partnered with Beta Labs (${id})`, validAt: '2026-09-01T00:00:00Z', invalidAt: null,
  evidence: articleIds.map((articleId) => ({ articleId, url: `https://example.org/${articleId}`, source: 'Bundle Wire', quote: 'q', publishedAt: null })),
});
let graphiti: http.Server;
let publicId = '';
let lastGraphRequest: { articles: string[]; as_of?: string; clock?: string } | null = null;

before(async () => {
  graphiti = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/relations/by-articles') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        lastGraphRequest = JSON.parse(body);
        const scoped = Boolean(lastGraphRequest!.as_of);
        res.end(JSON.stringify({ entities: 2, edges: scoped ? [] : [edge('e-public', ['eb-public', 'eb-withdrawn']), edge('e-hidden', ['eb-withdrawn'])], ...(scoped ? { temporalSupport: 'bitemporal-v1' } : {}) }));
      });
      return;
    }
    if (req.url === '/entities/ent-alpha') return res.end(JSON.stringify({ entity: { key: 'ent-alpha', name: 'Alpha Corp', kind: 'entity' }, edges: [edge('e-entity', ['eb-public'])] }));
    if (req.url?.startsWith('/entities/ent-scoped')) {
      const scoped = new URL(req.url, 'http://fake').searchParams.has('as_of');
      return res.end(JSON.stringify({ entity: { key: 'ent-scoped', name: 'Scoped Corp', kind: 'entity', summary: 'Future-only private detail' }, edges: [edge('e-entity', ['eb-public'])], ...(scoped ? { temporalSupport: 'bitemporal-v1' } : {}) }));
    }
    if (req.url === '/relations/e-public') return res.end(JSON.stringify({ entities: 2, edges: [edge('e-public', ['eb-public'])] }));
    res.end(JSON.stringify({ entity: null, edges: [] }));
  });
  await new Promise<void>((resolve) => graphiti.listen(0, '127.0.0.1', resolve));
  process.env.GRAPHITI_API_URL = `http://127.0.0.1:${(graphiti.address() as { port: number }).port}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES ('eb-src','Bundle Wire','rss','T1','editorial','2100-01-01')`;
  const [story] = await sql<{ id: number; public_id: string }[]>`INSERT INTO stories (public_id,title) VALUES (${randomUUID()},'Alpha 与 Beta 合作') RETURNING id, public_id::text`;
  publicId = story!.public_id;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id,story_id,title) VALUES (${randomUUID()},${story!.id},'Alpha 与 Beta 合作') RETURNING id`;
  for (const id of ['eb-public', 'eb-withdrawn']) {
    const at = new Date(Date.now() - 3600_000);
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at,revision) VALUES (${id},'eb-src',${id},${'https://example.org/' + id},${id},${at},${at},3)`;
    await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${id},'report')`;
    await sql`INSERT INTO publications (article_id,source_id,title,url,timeline_at,discovered_at,sort_at,body_mode,eligible,channel,story_id,fact_id)
      VALUES (${id},'eb-src',${'Alpha partners with Beta ' + id},${'https://example.org/' + id},${at},${at},${at},'summary',true,'news',${story!.id},${fact!.id})`;
  }
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = 'eb-withdrawn'`;
});

after(async () => {
  delete process.env.GRAPHITI_API_URL;
  graphiti.close();
  await closeDb();
});

test('a story bundle keeps only publicly evidenced relations and declares its limits', { timeout: 10000 }, async () => {
  const bundle = await publicEvidenceBundle({ kind: 'story', publicId });
  assert.equal(bundle.schemaVersion, 1);
  assert.deepEqual(bundle.object, { kind: 'story', id: publicId });
  assert.deepEqual(bundle.relations.map((r) => r.id), ['e-public'], 'a relation backed only by a withdrawn report is left out');
  assert.deepEqual(bundle.relations[0]!.evidence.map((e) => e.articleId), ['eb-public']);
  assert.equal(bundle.relations[0]!.evidence[0]!.url, 'https://example.org/eb-public');
  assert.equal(bundle.relations[0]!.evidence[0]!.revision, 3, 'each citation carries the article revision the graph ingested against');
  assert.equal(bundle.fidelity, null);
  assert.equal(bundle.temporalSupport, null);
  assert.equal(bundle.limits.edgeLimit, 60);
  assert.equal(bundle.coverage.relations, 1);
  assert.match(bundle.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('a time-scoped bundle declares bounded fidelity and the bitemporal contract', { timeout: 10000 }, async () => {
  const bundle = await publicEvidenceBundle({ kind: 'story', publicId }, new Date(),
    { asOf: new Date('2026-10-01T00:00:00Z'), clock: 'known' });
  assert.equal(bundle.fidelity, 'bounded');
  assert.equal(bundle.temporalSupport, 'bitemporal-v1');
  assert.equal(bundle.clock, 'known');
  assert.equal(bundle.asOf, '2026-10-01T00:00:00.000Z');
  assert.deepEqual(bundle.relations, [], 'an empty historical read stays empty instead of falling back to today');
});

test('entity and relation bundles come from the same public evidence layer', { timeout: 10000 }, async () => {
  const entity = await publicEvidenceBundle({ kind: 'entity', key: 'ent-alpha' });
  assert.deepEqual(entity.object, { kind: 'entity', id: 'ent-alpha' });
  assert.deepEqual(entity.relations.map((r) => r.id), ['e-entity']);
  assert.equal(entity.limits.edgeLimit, null, 'the entity profile has no server-side edge limit');
  const relation = await publicEvidenceBundle({ kind: 'relation', key: 'e-public' });
  assert.deepEqual(relation.object, { kind: 'relation', id: 'e-public' });
  assert.deepEqual(relation.relations.map((r) => r.id), ['e-public']);
});

test('unavailable and unknown objects answer with a status, never a substitute', { timeout: 10000 }, async () => {
  const missing = await publicEvidenceBundle({ kind: 'story', publicId: randomUUID() });
  assert.equal(missing.status, 'empty');
  assert.deepEqual(missing.relations, []);
  const unknownEntity = await publicEvidenceBundle({ kind: 'entity', key: 'ent-unknown' });
  assert.equal(unknownEntity.status, 'ok');
  assert.deepEqual(unknownEntity.relations, []);
});

test('a scoped entity bundle fails closed when the service does not acknowledge the time contract', { timeout: 10000 }, async () => {
  // ent-alpha's service ignores the as_of query (no temporalSupport receipt): a current
  // snapshot must never pass as a bounded historical read.
  const bundle = await publicEvidenceBundle({ kind: 'entity', key: 'ent-alpha' }, new Date(),
    { asOf: new Date('2026-10-01T00:00:00Z'), clock: 'known' });
  assert.equal(bundle.status, 'unavailable');
  assert.deepEqual(bundle.relations, []);
});

test('a scoped entity bundle is bounded when the service acknowledges the contract', { timeout: 10000 }, async () => {
  const bundle = await publicEvidenceBundle({ kind: 'entity', key: 'ent-scoped' }, new Date(),
    { asOf: new Date(), clock: 'valid' });
  assert.equal(bundle.status, 'ok');
  assert.equal(bundle.fidelity, 'bounded');
  assert.equal(bundle.temporalSupport, 'bitemporal-v1');
  assert.deepEqual(bundle.relations.map((r) => r.id), ['e-entity']);
});

test('a scoped relation bundle fails closed; the single-relation endpoint cannot bound a read', { timeout: 10000 }, async () => {
  const bundle = await publicEvidenceBundle({ kind: 'relation', key: 'e-public' }, new Date(),
    { asOf: new Date('2026-10-01T00:00:00Z'), clock: 'known' });
  assert.equal(bundle.status, 'unavailable');
  assert.deepEqual(bundle.relations, [], "today's snapshot must not pass as a bounded historical read");
});

test('known-time graph chooses ingested revision as of selected time, not current revision', async () => {
  const [article] = await sql<{discovered_at: Date}[]>`
    SELECT discovered_at FROM articles WHERE id = 'eb-public'`;
  const first = new Date(article!.discovered_at.getTime() + 1000);
  const second = new Date(first.getTime() + 5000);
  const asOf = new Date(first.getTime() + 1000);
  await sql`
    INSERT INTO graphiti_ingestions(article_id,revision,episode_id,ingested_at)
    VALUES ('eb-public',1,${randomUUID()},${first}),
           ('eb-public',3,${randomUUID()},${second})`;
  await graphForStory(publicId, {asOf, clock: 'known'});
  assert.ok(lastGraphRequest?.articles.includes('eb-public:r1'), 'previously ingested revision remains available');
  assert.ok(!lastGraphRequest?.articles.includes('eb-public:r3'), 'later revision must not appear early');
  await graphForStory(publicId, {asOf: new Date(second.getTime() + 1000), clock: 'known'});
  assert.ok(lastGraphRequest?.articles.includes('eb-public:r3'), 'later revision appears after ingestion');
});

test('historical entity graph never shows the current Graphiti summary even with temporal receipt', async () => {
  const scoped = await graphForEntity('ent-scoped', {asOf: new Date('2026-10-01T00:00:00Z'), clock: 'known'});
  assert.equal(scoped.status, undefined);
  assert.equal(scoped.entity?.summary, null);
  const current = await graphForEntity('ent-scoped');
  assert.equal(current.entity?.summary, 'Future-only private detail');
});
