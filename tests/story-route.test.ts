// The structured story route (EG-T17): a deterministic station-by-station walk of a public
// story's own record — every station carries evidence URLs, distinguished times and explicit
// uncertainty; a story without public evidence answers "insufficient" instead of a fabricated path.
// EG-T18: the same object is also the MCP tool's answer — site API and MCP output stay identical.
import './setup.ts';
import { tag } from './setup.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import Fastify from 'fastify';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { MCP_TOOL_NAMES as T } from '@aihot/contracts/mcp';
import { sql, closeDb } from '@aihot/backend/db';
import { publicStoryRoute } from '@aihot/backend/publication/story-route';
import { registerMcp } from '../apps/api/src/routes/mcp.ts';

const HOUR = 3600_000;
let alpha = '';
let bare = '';
let realId = '';
let mergedFrom = '';
let reportIds: string[] = [];

async function story(title: string) {
  const [row] = await sql<{ id: number; public_id: string }[]>`
    INSERT INTO stories (public_id, title) VALUES (${randomUUID()}, ${title}) RETURNING id, public_id::text`;
  return row!;
}

before(async () => {
  const p = tag();
  const src = p + '-src';
  const src2 = p + '-src2';
  const src3 = p + '-src3';
  const now = new Date();
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${src}, 'Route Wire', 'rss', 'T1', 'editorial', '2100-01-01'),
           (${src2}, 'Route Ledger', 'rss', 'T2', 'editorial', '2100-01-01'),
           (${src3}, 'Route Aggregator', 'rss', 'T2', 'isolated', '2100-01-01')`;

  const alphaStory = await story('Route Event Alpha');
  alpha = alphaStory.public_id;
  const bareStory = await story('Route Event Bare');
  bare = bareStory.public_id;
  const realStory = await story('Route Event Real');
  realId = realStory.public_id;
  const mergedStory = await story('Route Event Merged');
  mergedFrom = mergedStory.public_id;
  await sql`UPDATE stories SET merged_into = ${realStory.id} WHERE id = ${mergedStory.id}`;

  const factOf = async (storyId: number, title: string, occurredAt: Date | null, structured?: {
    subject?: string; action?: string; object?: string;
  }) => {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO facts (public_id, story_id, title, subject, action, object, occurred_at)
      VALUES (${randomUUID()}, ${storyId}, ${title}, ${structured?.subject ?? null}, ${structured?.action ?? null},
              ${structured?.object ?? null}, ${occurredAt}) RETURNING id`;
    return row!.id;
  };
  const report = async (id: string, sourceId: string, factId: number, storyId: number, at: Date, extra: {
    role?: string; withdrawn?: boolean; revision?: number;
  } = {}) => {
    // Only reports seeded public are tracked: the withdrawal test flips and restores exactly these.
    if (!extra.withdrawn) reportIds.push(id);
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at, revision)
      VALUES (${id}, ${sourceId}, ${id}, ${'https://example.org/' + id}, ${id}, ${at}, ${at}, ${extra.revision ?? 1})`;
    await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${factId}, ${id}, ${extra.role ?? 'report'})`;
    await sql`INSERT INTO publications (article_id, source_id, title, url, discovered_at, timeline_at, sort_at, visible_after,
        selected, eligible, visibility, channel, tags, body_mode, story_id, fact_id)
      VALUES (${id}, ${sourceId}, ${'Report ' + id}, ${'https://example.org/' + id}, ${at}, ${at}, ${at}, ${at},
        true, true, ${extra.withdrawn ? 'withdrawn' : 'public'}, 'news', ${['ue-route']}, 'summary', ${storyId}, ${factId})`;
  };

  // Station 1: two sources, one revised article, no occurred_at; structured fields pass through read-only.
  const fact1 = await factOf(alphaStory.id, 'Alpha opens a lab', null, {
    subject: 'Alpha Labs', action: '宣布实验室揭幕', object: '新的实验室',
  });
  await report(p + '-a1', src, fact1, alphaStory.id, new Date(+now - 3 * HOUR));
  await report(p + '-a2', src2, fact1, alphaStory.id, new Date(+now - 2 * HOUR), { revision: 2 });
  // A mention from a third source must not count as station evidence.
  await report(p + '-a3', src3, fact1, alphaStory.id, new Date(+now - 2 * HOUR), { role: 'mention' });
  // Station 2: one source, with a stated occurrence time.
  const fact2 = await factOf(alphaStory.id, 'Alpha ships a model', new Date(+now - 90 * 60_000));
  await report(p + '-a4', src2, fact2, alphaStory.id, new Date(+now - HOUR));
  // Seven reports on one fact prove the per-station report bound.
  const fact3 = await factOf(alphaStory.id, 'Alpha expands', null);
  for (let i = 0; i < 7; i++)
    await report(`${p}-a5-${i}`, src, fact3, alphaStory.id, new Date(+now - (10 - i) * 60_000));

  // Every report withdrawn: no public evidence, so no route.
  const bareFact = await factOf(bareStory.id, 'Bare claim', null);
  await report(p + '-b1', src, bareFact, bareStory.id, new Date(+now - 2 * HOUR), { withdrawn: true });

  // The merged alias reads through to the story it was merged into: the target carries the evidence.
  const mergedFact = await factOf(realStory.id, 'Merged claim', null);
  await report(p + '-m1', src, mergedFact, realStory.id, new Date(+now - 2 * HOUR));
});

