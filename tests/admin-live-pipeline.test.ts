// Focus on newly discovered editorial news, not import history.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { livePipelineOverview, legacyUnresolvedOverview, currentNewsQueueOverview } from "@aihot/backend/admin/runs";
import { navCounts } from "@aihot/backend/admin/navigation";

after(async () => { await stopBoss(); await closeDb(); });

test("live dashboard excludes old and backfilled articles", async () => {
  const before = await livePipelineOverview();
  const navBefore = await navCounts();
  const oldBefore = await legacyUnresolvedOverview();
  await getBoss(); // Standalone test database has no pg-boss tables until startup.
  const currentBefore = await currentNewsQueueOverview();
  const source = `live-dashboard-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
            VALUES (${source},'Live dashboard','rss','T1','editorial','2100-01-01')`;
  for (const [suffix, age, backfill, state, group] of [
    ["waiting", "20 minutes", false, "new", "pending"],
    ["done", "1 minute", false, "analyzed", "complete"],
    ["filtered", "2 minutes", false, "blocked", "pending"],
    ["failed", "4 minutes", false, "failed", "pending"],
    ["backfill", "3 minutes", true, "failed", "pending"],
    ["historic", "30 hours", false, "failed", "pending"],
    ["historic-waiting", "30 hours", false, "new", "pending"],
  ] as const) {
    const id = `${source}-${suffix}`;
    await sql`INSERT INTO articles
      (id,source_id,identity_key,url,title,discovered_at,timeline_at,updated_at,
       backfill,processing_state,grouping_status,grouped_at)
      VALUES (${id},${source},${id},${"https://example.org/" + id},${suffix},
        now() - ${age}::interval,now() - ${age}::interval,now() - ${age}::interval,
        ${backfill},${state},${group},${group === "complete" ? new Date() : null})`;
  }
  // The current-day queue must be deterministic even when tests run just after 00:00 UTC.
  const startOfUtcDay = sql`date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
  await sql`UPDATE articles
    SET discovered_at = greatest(discovered_at, ${startOfUtcDay}),
        timeline_at = greatest(timeline_at, ${startOfUtcDay})
    WHERE id IN (${source + "-waiting"}, ${source + "-done"}, ${source + "-filtered"}, ${source + "-failed"}, ${source + "-backfill"})`;
  // Updated timestamps must not turn old discoveries into new news or reset the 15-minute SLA.
  await sql`UPDATE articles SET updated_at = now()
    WHERE id = ${source + "-waiting"} OR id = ${source + "-historic"}`;
  await sql`INSERT INTO receipts (logical_key, service, purpose, subject, status)
    VALUES (${source + "-unknown"}, 'test', 'analyze_article', ${"article:" + source + "-failed@1"}, 'unknown')`;
  const after = await livePipelineOverview();
  const navAfter = await navCounts();
  const oldAfter = await legacyUnresolvedOverview();
  const currentAfter = await currentNewsQueueOverview();
  assert.equal(after.discovered - before.discovered, 4);
  assert.equal(currentAfter.pending - currentBefore.pending, 1);
  assert.equal(currentAfter.failed - currentBefore.failed, 1);
  assert.equal(oldAfter - oldBefore, 2, "unresolved pre-24h articles remain visible outside new-news totals");
  assert.equal(after.waiting - before.waiting, 1);
  assert.equal(after.analyzed - before.analyzed, 1);
  assert.equal(after.grouped - before.grouped, 1);
  assert.equal(after.filtered - before.filtered, 1);
  assert.equal(after.failed - before.failed, 1);
  const [waiting] = await sql<{ stalled: boolean }[]>`
    SELECT discovered_at < now() - interval '15 minutes' AS stalled FROM articles
    WHERE id = ${source + "-waiting"}`;
  assert.equal(after.stalled - before.stalled, waiting?.stalled ? 1 : 0);
  // Navigation is a count of distinct problem articles, not attempts or unknown receipts.
  assert.equal((navAfter.runs ?? 0) - (navBefore.runs ?? 0), 2);
  assert.ok(after.newestAt);
});
