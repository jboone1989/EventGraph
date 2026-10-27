// Focus on newly discovered editorial news, not import history.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { livePipelineOverview } from "@aihot/backend/admin/runs";

after(closeDb);

test("live dashboard excludes old and backfilled articles", async () => {
  const before = await livePipelineOverview();
  const source = `live-dashboard-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
            VALUES (${source},'Live dashboard','rss','T1','editorial','2100-01-01')`;
  for (const [suffix, age, backfill, state, group] of [
    ["waiting", "20 minutes", false, "new", "pending"],
    ["done", "1 minute", false, "analyzed", "complete"],
    ["filtered", "2 minutes", false, "blocked", "pending"],
    ["backfill", "3 minutes", true, "failed", "pending"],
    ["historic", "30 hours", false, "failed", "pending"],
  ] as const) {
    const id = `${source}-${suffix}`;
    await sql`INSERT INTO articles
      (id,source_id,identity_key,url,title,discovered_at,timeline_at,updated_at,
       backfill,processing_state,grouping_status,grouped_at)
      VALUES (${id},${source},${id},${"https://example.org/" + id},${suffix},
        now() - ${age}::interval,now() - ${age}::interval,now() - ${age}::interval,
        ${backfill},${state},${group},${group === "complete" ? new Date() : null})`;
  }
  const after = await livePipelineOverview();
  assert.equal(after.discovered - before.discovered, 3);
  assert.equal(after.waiting - before.waiting, 1);
  assert.equal(after.analyzed - before.analyzed, 1);
  assert.equal(after.grouped - before.grouped, 1);
  assert.equal(after.filtered - before.filtered, 1);
  assert.equal(after.failed - before.failed, 0);
  assert.equal(after.stalled - before.stalled, 1);
  assert.ok(after.newestAt);
});
