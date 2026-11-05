// Exercise the real queue callback and process shutdown: already sent model answers must settle
// before the DB closes, and the next process must recover using those receipts.
import { gate, pointModels, Reply, stub, tag } from "./setup.ts";
import { analysisStep, SELECTING_SCORE, combinedAnswer, type AnalysisStep } from "./analysis-steps.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { upsertMaterial } from "@aihot/backend/content/materials";

const T = tag();
const SOURCE = `test-analyze-stop-${T}`;
let active: {
  calls: AnalysisStep[];
  scoreAsked: ReturnType<typeof gate<void>>;
  structureAsked: ReturnType<typeof gate<void>>;
  scoreAnswer: ReturnType<typeof gate<void>>;
  structureAnswer: ReturnType<typeof gate<void>>;
  writingAsked?: ReturnType<typeof gate<void>>;
  writingAnswer?: ReturnType<typeof gate<void>>;
  failScore: boolean;
};
const provider = await stub(async (_hit, request) => {
  const step = analysisStep(request.body);
  active.calls.push(step);
  if (step === "combined") {
    active.scoreAsked.open();
    await active.scoreAnswer.promise;
    if (active.failScore) return new Reply(503, { error: "temporary provider outage" });
  }
  const content = combinedAnswer({ titleZh: `新模型发布 ${T}` });
  return { id: `stub-${active.calls.length}`, choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
});
const children = new Set<ReturnType<typeof spawn>>();

function worker(queue: string) {
  const script = `
    import { getBoss, stopBoss, shutdownSignal, QUEUES } from '@aihot/backend/jobs/queue';
    import { registerContentJobs } from '@aihot/backend/jobs/content';
    import { closeDb } from '@aihot/backend/db';
    QUEUES.analyze = process.env.TEST_ANALYZE_QUEUE;
    let stopping = false;
    process.on('SIGTERM', async () => {
      if (stopping) return;
      stopping = true;
      shutdownSignal.abort();
      process.send({ stopping: true });
      await stopBoss();
      await closeDb();
      process.disconnect();
    });
    await registerContentJobs(await getBoss());
    process.send({ ready: true });
  `;
  const env = { ...process.env, TEST_ANALYZE_QUEUE: queue, MODEL_CALLS_ENABLED: "true", AIHOT_CREDENTIALS_DIR: "/nonexistent-test-credentials" };
  pointModels(provider.url, undefined, env);
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  children.add(child);
  const ready = gate();
  const stopping = gate();
  let stderr = "";
  child.stderr!.on("data", chunk => { stderr += chunk.toString(); });
  child.on("message", (message: any) => { if (message.ready) ready.open(); if (message.stopping) stopping.open(); });
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => { children.delete(child); code === 0 ? resolve() : reject(new Error(`analysis worker exited ${code}: ${stderr}`)); });
  });
  return { child, ready: ready.promise, stopping: stopping.promise, done };
}
async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 12_000;
  while (!(await check())) { if (Date.now() > deadline) assert.fail(`timeout waiting for ${label}`); await delay(20); }
}

before(async () => {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES (${SOURCE},'Analysis shutdown','rss','T1','editorial','2100-01-01')`;
});
after(async () => {
  active?.scoreAnswer.open(); active?.structureAnswer.open(); active?.writingAnswer?.open();
  for (const child of children) child.kill("SIGTERM");
  await provider.close(); await stopBoss(); await closeDb();
});

test("SIGTERM during the single paid analysis request still settles receipt and publishes", async () => {
  active = { calls: [], scoreAsked: gate(), structureAsked: gate(), scoreAnswer: gate(), structureAnswer: gate(), failScore: false };
  const queue = `test.analyze-stop-${T}-single`;
  const boss = await getBoss();
  await boss.createQueue(queue, { policy: "short", retryLimit: 4, retryDelay: 1, expireInSeconds: 120 });
  const { articleId } = await upsertMaterial({ sourceId: SOURCE, url: `https://example.org/analyze-stop-${T}/single`,
    title: `New model release ${T}`, bodyText: `A lab released a new AI model with benchmarks and prices. ${T} ` +
      "The release explains model capabilities and evaluation results. ".repeat(10),
    bodyStatus: "ok", language: "en", via: "fetch", publishedAt: new Date() });
  const jobId = await boss.send(queue, { articleId }, { singletonKey: articleId });
  const running = worker(queue);
  await Promise.race([Promise.all([running.ready, active.scoreAsked.promise]),
    running.done.then(() => assert.fail("worker exited before the model response"))]);
  running.child.kill("SIGTERM"); await running.stopping;
  active.scoreAnswer.open(); await running.done;
  assert.deepEqual(active.calls, ["combined"]);
  assert.equal((await sql`SELECT state FROM pgboss.job WHERE id=${jobId}`)[0]!.state, "completed");
  assert.equal((await sql`SELECT processing_state FROM articles WHERE id=${articleId}`)[0]!.processing_state, "analyzed");
  const [analysis] = await sql`SELECT selected,score,receipt_ids FROM analyses WHERE article_id=${articleId}`;
  assert.equal(analysis!.selected, true);
  assert.equal(Number(analysis!.score), SELECTING_SCORE);
  assert.equal(analysis!.receipt_ids.length, 1);
  assert.equal((await sql`SELECT 1 FROM receipts WHERE subject=${`article:${articleId}@1`} AND status='completed'`).length, 1);
  assert.equal((await sql`SELECT outcome FROM english_copies WHERE article_id=${articleId}`)[0]?.outcome, "written");
});

test("a failed single request during shutdown is retried once, without partial publication", async () => {
  active = { calls: [], scoreAsked: gate(), structureAsked: gate(), scoreAnswer: gate(), structureAnswer: gate(), failScore: true };
  const queue = `test.analyze-stop-${T}-recovery`;
  const boss = await getBoss();
  await boss.createQueue(queue, { policy: "short", retryLimit: 4, retryDelay: 0, expireInSeconds: 120 });
  const { articleId } = await upsertMaterial({ sourceId: SOURCE, url: `https://example.org/analyze-stop-${T}/retry`,
    title: `Model retry release ${T}`, bodyText: `An AI model release with benchmarks ${T}. ` +
      "The source provides pricing and evaluation details. ".repeat(10),
    bodyStatus: "ok", language: "en", via: "fetch", publishedAt: new Date() });
  const jobId = await boss.send(queue, { articleId }, { singletonKey: articleId });
  const first = worker(queue);
  await Promise.race([Promise.all([first.ready, active.scoreAsked.promise]),
    first.done.then(() => assert.fail("worker exited before the request"))]);
  first.child.kill("SIGTERM"); await first.stopping;
  active.scoreAnswer.open(); await first.done;
  assert.equal((await sql`SELECT 1 FROM analyses WHERE article_id=${articleId}`).length, 0);
  assert.equal((await sql`SELECT 1 FROM publications WHERE article_id=${articleId}`).length, 0);
  active.failScore = false;
  const restarted = worker(queue); await restarted.ready;
  await until(async () => (await sql`SELECT state FROM pgboss.job WHERE id=${jobId}`)[0]?.state === "completed", "completed retry");
  restarted.child.kill("SIGTERM"); await restarted.done;
  assert.deepEqual(active.calls, ["combined", "combined"]);
  assert.equal((await sql`SELECT receipt_ids FROM analyses WHERE article_id=${articleId}`)[0]?.receipt_ids.length, 1);
});
