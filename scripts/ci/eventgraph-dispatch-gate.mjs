import { dispatchNext, getOpenAgentWorkPrs, validateAgentWorkPr, verifySuccessfulWorkerRun } from "./eventgraph-work-queue-guards.mjs";

export function main() {
  const prs = getOpenAgentWorkPrs();
  if (prs.length > 1) throw new Error(`Expected at most one open agent-work PR; found ${prs.length}`);
  if (prs.length === 1) {
    const marker = validateAgentWorkPr(prs[0]);
    verifySuccessfulWorkerRun(marker.runId);
    process.stdout.write(`Queue paused: PR #${prs[0].number} has a matching successful Worker run.\n`);
    return;
  }
  dispatchNext();
  process.stdout.write("No open agent-work PR; requested one native GH-AW dispatch.\n");
}

if (process.argv[1]?.endsWith("eventgraph-dispatch-gate.mjs")) {
  try { main(); } catch (error) {
    process.stderr.write(`Dispatch gate failed closed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
