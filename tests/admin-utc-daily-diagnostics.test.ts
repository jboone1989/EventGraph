// Operational dashboards are UTC-calendar-day views, not rolling 24-hour history.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { routingEffectOverview, runsOverview } from "@aihot/backend/admin/runs";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { expireStaleWork, utcDayStart } from "@aihot/backend/operations/stale-work";

after(async () => { await stopBoss(); await closeDb(); });

test("UTC day starts at 00:00Z regardless of local timezone", () => {
  assert.equal(utcDayStart(new Date("2026-11-06T23:59:59Z")).toISOString(), "2026-11-06T00:00:00.000Z");
  assert.equal(utcDayStart(new Date("2026-11-07T00:00:00Z")).toISOString(), "2026-11-07T00:00:00.000Z");
});

test("dashboard resets old task, receipt and routing diagnostics without losing billing receipts", async () => {
  await getBoss();
  const id = `utc-diagnostics-${tag()}`;
  const start = utcDayStart();
  const yesterday = new Date(start.getTime() - 60_000);
  const today = new Date();

  const [oldReceipt] = await sql<{ id: number }[]>`
    INSERT INTO receipts (logical_key, service, purpose, subject, status, request, created_at, updated_at)
    VALUES (${id + "-old"}, ${id}, 'analyze_article', ${id}, 'unknown',
      ${sql.json({ routing: { stage: "analyze_article" } })}, ${yesterday}, ${yesterday}) RETURNING id`;
  const [newReceipt] = await sql<{ id: number }[]>`
    INSERT INTO receipts (logical_key, service, purpose, subject, status, request, created_at, updated_at)
    VALUES (${id + "-new"}, ${id}, 'analyze_article', ${id}, 'unknown',
      ${sql.json({ routing: { stage: "analyze_article" } })}, ${today}, ${today}) RETURNING id`;
  const [oldFailedReceipt] = await sql<{ id: number }[]>`
    INSERT INTO receipts (logical_key, service, purpose, subject, status, created_at, updated_at)
    VALUES (${id + "-old-failed"}, ${id}, 'analyze_article', ${id}, 'failed', ${yesterday}, ${yesterday}) RETURNING id`;
  await sql`
    INSERT INTO receipt_attempts (receipt_id, attempt, service, status, started_at)
    VALUES (${oldReceipt!.id}, 1, ${id}, 'unknown', ${yesterday}),
           (${newReceipt!.id}, 1, ${id}, 'unknown', ${today})`;
  await sql`INSERT INTO notify_targets (key,purpose,kind) VALUES (${id}, 'content', 'log')`;
  const [oldUnknownDelivery] = await sql<{ id: number }[]>`
    INSERT INTO deliveries (target_key, subject_kind, subject_id, dedupe_key, status, created_at, updated_at)
    VALUES (${id}, 'selected', ${id}, ${id + "-unknown"}, 'unknown', ${yesterday}, ${yesterday}) RETURNING id`;
  const [oldSendingDelivery] = await sql<{ id: number }[]>`
    INSERT INTO deliveries (target_key, subject_kind, subject_id, dedupe_key, status, created_at, updated_at)
    VALUES (${id}, 'selected', ${id}, ${id + "-sending"}, 'sending', ${yesterday}, ${yesterday}) RETURNING id`;

  const [oldRun] = await sql<{ id: number }[]>`
    INSERT INTO job_runs (job, status, started_at, finished_at, error)
    VALUES (${id}, 'failed', ${yesterday}, ${yesterday}, 'yesterday') RETURNING id`;
  const [newRun] = await sql<{ id: number }[]>`
    INSERT INTO job_runs (job, status, started_at, finished_at, error)
    VALUES (${id}, 'failed', ${today}, ${today}, 'today') RETURNING id`;

  const [backupRun] = await sql<{ id: number }[]>`
    INSERT INTO job_runs (job, status, started_at, finished_at)
    VALUES ('ops.backup', 'ok', ${yesterday}, ${yesterday}) RETURNING id`;
  const [composeRun] = await sql<{ id: number }[]>`
    INSERT INTO job_runs (job, status, started_at, finished_at)
    VALUES ('reports.compose', 'failed', ${yesterday}, ${yesterday}) RETURNING id`;

  const routing = await routingEffectOverview();
  assert.equal(routing.period, "utc-day");
  assert.equal(routing.providers.find((p) => p.provider === id)?.attempts, 1);
  const dashboard = await runsOverview();
  assert.ok(dashboard.timeline.some((r) => r.id === newRun!.id));
  assert.ok(!dashboard.timeline.some((r) => r.id === oldRun!.id));
  assert.ok(dashboard.receipts.issues.some((r) => r.id === newReceipt!.id));
  assert.ok(dashboard.receipts.issues.some((r) => r.id === oldReceipt!.id), "unresolved unknown receipts survive midnight in the recovery UI");
  assert.ok(!dashboard.receipts.issues.some((r) => r.id === oldFailedReceipt!.id), "resolved old-day failures are hidden");
  assert.ok(dashboard.receipts.unknownTotal >= 2, "outstanding paid outcomes are not an ephemeral daily counter");
  assert.ok(dashboard.deliveries.some((d) => d.id === oldUnknownDelivery!.id), "unknown deliveries remain actionable across days");
  assert.ok(dashboard.deliveries.some((d) => d.id === oldSendingDelivery!.id), "stuck sending deliveries remain actionable across days");

  const cleaned = await expireStaleWork();
  assert.ok(cleaned.deletedRunHistory >= 1);
  const oldJobs = await sql`SELECT id FROM job_runs WHERE id = ${oldRun!.id}`;
  const todayJobs = await sql`SELECT id FROM job_runs WHERE id = ${newRun!.id}`;
  const oldBillingEvidence = await sql`SELECT id FROM receipts WHERE id = ${oldReceipt!.id}`;
  const preservedBaseline = await sql`SELECT id FROM job_runs WHERE id IN (${backupRun!.id}, ${composeRun!.id})`;
  assert.equal(oldJobs.length, 0);
  assert.equal(todayJobs.length, 1);
  assert.equal(oldBillingEvidence.length, 1);
  assert.equal(preservedBaseline.length, 2, "backup and daily report alerts must keep cross-day run baselines");
});
