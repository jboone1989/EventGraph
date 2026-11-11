// The navigation's 运行与积压 badge and the runs page's 处理失败 detail are one definition:
// today's (UTC) failed flow execution units, never unfinished-article or attempt counts.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss, ensureQueue, QUEUES } from "@aihot/backend/jobs/queue";
import { allFlowItemsOverview, currentNewsQueueItems, failedFlowUnitCount } from "@aihot/backend/admin/runs";
import { navCounts } from "@aihot/backend/admin/navigation";
import { utcDayStart } from "@aihot/backend/operations/stale-work";

/** The badge must equal the failed rows of the same authoritative detail snapshot. */
async function badgeMatchesDetail() {
  const [nav, count] = await Promise.all([navCounts(), failedFlowUnitCount()]);
  const failed = (await allFlowItemsOverview(await currentNewsQueueItems())).filter(item => item.status === "failed");
  assert.equal(count, failed.length);
  assert.equal(nav.runs, failed.length);
  return failed;
}

after(async () => { await stopBoss(); await closeDb(); });

test("runs badge counts failed execution units, not unfinished articles, and drops recovered ones", async () => {
  const boss = await getBoss(); // The badge now reads the same all-flow detail, which needs the pg-boss tables.
  const key = `runs-badge-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES (${key}, 'Runs badge', 'rss', 'T1', 'editorial', '2100-01-01')`;
  const now = new Date();
  // Unfinished work that is not failed: two waiting articles must not raise the badge.
  for (const suffix of ["waiting-1", "waiting-2"]) {
    await sql`INSERT INTO articles
      (id,source_id,identity_key,url,title,discovered_at,timeline_at,updated_at,processing_state,grouping_status)
      VALUES (${key + "-" + suffix},${key},${key + "-" + suffix},${"https://example.org/" + suffix},${suffix},
        ${now},${now},${now},'new','pending')`;
  }
  // One failed analysis and one failed grouping: two execution units of one day's news work.
  await sql`INSERT INTO articles
    (id,source_id,identity_key,url,title,discovered_at,timeline_at,updated_at,processing_state,processing_error,grouping_status)
    VALUES (${key + "-failed"},${key},${key + "-failed"},${"https://example.org/failed"},'失败新闻',
      ${now},${now},${now},'failed','Model cannot route text: Model is disabled','pending')`;
  await sql`INSERT INTO articles
    (id,source_id,identity_key,url,title,discovered_at,timeline_at,updated_at,processing_state,grouping_status,grouping_error)
    VALUES (${key + "-group-failed"},${key},${key + "-group-failed"},${"https://example.org/group"},'归组失败',
      ${now},${now},${now},'analyzed','failed','Model is disabled')`;
  await sql`INSERT INTO publications (article_id,source_id,title,summary,eligible,selected,selection_candidate,visibility,
    selected_ready_at,discovered_at,timeline_at,sort_at,url,category,channel)
    VALUES (${key + "-group-failed"},${key},'归组失败','摘要',true,false,true,'public',
      ${now},${now},${now},${now},${"https://example.org/group"},'industry','news')`;

  const failed = await badgeMatchesDetail();
  assert.equal(failed.filter(item => item.kind === "article").length, 2);
  assert.ok(failed.every(item => !item.key.startsWith("article:" + key + "-waiting")));
  assert.ok(failed.some(item => item.key === "article:" + key + "-failed" && item.status === "failed"));
  assert.ok(failed.some(item => item.key === "article:" + key + "-group-failed" && item.status === "failed"));

  // A recovered article is pending work again and leaves the failed count on the next snapshot.
  await sql`UPDATE articles SET processing_state = 'new', processing_error = NULL WHERE id = ${key + "-failed"}`;
  const afterRecovery = await badgeMatchesDetail();
  assert.ok(!afterRecovery.some(item => item.key === "article:" + key + "-failed"));
  assert.ok(afterRecovery.some(item => item.key === "article:" + key + "-group-failed"));

  // A completed parent job must not add a second unit for the article it belongs to.
  await ensureQueue(QUEUES.group);
  const jobId = await boss.send(QUEUES.group, { articleId: key + "-group-failed" });
  assert.ok(jobId, "the fixture job must be created");
  await sql`UPDATE pgboss.job SET state = 'completed', started_on = now(), completed_on = now() WHERE id = ${jobId}::uuid`;
  const withCompletedJob = await badgeMatchesDetail();
  assert.equal(withCompletedJob.filter(item => item.articleId === key + "-group-failed").length, 1);
});

test("badge includes terminal unknown failures but excludes superseded and yesterday", async () => {
  await getBoss();
  const key = `runs-receipts-${tag()}`;
  const yesterday = new Date(utcDayStart().getTime() - 60_000);
  const [oldFailed, unknown, failed] = await sql<{ id: number }[]>`
    INSERT INTO receipts (logical_key,service,model,purpose,subject,status,error,created_at,updated_at)
    VALUES
      (${key + "-old"}, 'Groq', 'test-model', 'group_article', ${key + "-old"}, 'failed', 'yesterday', ${yesterday}, ${yesterday}),
      (${key + "-unknown"}, 'Groq', 'test-model', 'group_article', ${key + "-unknown"}, 'unknown', 'unverified', now(), now()),
      (${key + "-today"}, 'Groq', 'test-model', 'group_article', ${key + "-today"}, 'failed', 'routing off', now(), now())
    RETURNING id`;
  try {
    const units = await allFlowItemsOverview(await currentNewsQueueItems());
    assert.equal(units.some(item => item.key === "model:" + oldFailed!.id), false, "yesterday's failure is not today's badge");
    assert.equal(units.find(item => item.key === "model:" + unknown!.id)?.status, "failed", "unknown completed calls are failures");
    assert.equal(units.find(item => item.key === "model:" + failed!.id)?.status, "failed");
    const failedRows = await badgeMatchesDetail();
    assert.ok(failedRows.some(item => item.key === "model:" + failed!.id));
    assert.ok(!failedRows.some(item => item.key === "model:" + oldFailed!.id));
    assert.ok(failedRows.some(item => item.key === "model:" + unknown!.id));

    // A newer successful receipt for the same subject and purpose retires the failed unit.
    await sql`INSERT INTO receipts (logical_key,service,model,purpose,subject,status,created_at,updated_at)
      VALUES (${key + "-today-ok"}, 'Groq', 'test-model', 'group_article', ${key + "-today"}, 'received', now(), now())`;
    const superseded = await badgeMatchesDetail();
    assert.ok(!superseded.some(item => item.key === "model:" + failed!.id), "an obsolete failed receipt is not current failure");
  } finally {
    await sql`DELETE FROM receipts WHERE subject IN (${key + "-old"}, ${key + "-unknown"}, ${key + "-today"})`;
  }
});
