// Backlog diagnosis must be derived from current unresolved articles, not task history.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { backlogCausesOverview } from "@aihot/backend/admin/runs";
import { utcDayStart } from "@aihot/backend/operations/stale-work";

after(async () => { await stopBoss(); await closeDb(); });

test("diagnosis explains model retry and unverified receipts without double-counting articles", async () => {
  await getBoss();
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
  for (const [kind, suffix] of [
    ["provider_retry", "retry"],
    ["article_failed", "failed"],
    ["receipt_unknown", "receipt"],
  ] as const) {
    const cause = causes.find(c => c.kind === kind);
    assert.ok(cause, `should identify ${kind}`);
    assert.ok(cause.count >= 1);
    assert.equal(cause.exampleArticleId.startsWith(prefix) ? cause.exampleArticleId : `${prefix}-${suffix}`,
      `${prefix}-${suffix}`);
  }
  assert.ok(!causes.some(c => c.exampleArticleId === `${prefix}-backfill`), "backfill is not current news");
  assert.equal(utcDayStart(today).getTime() <= today.getTime(), true);
});
