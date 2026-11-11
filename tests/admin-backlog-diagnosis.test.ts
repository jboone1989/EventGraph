// Backlog diagnosis must be derived from current unresolved articles, not task history.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { allFlowItemsOverview, backlogCausesOverview } from "@aihot/backend/admin/runs";
import { utcDayStart } from "@aihot/backend/operations/stale-work";

after(async () => { await stopBoss(); await closeDb(); });

test("diagnosis explains model retry and unverified receipts without double-counting articles", async () => {
  await getBoss();
  const before = await backlogCausesOverview();
  const prefix = `diagnosis-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES (${prefix}, 'Diagnosis', 'rss', 'T1', 'editorial', '2100-01-01')`;
  const today = new Date();
  const cases = [
    { key: "retry", state: "new", error: "Provider HTTP 429 rate limit", future: true },
    { key: "failed", state: "failed", error: "Model output invalid", future: false },
    { key: "receipt", state: "failed", error: "receipt outcome unknown", future: false },
    { key: "backfill", state: "failed", error: "unrelated historical failure", future: false },
  ] as const;
  for (const c of cases) {
    const id = `${prefix}-${c.key}`;
    await sql`INSERT INTO articles
      (id,source_id,identity_key,url,title,discovered_at,timeline_at,updated_at,backfill,processing_state,processing_error,processing_retry_at)
      VALUES (${id},${prefix},${id},${"https://example.org/" + id},${c.key},
      ${today},${today},${today},${c.key === "backfill"},${c.state},${c.error},
      ${c.future ? new Date(today.getTime() + 30 * 60000) : null})`;
  }
  await sql`INSERT INTO receipts (logical_key,service,purpose,subject,status)
    VALUES (${prefix + "-receipt"},'test','analyze_article',${"article:" + prefix + "-receipt@1"},'unknown')`;

  const causes = await backlogCausesOverview();
  for (const kind of [
    "provider_retry",
    "article_failed",
    "receipt_unknown",
  ] as const) {
    const cause = causes.find(c => c.kind === kind);
    const previous = before.find(c => c.kind === kind)?.count ?? 0;
    assert.ok(cause, `should identify ${kind}`);
    assert.equal(cause.count - previous, 1, `only one new article in ${kind}`);
  }
  assert.ok(!causes.some(c => c.exampleArticleId === `${prefix}-backfill`), "backfill is not current news");
  assert.equal(utcDayStart(today).getTime() <= today.getTime(), true);
});

test("full operations table includes failing model calls with exact provider, model and purpose", async () => {
  await getBoss(); // ensures the existing pg-boss job and schedule tables are present
  const key = "flow-model-" + tag();
  const [receipt] = await sql<{ id: number }[]>`
    INSERT INTO receipts (logical_key,service,model,purpose,subject,status,error)
    VALUES (${key}, 'Groq', 'test-model-70b', 'group_article', ${"story:" + key}, 'failed', 'Provider HTTP 429')
    RETURNING id`;
  try {
    const items = await allFlowItemsOverview([]);
    const row = items.find(item => item.key === "model:" + receipt!.id);
    assert.ok(row, "the unresolved model call must be visible");
    assert.equal(row.kind, "model");
    assert.equal(row.status, "failed");
    assert.equal(row.provider, "Groq");
    assert.equal(row.model, "test-model-70b");
    assert.equal(row.process, "group_article");
    assert.match(row.error ?? "", /429/);
  } finally {
    await sql`DELETE FROM receipts WHERE id = ${receipt!.id}`;
  }
});


test("UTC failure queue excludes yesterday and counts terminal unknown receipts as failed", async () => {
  await getBoss();
  const key = "flow-utc-" + tag();
  const yesterday = new Date(utcDayStart().getTime() - 60_000);
  const [oldFailure, unknown, currentFailure] = await sql<{ id: number }[]>`
    INSERT INTO receipts (logical_key,service,model,purpose,subject,status,error,created_at,updated_at)
    VALUES
      (${key + "-old"}, 'Groq', 'test-model', 'analyze_article', ${key + "-old"}, 'failed', 'yesterday', ${yesterday}, ${yesterday}),
      (${key + "-unknown"}, 'Groq', 'test-model', 'analyze_article', ${key + "-unknown"}, 'unknown', 'unverified', now(), now()),
      (${key + "-today"}, 'Groq', 'test-model', 'analyze_article', ${key + "-today"}, 'failed', 'today', ${yesterday}, now())
    RETURNING id`;
  try {
    const items = await allFlowItemsOverview([]);
    assert.equal(items.some(item => item.key === "model:" + oldFailure!.id), false);
    assert.equal(items.find(item => item.key === "model:" + unknown!.id)?.status, "failed");
    assert.equal(items.find(item => item.key === "model:" + currentFailure!.id)?.status, "failed");
  } finally {
    await sql`DELETE FROM receipts WHERE id IN (${oldFailure!.id}, ${unknown!.id}, ${currentFailure!.id})`;
  }
});
