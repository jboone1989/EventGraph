// Search-discovery guard for Graphiti entities whose extracted label is a source URL.
// Keep entity pages accessible for exploration; do not promote raw links as indexable entities.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import * as cheerio from 'cheerio';
import { startWebServer, type WebServer } from './web-server.ts';

const names: Record<string, string> = {
  url: 'https://www.bls.gov/news.release/archives/cpi_10142026.htm',
  named: 'Consumer Price Index',
  empty: 'Unlinked entity',
};
const api = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const path = (req.url ?? '').split('?')[0]!;
  if (path === '/api/site/meta') return res.end(JSON.stringify({ changelogVersion: null }));
  const matched = /^\/api\/site\/knowledge\/entities\/([^/]+)$/.exec(path);
  if (!matched) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ code: 'not_found' }));
  }
  const key = matched[1]!;
  const name = names[key];
  if (!name) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ code: 'not_found' }));
  }
  const node = { key, name, kind: 'concept' };
  const other = { key: 'other', name: 'United States', kind: 'location' };
  const edges = key === 'empty' ? [] : [{
    id: 'edge-1', subject: node, object: other, predicate: 'RELATED_TO',
    fact: 'Documented by a source', validAt: null, invalidAt: null, evidence: [],
  }];
  return res.end(JSON.stringify({
    entity: node, entities: 2, edges, status: 'ok', reports: [], stories: [],
  }));
});

let web: WebServer;
before(async () => { web = await startWebServer(api); });
after(async () => { if (web) await web.stop(); });

async function tags(route: string) {
  const response = await fetch(web.origin + route);
  assert.equal(response.status, 200);
  return cheerio.load(await response.text());
}

test('raw URL entity names remain readable but do not appear in search (zh/en)', async () => {
  for (const route of ['/knowledge/entity/url', '/en/knowledge/entity/url']) {
    const $ = await tags(route);
    assert.match($('h1').first().text(), /bls\.gov/);
    assert.match($('meta[name="robots"]').attr('content') ?? '', /noindex/);
  }
});

test('named entities with sourced relations remain indexable in both languages', async () => {
  for (const route of ['/knowledge/entity/named', '/en/knowledge/entity/named']) {
    const $ = await tags(route);
    assert.equal($('meta[name="robots"]').length, 0);
    assert.match($('link[rel="canonical"]').attr('href') ?? '', /knowledge\/entity\/named/);
  }
});

test('entities without public relations still stay noindex', async () => {
  const $ = await tags('/knowledge/entity/empty');
  assert.match($('meta[name="robots"]').attr('content') ?? '', /noindex/);
});
