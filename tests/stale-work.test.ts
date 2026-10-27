import assert from "node:assert/strict";
import { after, test } from "node:test";
import { tag } from "./setup.ts";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { rerun } from "@aihot/backend/admin/content";
import { expireStaleWork } from "@aihot/backend/operations/stale-work";
import { sweepUnprocessed, queueProcessing, resumeAfterRelease } from "@aihot/backend/jobs/content";

const unique = tag();
const source = `freshness-${unique}`;
after(async () => { await stopBoss(); await closeDb(); });

test("24h expiry clears stale queue/failed news but retains today's work and stored articles", async () => {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES (${source},'Freshness','rss','T1','editorial','2100-01-01')`;
  const make = async (name: string) => (await upsertMaterial({
    sourceId: source, url: `https://example.org/${unique}/${name}`, title: `Article ${name}`,
    bodyText: "Complete article content", bodyStatus: "ok", via: "fetch",
    publishedAt: new Date(),
  })).articleId;
  const old = await make("old");
  const oldFailed = await make("old-failed");
  const fresh = await make("fresh");
  const oldJob = await queueProcessing(old);
  const freshJob = await queueProcessing(fresh);
  assert.ok(oldJob && freshJob);
  await sql`UPDATE articles SET discovered_at = now() - interval '2 days', updated_at = now() - interval '2 days'
    WHERE id IN (${old}, ${oldFailed})`;
  await sql`UPDATE articles SET processing_state = 'failed', processing_attempts = 5,
    processing_retry_at = now() + interval '1 hour' WHERE id = ${oldFailed}`;
  await sql`UPDATE pgboss.job SET created_on = now() - interval '2 days'
    WHERE id = ${oldJob}`;
  assert.equal(await resumeAfterRelease({ purpose: "score_article", subject: `article:${oldFailed}@1` }, sql), false);
  assert.equal((await sql`SELECT processing_state FROM articles WHERE id = ${oldFailed}`)[0]!.processing_state, "failed");
  const first = await expireStaleWork();
  assert.ok(first.deletedStaleJobs >= 1);
  assert.equal(first.skippedStaleArticles, 2);
  const states = await sql<{ id: string; processing_state: string; processing_retry_at: Date | null }[]>`
    SELECT id,processing_state,processing_retry_at FROM articles WHERE id IN (${old},${oldFailed},${fresh})`;
  assert.deepEqual(states.filter(x => x.id !== fresh).map(x => x.processing_state).sort(), ["skipped", "skipped"]);
  assert.equal(states.find(x => x.id === fresh)?.processing_state, "new");
  assert.equal(states.find(x => x.id === oldFailed)?.processing_retry_at, null);
  assert.equal((await sql`SELECT id FROM pgboss.job WHERE id = ${oldJob}`).length, 0);
  assert.equal((await sql`SELECT id FROM pgboss.job WHERE id = ${freshJob}`).length, 1);
  assert.equal((await sql`SELECT id FROM articles WHERE id = ${old}`).length, 1);
  const repeated = await expireStaleWork();
  assert.equal(repeated.deletedStaleJobs, 0);
  assert.equal(repeated.skippedStaleArticles, 0);
  assert.equal(await queueProcessing(old), null);
  await assert.rejects(rerun(old, "analyze", `expired-${unique}`, "test"), /新闻超过 24 小时/);
  assert.equal((await sql`SELECT processing_state FROM articles WHERE id = ${old}`)[0]!.processing_state, "skipped");
  const sweep = await sweepUnprocessed();
  assert.equal(typeof sweep.enqueued, "number");
  assert.equal((await sql`SELECT count(*)::int n FROM pgboss.job WHERE data->>'articleId' = ${old}`)[0]!.n, 0);
});

test("a fresh revision of an old article retains a full processing window", async () => {
  const id = (await upsertMaterial({
    sourceId: source, url: `https://example.org/${unique}/revised`, title: "Initial title",
    bodyText: "Original complete body", bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  })).articleId;
  await sql`UPDATE articles SET discovered_at = now() - interval '2 days',
    updated_at = now() - interval '2 days' WHERE id = ${id}`;
  const revised = await upsertMaterial({
    sourceId: source, url: `https://example.org/${unique}/revised`, title: "New report correction",
    bodyText: "Updated body with material new facts", bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  assert.equal(revised.articleId, id);
  assert.equal(revised.revised, true);
  const [before] = await sql<{ discovered_at: Date; updated_at: Date; processing_state: string }[]>`
    SELECT discovered_at, updated_at, processing_state FROM articles WHERE id = ${id}`;
  assert.ok(before!.discovered_at.getTime() < Date.now() - 24 * 60 * 60 * 1000);
  assert.ok(before!.updated_at.getTime() > Date.now() - 60 * 60 * 1000);
  assert.equal(before!.processing_state, "new");
  const queued = await queueProcessing(id);
  assert.ok(queued, "a recent source revision must remain processable");
  await expireStaleWork();
  const [after] = await sql<{ processing_state: string }[]>`
    SELECT processing_state FROM articles WHERE id = ${id}`;
  assert.equal(after!.processing_state, "new");
});
