import { readFileSync } from "node:fs";
import {
  isWorkerRun,
  dispatchCheck,
  dispatchGate,
  getOpenAgentWorkPrs,
  validateAgentWorkPr,
  verifySuccessfulWorkerRun,
} from "./eventgraph-work-queue-guards.mjs";

export function handleWorkerCompletion(event, actions = {
  getOpenAgentWorkPrs, dispatchGate, verifySuccessfulWorkerRun, dispatchCheck,
}) {
  const run = event?.workflow_run;
  if (event?.action !== "completed" || !isWorkerRun(run) ||
      run.event !== "workflow_dispatch" || run.status !== "completed") {
    throw new Error("Unexpected workflow_run event; refusing to advance the queue");
  }
  const prs = actions.getOpenAgentWorkPrs();
  if (prs.length === 0) {
    actions.dispatchGate();
    return "gate-dispatched";
  }
  if (prs.length !== 1) throw new Error(`Expected at most one open agent-work PR; found ${prs.length}`);
  const pr = prs[0];
  const marker = validateAgentWorkPr(pr);
  if (marker.runId !== String(run.id)) {
    throw new Error(`Open agent-work PR #${pr.number} does not match completed Worker run ${run.id}`);
  }
  if (run.conclusion !== "success") throw new Error(`Worker run ${run.id} did not succeed`);
  actions.verifySuccessfulWorkerRun(run.id);
  actions.dispatchCheck(pr);
  return "check-dispatched";
}

export function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const result = handleWorkerCompletion(event);
  process.stdout.write(`Worker completion handled: ${result}.\n`);
}

if (process.argv[1]?.endsWith("eventgraph-worker-complete.mjs")) {
  try { main(); } catch (error) {
    process.stderr.write(`Worker completion failed closed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
