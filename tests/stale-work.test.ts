import assert from "node:assert/strict";
import { after, test } from "node:test";
import { tag } from "./setup.ts";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { rerun } from "@aihot/backend/admin/content";
import { expireStaleWork, utcDayStart } from "@aihot/backend/operations/stale-work";
import { sweepUnprocessed, queueProcessing, resumeAfterRelease, requeueFailed } from "@aihot/backend/jobs/content";

const unique = tag();
const source = `freshness-${unique}`;
after(async () => { await stopBoss(); await closeDb(); });

test("UTC midnight clears yesterday unfinished queues without losing their collection identities", async () => {
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
  const pendingKey = `midnight-pending-${unique}`;
  const unknownKey = `midnight-unknown-${unique}`;
  await sql`INSERT INTO receipts (logical_key,service,purpose,subject,status) VALUES
    (${pendingKey},'test','analyze_article',${`article:${old}@1`},'pending'),
    (${unknownKey},'test','analyze_article',${`article:${oldFailed}@1`},'unknown')`;
  assert.equal(await resumeAfterRelease({ purpose: "score_article", subject: `article:${oldFailed}@1` }, sql), false);
  assert.equal((await sql`SELECT processing_state FROM articles WHERE id = ${oldFailed}`)[0]!.processing_state, "failed");
  const first = await expireStaleWork();
  assert.ok(first.deletedStaleJobs >= 1);
  assert.equal(first.clearedStaleArticles, 2);
  assert.equal(first.markedUnknownReceipts, 1);
  const preserved = await sql<{ logical_key: string; status: string }[]>`
    SELECT logical_key,status FROM receipts WHERE logical_key IN (${pendingKey},${unknownKey})`;
  assert.equal(preserved.length, 2);
  assert.ok(preserved.every(r => r.status === "unknown"),
    "pending and unknown provider outcomes must remain protected from re-billing");
  const states = await sql<{ id: string; processing_state: string; processing_retry_at: Date | null }[]>`
    SELECT id,processing_state,processing_retry_at FROM articles WHERE id IN (${old},${oldFailed},${fresh})`;
  assert.equal(states.length, 3, "identities survive so the collector does not re-import them");
  assert.equal(states.find(x => x.id === old)?.processing_state, "skipped");
  assert.equal(states.find(x => x.id === oldFailed)?.processing_state, "skipped");
  assert.equal(states.find(x => x.id === fresh)?.processing_state, "new");
  assert.equal((await sql`SELECT id FROM pgboss.job WHERE id = ${oldJob}`).length, 0);
  assert.equal((await sql`SELECT id FROM pgboss.job WHERE id = ${freshJob}`).length, 1);
  assert.equal((await sql`SELECT id FROM articles WHERE id = ${old}`).length, 1);
  const rediscovered = await upsertMaterial({
    sourceId: source, url: `https://example.org/${unique}/old`, title: "Article old",
    bodyText: "Complete article content", bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  assert.equal(rediscovered.articleId, old, "same RSS article must not become a new billable identity");
  assert.equal(rediscovered.created, false);
  const repeated = await expireStaleWork();
  assert.equal(repeated.deletedStaleJobs, 0);
  assert.equal(repeated.clearedStaleArticles, 0);
  assert.equal(await queueProcessing(old), null);
  await assert.rejects(rerun(old, "analyze", `expired-${unique}`, "test"), /不是当前 UTC 日的新闻/);
  const sweep = await sweepUnprocessed();
  assert.equal(typeof sweep.enqueued, "number");
  assert.equal((await sql`SELECT count(*)::int n FROM pgboss.job WHERE data->>'articleId' = ${old}`)[0]!.n, 0);
});

test("updating a stale unfinished article does not extend its UTC-day lifetime", async () => {
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
  // New revisions do not extend the original discovery day.
  await sql`UPDATE articles SET processing_state = 'failed' WHERE id = ${id}`;
  const resumed = await resumeAfterRelease({ purpose: "score_article", subject: `article:${id}@2` }, sql);
  assert.equal(resumed, false, "yesterday news cannot be recovered automatically");
  await expireStaleWork();
  const [after] = await sql<{ processing_state: string }[]>`
    SELECT processing_state FROM articles WHERE id = ${id}`;
  assert.equal(after?.processing_state, "skipped", "old news exits the queue without becoming new on rediscovery");
});

test("yesterday's published work is cleared without deleting the article, and today's published revision still queues", async () => {
  const make = async (name: string) => (await upsertMaterial({
    sourceId: source, url: `https://example.org/${unique}/${name}`,
    title: `Published ${name}`, bodyText: "Published source body",
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  })).articleId;
  const old = await make("published-old");
  const revised = await make("published-revised");
  await sql`
    INSERT INTO publications (article_id, title, source_id, channel, url, discovered_at, timeline_at, sort_at)
    SELECT a.id, a.title, a.source_id, 'news', a.url, a.discovered_at, a.timeline_at, a.timeline_at
    FROM articles a WHERE a.id IN (${old}, ${revised})`;
  await sql`UPDATE articles SET discovered_at = now() - interval '2 days',
    updated_at = now() - interval '2 days'
    WHERE id IN (${old}, ${revised})`;
  await sql`UPDATE articles SET updated_at = now() WHERE id = ${revised}`;

  const job = await queueProcessing(revised);
  assert.ok(job, "today's correction to yesterday's published news must be queued");
  await expireStaleWork();
  const rows = await sql<{ id: string; processing_state: string }[]>`
    SELECT id, processing_state FROM articles WHERE id IN (${old}, ${revised})`;
  assert.equal(rows.find(r => r.id === old)?.processing_state, "skipped");
  assert.equal(rows.find(r => r.id === revised)?.processing_state, "new");
  assert.equal((await sql`SELECT 1 FROM publications WHERE article_id IN (${old}, ${revised})`).length, 2);
  assert.equal((await sql`SELECT 1 FROM pgboss.job WHERE id = ${job}`).length, 1);
});

test("the explicit 'all' retry resumes more than 500 eligible news items", async () => {
  const group = "bulk all test";
  const prefix = `bulk-${unique}`;
  await sql`
    INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at,
      processing_state, processing_error, body_status)
    SELECT ${prefix} || '-' || i, ${source}, ${prefix} || '-' || i,
      'https://example.org/bulk/' || ${unique} || '/' || i,
      'Bulk retry', now(), now(), 'failed', ${group}, 'ok'
    FROM generate_series(1, 501) AS i`;
  const result = await requeueFailed(group);
  assert.equal(result.requeued, 501, "all must not silently stop at 500");
  const [state] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM articles
    WHERE identity_key LIKE ${prefix + "-%"} AND processing_state = 'new'`;
  assert.equal(state!.n, 501);
});

test("UTC day boundary is independent of local timezone", () => {
  assert.equal(utcDayStart(new Date("2026-11-05T23:59:59.999Z")).toISOString(), "2026-11-05T00:00:00.000Z");
  assert.equal(utcDayStart(new Date("2026-11-06T00:00:00.000Z")).toISOString(), "2026-11-06T00:00:00.000Z");
});
