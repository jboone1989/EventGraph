// The MCP graph tools: a story's relations and an entity's profile, each relation keeping only evidence
// that is public now; keys come from answers, never guesses.
import './setup.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import Fastify from 'fastify';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { MCP_TOOL_NAMES as T } from '@aihot/contracts/mcp';
import { sql, closeDb } from '@aihot/backend/db';
import { registerMcp } from '../apps/api/src/routes/mcp.ts';

const edge = (id: string, articleIds: string[]) => ({
  id, subject: { key: 'ent-alpha', name: 'Alpha Corp', kind: 'entity' }, predicate: 'PARTNERED_WITH', object: { key: 'ent-beta', name: 'Beta Labs', kind: 'entity' },
  fact: `Alpha Corp partnered with Beta Labs (${id})`, validAt: '2026-09-01T00:00:00Z', invalidAt: null,
  evidence: articleIds.map((articleId) => ({ articleId, url: '', source: 'MCP Wire', quote: 'q', publishedAt: null })),
});
let graphiti: http.Server;
let publicId = '';

before(async () => {
  graphiti = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/relations/by-articles') return res.end(JSON.stringify({ entities: 2, edges: [edge('e-public', ['mg-public', 'mg-withdrawn']), edge('e-hidden', ['mg-withdrawn'])] }));
    if (req.url === '/entities/ent-alpha') return res.end(JSON.stringify({ entity: { key: 'ent-alpha', name: 'Alpha Corp', kind: 'entity', summary: 'A test company.' }, edges: [edge('e-public', ['mg-public'])] }));
    res.end(JSON.stringify({ entity: null, edges: [] }));
  });
  await new Promise<void>((resolve) => graphiti.listen(0, '127.0.0.1', resolve));
  process.env.GRAPHITI_API_URL = `http://127.0.0.1:${(graphiti.address() as { port: number }).port}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES ('mcp-graph','MCP Wire','rss','T1','editorial','2100-01-01')`;
  const [story] = await sql<{ id: number; public_id: string }[]>`INSERT INTO stories (public_id,title) VALUES (${randomUUID()},'Alpha 与 Beta 合作') RETURNING id, public_id::text`;
  publicId = story!.public_id;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id,story_id,title) VALUES (${randomUUID()},${story!.id},'Alpha 与 Beta 合作') RETURNING id`;
  for (const id of ['mg-public', 'mg-withdrawn']) {
    const at = new Date(Date.now() - 3600_000);
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at,revision) VALUES (${id},'mcp-graph',${id},${'https://example.org/' + id},${id},${at},${at},1)`;
    await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${id},'report')`;
    await sql`INSERT INTO publications (article_id,source_id,title,url,timeline_at,discovered_at,sort_at,body_mode,eligible,channel,story_id,fact_id)
      VALUES (${id},'mcp-graph',${'Alpha partners with Beta ' + id},${'https://example.org/' + id},${at},${at},${at},'summary',true,'news',${story!.id},${fact!.id})`;
  }
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = 'mg-withdrawn'`;
});

after(async () => {
  delete process.env.GRAPHITI_API_URL;
  graphiti.close();
  await closeDb();
});

test('story graph and entity tools answer with publicly evidenced relations only', { timeout: 10000 }, async () => {
  const app = Fastify();
  registerMcp(app);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const client = new Client({ name: 'graph-check', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${address}/api/mcp`)));
    const names = (await client.listTools()).tools.map((t) => t.name);
    assert.ok(names.includes(T.storyGraph) && names.includes(T.entity));

    const graph = await client.callTool({ name: T.storyGraph, arguments: { public_id: publicId } });
    assert.notEqual(graph.isError, true);
    const relations = (graph.structuredContent as { relations: Array<{ id: string; evidence: Array<{ articleId: string }> }> }).relations;
    assert.deepEqual(relations.map((r) => r.id), ['e-public'], 'a relation backed only by a withdrawn report is left out');
    assert.deepEqual(relations[0]!.evidence.map((e) => e.articleId), ['mg-public']);
    assert.match((graph.content as Array<{ text: string }>)[0]!.text, /key=ent-alpha/);

    const entity = await client.callTool({ name: T.entity, arguments: { key: 'ent-alpha' } });
    assert.notEqual(entity.isError, true);
    const text = (entity.content as Array<{ text: string }>)[0]!.text;
    assert.match(text, /Alpha Corp/);
    assert.match(text, new RegExp(`public_id=${publicId}`));

    const missing = await client.callTool({ name: T.entity, arguments: { key: 'ent-unknown' } });
    assert.equal((missing.structuredContent as { error: { code: string } }).error.code, 'not_found');
    const noStory = await client.callTool({ name: T.storyGraph, arguments: { public_id: randomUUID() } });
    assert.equal((noStory.structuredContent as { error: { code: string } }).error.code, 'not_found');

    const bundle = await client.callTool({ name: T.evidenceBundle, arguments: { story: publicId } });
    assert.notEqual(bundle.isError, true);
    const structured = bundle.structuredContent as { schemaVersion: number; object: { kind: string; id: string }; relations: Array<{ evidence: Array<{ revision: number | null }> }> };
    assert.equal(structured.schemaVersion, 1);
    assert.deepEqual(structured.object, { kind: 'story', id: publicId });
    assert.equal(structured.relations[0]!.evidence[0]!.revision, 1);
    const scoped = await client.callTool({ name: T.evidenceBundle, arguments: { story: publicId, clock: 'valid', as_of: '2026-09-15T00:00:00Z' } });
    const scopedBody = scoped.structuredContent as { fidelity: string; temporalSupport: string | null; asOf: string };
    assert.equal(scopedBody.fidelity, 'bounded');
    assert.equal(scopedBody.temporalSupport, 'bitemporal-v1');
    const both = await client.callTool({ name: T.evidenceBundle, arguments: { story: publicId, entity: 'ent-alpha' } });
    assert.equal((both.structuredContent as { error: { code: string } }).error.code, 'invalid_request');
  } finally {
    await client.close();
    app.server.closeAllConnections();
    await app.close();
  }
});
