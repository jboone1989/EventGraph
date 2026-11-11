// Entity pages through the knowledge graph: Graphiti labels can be raw source URLs, and entities can
// lack public relations. Every page stays readable in both languages and, since the public noindex
// removal (specs/remove-public-noindex-20261111), carries no indexing directive; outages stay 503.
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
  // Actual Graphiti entity API contract: unavailable and missing entities both answer HTTP 200.
  if (key === 'unavailable' || key === 'disabled')
    return res.end(JSON.stringify({ entity: null, entities: 0, edges: [], status: key }));
  const name = names[key];
  if (!name)
    return res.end(JSON.stringify({ entity: null, entities: 0, edges: [], status: 'ok' }));
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

test('raw URL entity names remain readable with no indexing directive (zh/en)', async () => {
  for (const route of ['/knowledge/entity/url', '/en/knowledge/entity/url']) {
    const $ = await tags(route);
    assert.match($('h1').first().text(), /bls\.gov/);
    assert.equal($('meta[name="robots"]').length, 0);
  }
});

test('named entities with sourced relations keep their canonical pair in both languages', async () => {
  for (const route of ['/knowledge/entity/named', '/en/knowledge/entity/named']) {
    const $ = await tags(route);
    assert.equal($('meta[name="robots"]').length, 0);
    assert.match($('link[rel="canonical"]').attr('href') ?? '', /knowledge\/entity\/named/);
  }
});

test('entities without public relations still answer without an indexing directive', async () => {
  const $ = await tags('/knowledge/entity/empty');
  assert.equal($('meta[name="robots"]').length, 0);
});

// Graphiti's real contract returns HTTP 200 even when its JSON status says unavailable/disabled.
test('Graphiti outages return 503 rather than a cached empty entity page', async () => {
  for (const route of [
    '/knowledge/entity/unavailable', '/en/knowledge/entity/unavailable',
    '/knowledge/entity/disabled', '/en/knowledge/entity/disabled',
  ]) {
    const response = await fetch(web.origin + route);
    assert.equal(response.status, 503);
  }
});

test('missing entities remain a readable page without an indexing directive under the current API contract', async () => {
  const response = await fetch(web.origin + '/knowledge/entity/absent');
  assert.equal(response.status, 200);
  const $ = cheerio.load(await response.text());
  assert.equal($('meta[name="robots"]').length, 0);
});
