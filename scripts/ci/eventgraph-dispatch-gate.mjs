import {
  countInFlight,
  dispatchNext,
  getActiveWorkerRuns,
  getOpenAgentWorkPrs,
  IN_FLIGHT_CAP,
  validateAgentWorkPr,
  verifyPrRunState,
} from "./eventgraph-work-queue-guards.mjs";

export function runGate(overrides = {}) {
  const deps = {
    getOpenAgentWorkPrs, validateAgentWorkPr, verifyPrRunState, getActiveWorkerRuns,
    countInFlight, dispatchNext, ...overrides,
  };
  const prs = deps.getOpenAgentWorkPrs();
  const entries = prs.map((pr) => {
    const marker = deps.validateAgentWorkPr(pr);
    deps.verifyPrRunState(marker.runId);
    return { ...marker, prNumber: pr.number };
  });
  const active = deps.getActiveWorkerRuns();
  const { count, groups } = deps.countInFlight(active, entries);
  const summary = JSON.stringify(groups);
  if (count > IN_FLIGHT_CAP) {
    throw new Error(`In-flight Works (${count}) exceed the cap of ${IN_FLIGHT_CAP}: ${summary}`);
  }
  if (count === IN_FLIGHT_CAP) {
    process.stdout.write(`Queue paused: ${count} in-flight Works at the cap (${summary}).\n`);
    return "paused";
  }
  deps.dispatchNext();
  process.stdout.write(`${count} in-flight Work(s); requested one native GH-AW dispatch.\n`);
  return "dispatched";
}

export function main() {
  runGate();
}

if (process.argv[1]?.endsWith("eventgraph-dispatch-gate.mjs")) {
  try { main(); } catch (error) {
    process.stderr.write(`Dispatch gate failed closed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
