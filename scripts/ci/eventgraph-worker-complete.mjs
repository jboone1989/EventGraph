import { readFileSync } from "node:fs";
import {
  isWorkerRun,
  dispatchCheck,
  dispatchGate,
  getOpenAgentWorkPrs,
  parseWorkerMarker,
  validateAgentWorkPr,
  verifySuccessfulWorkerRun,
} from "./eventgraph-work-queue-guards.mjs";

function handlePrClosed(event, actions) {
  const labels = (event.pull_request.labels ?? []).map((label) => label.name);
  if (!labels.includes("agent-work")) return "ignored-non-agent-close";
  actions.dispatchGate();
  return "gate-dispatched";
}

export function handleWorkerCompletion(event, overrides = {}) {
  const actions = {
    getOpenAgentWorkPrs, dispatchGate, dispatchCheck,
    verifySuccessfulWorkerRun, parseWorkerMarker, validateAgentWorkPr, ...overrides,
  };
  if (event?.action === "closed" && event.pull_request) return handlePrClosed(event, actions);
  const run = event?.workflow_run;
  if (event?.action !== "completed" || !isWorkerRun(run) ||
      run.event !== "workflow_dispatch" || run.status !== "completed") {
    throw new Error("Unexpected workflow_run event; refusing to advance the queue");
  }
  // Two Works may be in flight: match PRs for this exact run only.
  const prs = actions.getOpenAgentWorkPrs();
  const matching = prs.filter((pr) => actions.parseWorkerMarker(pr.body)?.runId === String(run.id));
  if (run.conclusion !== "success") {
    if (matching.length > 0) {
      throw new Error(`Failed Worker run ${run.id} still has open agent-work PR #${matching[0].number}`);
    }
    actions.dispatchGate();
    return "gate-dispatched";
  }
  if (matching.length > 1) {
    throw new Error(`Worker run ${run.id} matches ${matching.length} open agent-work PRs`);
  }
  if (matching.length === 0) {
    // Check is never dispatched against an unmatched PR (fail closed for the
    // Check). The queue still continues: no-write Works legitimately finish
    // without a PR, and a code Work whose PR vanished surfaces here loudly.
    process.stdout.write(`Warning: successful Worker run ${run.id} has no matching open agent-work PR; continuing the queue.\n`);
    actions.dispatchGate();
    return "gate-dispatched";
  }
  const pr = matching[0];
  actions.validateAgentWorkPr(pr);
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
