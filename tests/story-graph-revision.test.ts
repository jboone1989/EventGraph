// The story graph asks Graphiti for episodes by "article:rRevision". When an article was revised
// but the new revision has not been ingested yet, asking for the current revision matches no
// episode and silently drops the relations the graph actually holds (EG-T09 audit: 8 such
// articles in the deployed database).
import './setup.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { graphForStory } from '@aihot/backend/knowledge/graphiti';

const requests: Array<{ articles: string[] }> = [];
let graphiti: http.Server;
let publicId = '';

before(async () => {
  graphiti = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/relations/by-articles') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        requests.push(JSON.parse(body));
        res.end(JSON.stringify({ entities: 1, edges: [], temporalSupport: 'bitemporal-v1' }));
      });
      return;
    }
    res.end(JSON.stringify({ entities: 0, edges: [] }));
  });
  await new Promise<void>((resolve) => graphiti.listen(0, '127.0.0.1', resolve));
  process.env.GRAPHITI_API_URL = `http://127.0.0.1:${(graphiti.address() as { port: number }).port}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES ('rev-gap','Revision Wire','rss','T1','editorial','2100-01-01')`;
  const [story] = await sql<{ id: number; public_id: string }[]>`INSERT INTO stories (public_id,title) VALUES (${randomUUID()},'修订前后') RETURNING id, public_id::text`;
  publicId = story!.public_id;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id,story_id,title) VALUES (${randomUUID()},${story!.id},'修订前后') RETURNING id`;
  // The article was revised; revision 1 was ingested, revision 2 never was.
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at,revision)
    VALUES ('rev-gap-article','rev-gap','rev-gap-article','https://example.org/rev-gap','修订报道','2026-10-01','2026-10-01',2)`;
  await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},'rev-gap-article','report')`;
  await sql`INSERT INTO graphiti_ingestions (article_id,revision,episode_id) VALUES ('rev-gap-article',1,'ep-rev-gap-r1')`;
});

after(async () => {
  delete process.env.GRAPHITI_API_URL;
  graphiti.close();
  await closeDb();
});

test('a story asks for the revision the graph actually holds', { timeout: 10000 }, async () => {
  await graphForStory(publicId);
  assert.deepEqual([...requests.at(-1)!.articles].sort(), ['rev-gap-article:r1']);
});