after(async () => {
  await closeDb();
});

test('the route walks a public story station by station with evidence and uncertainty', { timeout: 10000 }, async () => {
  const route = await publicStoryRoute(alpha, new Date());
  assert.equal(route!.schemaVersion, 1);
  assert.equal(route!.status, 'ok');
  assert.equal(route!.story.publicId, alpha);
  // Stations walk forward from the first recording.
  assert.deepEqual(route!.stations.map((s) => s.title), ['Alpha opens a lab', 'Alpha ships a model', 'Alpha expands']);
  const [first, second, third] = route!.stations;
  // P1 passthrough (spec §3): the same read-only query carries the structured fields; null stays null.
  assert.equal(first!.subject, 'Alpha Labs');
  assert.equal(first!.action, '宣布实验室揭幕');
  assert.equal(first!.object, '新的实验室');
  assert.equal(second!.subject, null);
  assert.equal(second!.action, null);
  assert.equal(second!.object, null);
  assert.equal(first!.sourceCount, 2, 'mentions are not station evidence');
  assert.equal(first!.timeEffective, null);
  assert.equal(first!.uncertainty.occurredAtMissing, true);
  assert.equal(first!.uncertainty.singleSource, false);
  assert.deepEqual(first!.uncertainty.revised, true, 'a revision above 1 is visible uncertainty');
  assert.ok(first!.reports.every((r) => r.url.startsWith('https://example.org/')));
  assert.ok(first!.reports.every((r) => !Number.isNaN(Date.parse(r.discoveredAt))));
  assert.equal(second!.sourceCount, 1);
  assert.equal(second!.uncertainty.singleSource, true);
  assert.equal(second!.uncertainty.revised, false);
  assert.ok(second!.timeEffective && !Number.isNaN(Date.parse(second!.timeEffective)), 'a stated occurrence time is kept as timeEffective');
  assert.equal(third!.reports.length, 6, 'station evidence is bounded');
  assert.equal(route!.limits.truncated, true);
  assert.equal(route!.coverage.stations, 3);
  assert.equal(route!.coverage.reports, 2 + 1 + 6, 'coverage counts the bounded lists, not the raw rows');
  assert.equal(route!.coverage.sources, 2);
});

