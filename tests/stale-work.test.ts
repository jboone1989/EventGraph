import assert from "node:assert/strict";
import { after, test } from "node:test";
import { tag } from "./setup.ts";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { rerun } from "@aihot/backend/admin/content";
import { expireStaleWork, utcDayStart } from "@aihot/backend/operations/stale-work";
import { sweepUnprocessed, queueProcessing, resumeAfterRelease } from "@aihot/backend/jobs/content";

const unique = tag();
const source = `freshness-${unique}`;
after(async () => { await stopBoss(); await closeDb(); });

test("UTC midnight removes yesterday unfinished news and jobs, keeps today and published content", async () => {
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
  assert.equal(first.deletedStaleArticles, 2);
  assert.equal(first.markedUnknownReceipts, 1);
  const preserved = await sql<{ logical_key: string; status: string }[]>`
    SELECT logical_key,status FROM receipts WHERE logical_key IN (${pendingKey},${unknownKey})`;
  assert.equal(preserved.length, 2);
  assert.ok(preserved.every(r => r.status === "unknown"),
    "pending and unknown provider outcomes must remain protected from re-billing");
  const states = await sql<{ id: string; processing_state: string; processing_retry_at: Date | null }[]>`
    SELECT id,processing_state,processing_retry_at FROM articles WHERE id IN (${old},${oldFailed},${fresh})`;
  assert.equal(states.length, 1, "both unfinished old rows must be deleted");
  assert.equal(states.find(x => x.id === fresh)?.processing_state, "new");
  assert.equal((await sql`SELECT id FROM pgboss.job WHERE id = ${oldJob}`).length, 0);
  assert.equal((await sql`SELECT id FROM pgboss.job WHERE id = ${freshJob}`).length, 1);
  assert.equal((await sql`SELECT id FROM articles WHERE id = ${old}`).length, 0);
  const repeated = await expireStaleWork();
  assert.equal(repeated.deletedStaleJobs, 0);
  assert.equal(repeated.deletedStaleArticles, 0);
  assert.equal(await queueProcessing(old), null);
  assert.equal(await rerun(old, "analyze", `expired-${unique}`, "test"), null);
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
  assert.equal(after, undefined, "the unfinished old article must be deleted");
});

test("UTC day boundary is independent of local timezone", () => {
  assert.equal(utcDayStart(new Date("2026-11-05T23:59:59.999Z")).toISOString(), "2026-11-05T00:00:00.000Z");
  assert.equal(utcDayStart(new Date("2026-11-06T00:00:00.000Z")).toISOString(), "2026-11-06T00:00:00.000Z");
});
