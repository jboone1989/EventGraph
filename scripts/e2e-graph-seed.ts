// Test-only, deterministic real-store graph; no extraction, embeddings or HTTP doubles.
// Prerequisites: migrated *_ci PostgreSQL and the job's fresh loopback Neo4j service.
// Source verified 2026-10-29: https://www.python.org/downloads/release/python-3130/
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";

const database = new URL(process.env.DATABASE_URL ?? "postgres://localhost/");
assert.match(database.pathname, /_ci$/, "graph seed requires a *_ci PostgreSQL database");
const articleId = "e2e-python-3130";
const url = "https://www.python.org/downloads/release/python-3130/";
const at = new Date("2024-10-07T00:00:00Z");
try {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES ('e2e-python','Python.org','rss','T1','editorial','2100-01-01') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,published_at,discovered_at,timeline_at,revision)
    VALUES (${articleId},'e2e-python',${articleId},${url},'Python 3.13.0',${at},${at},${at},1) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO publications (article_id,source_id,title,original_title,url,published_at,timeline_at,discovered_at,sort_at,body_mode,eligible,channel)
    VALUES (${articleId},'e2e-python','Python 3.13.0','Python 3.13.0',${url},${at},${at},${at},${at},'summary',true,'news')
    ON CONFLICT (article_id) DO NOTHING`;
  const [published] = await sql`SELECT article_id FROM publications WHERE article_id=${articleId} AND visibility='public'`;
  assert.ok(published, "graph evidence must be public in this CI database");
  // Fixed loopback destination and test-only credentials: cannot seed a configured production graph.
  const response = await fetch("http://127.0.0.1:7474/db/neo4j/tx/commit", {
    method: "POST", signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from("neo4j:e2e-ci-only").toString("base64")}` },
    body: JSON.stringify({ statements: [{ statement: `
      MERGE (s:Entity {uuid:'e2e-python-313',group_id:'aihot'})
      SET s.name='Python 3.13', s.created_at=datetime($at)
      MERGE (o:Entity {uuid:'e2e-python-jit',group_id:'aihot'})
      SET o.name='Experimental JIT', o.created_at=datetime($at)
      MERGE (ep:Episodic {uuid:'e2e-python-episode',group_id:'aihot'})
      SET ep.name=$episode, ep.source_description=$source, ep.created_at=datetime($at), ep.valid_at=datetime($at)
      MERGE (ep)-[:MENTIONS]->(s) MERGE (ep)-[:MENTIONS]->(o)
      MERGE (s)-[r:RELATES_TO {uuid:'e2e-python-feature',group_id:'aihot'}]->(o)
      SET r.name='HAS_EXPERIMENTAL_FEATURE', r.fact='Python 3.13 includes an experimental JIT.',
          r.episodes=['e2e-python-episode'], r.created_at=datetime($at), r.valid_at=datetime($at)
      RETURN r.uuid`, parameters: { at: at.toISOString(), episode: `aihot:${articleId}:r1`, source: `Python.org | ${url}` } }] }),
  });
  assert.ok(response.ok, `Neo4j seed HTTP ${response.status}`);
  const result = await response.json() as { errors: unknown[]; results: Array<{ data: unknown[] }> };
  assert.deepEqual(result.errors, [], "Neo4j seed transaction errors");
  assert.equal(result.results[0]?.data.length, 1, "one real relation seeded");
  console.log(`seeded Python release relation with public evidence ${articleId}`);
} finally { await closeDb(); }