test('a story without public evidence answers insufficient, and merged aliases read through', { timeout: 10000 }, async () => {
  const bareRoute = await publicStoryRoute(bare, new Date());
  assert.equal(bareRoute!.status, 'insufficient');
  assert.deepEqual(bareRoute!.stations, []);
  assert.ok(bareRoute!.reason);

  const merged = await publicStoryRoute(mergedFrom, new Date());
  assert.equal(merged!.story.publicId, realId, 'a merged alias follows to its target');
  assert.equal(merged!.status, 'ok');
  assert.deepEqual(merged!.stations.map((s) => s.title), ['Merged claim']);
});

test('evidence that vanishes leaves the route instead of going stale', { timeout: 10000 }, async () => {
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ANY(${reportIds}::text[])`;
  try {
    const route = await publicStoryRoute(alpha, new Date());
    assert.equal(route!.status, 'insufficient', 'with all evidence withdrawn the route breaks off');
    assert.deepEqual(route!.stations, []);
  } finally {
    await sql`UPDATE publications SET visibility = 'public' WHERE article_id = ANY(${reportIds}::text[])`;
  }
});

test('the MCP story-route tool answers with the same object the site API serves', { timeout: 15000 }, async () => {
  const app = Fastify();
  registerMcp(app);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const client = new Client({ name: 'route-check', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${address}/api/mcp`)));
    const names = (await client.listTools()).tools.map((t) => t.name);
    assert.ok(names.includes(T.storyRoute));

    const tool = await client.callTool({ name: T.storyRoute, arguments: { public_id: alpha } });
    assert.notEqual(tool.isError, true);
    const structured = tool.structuredContent as { schemaVersion: number; status: string; stations: Array<{ title: string; uncertainty: { occurredAtMissing: boolean } }> };
    assert.equal(structured.schemaVersion, 1);
    assert.equal(structured.status, 'ok');
    assert.equal(structured.stations.length, 3, 'the MCP answer walks the same stations');
    assert.equal(structured.stations[0]!.uncertainty.occurredAtMissing, true);
    const text = (tool.content as Array<{ text: string }>)[0]!.text;
    assert.match(text, /Route Event Alpha/);
    assert.match(text, /https:\/\/example\.org\//, 'the text answer carries the evidence URLs');
    assert.match(text, /发生时间未有报道给出/, 'missing occurrence times are named in the text');
    assert.match(text, /单一来源/);
    // Identical object, not a re-shaped one: the site API and the MCP answer agree field by field
    // (only the trust meta and the generation instant may differ).
    const site = await publicStoryRoute(alpha, new Date());
    const trustKey = Object.keys(tool.structuredContent as object).find((k) => k.startsWith('_'))!;
    const { [trustKey]: _trust, generatedAt: _generatedAt, ...mcpBody } = tool.structuredContent as Record<string, unknown>;
    const { generatedAt: _siteGeneratedAt, ...siteBody } = site!;
    assert.deepEqual(mcpBody, JSON.parse(JSON.stringify(siteBody)));

    const merged = await client.callTool({ name: T.storyRoute, arguments: { public_id: mergedFrom } });
    const mergedBody = merged.structuredContent as { story: { publicId: string }; status: string };
    assert.equal(mergedBody.story.publicId, realId, 'a merged alias reads through over MCP too');

    const bareTool = await client.callTool({ name: T.storyRoute, arguments: { public_id: bare } });
    assert.notEqual(bareTool.isError, true);
    const bareBody = bareTool.structuredContent as { status: string; reason: string | null };
    assert.equal(bareBody.status, 'insufficient');
    assert.match(((bareTool.content as Array<{ text: string }>)[0]!.text), /还没有可公开引用的证据/);

    const unknown = await client.callTool({ name: T.storyRoute, arguments: { public_id: randomUUID() } });
    assert.equal((unknown.structuredContent as { error: { code: string } }).error.code, 'not_found');
  } finally {
    await client.close();
    app.server.closeAllConnections();
    await app.close();
  }
});
