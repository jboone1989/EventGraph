import { execFileSync } from "node:child_process";

export const REPOSITORY = "jboone1989/EventGraph";
export const WORKER_NAMES = new Set(["EventGraph GH-AW Worker", "EventGraph GH-AW Pi Worker"]);
export function isWorkerWorkflowName(name) { return WORKER_NAMES.has(name); }

export function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

export function ghJson(args) {
  return JSON.parse(gh(args));
}

export function parseWorkerMarker(body) {
  const match = String(body ?? "").match(/<!-- eventgraph-work-id:([^\s<>]+) worker-run-id:(\d+) -->/);
  return match ? { workId: match[1], runId: match[2] } : null;
}

export function validateAgentWorkPr(pr) {
  const labels = (pr.labels ?? []).map((label) => label.name);
  if (pr.state !== "open" || pr.draft || pr.base?.ref !== "develop" ||
      pr.base?.repo?.full_name !== REPOSITORY || pr.head?.repo?.full_name !== REPOSITORY ||
      !String(pr.head?.ref ?? "").startsWith("agent/") || !labels.includes("agent-work")) {
    throw new Error(`Open agent-work PR #${pr.number} violates repository, branch, base, label, or draft policy`);
  }
  const marker = parseWorkerMarker(pr.body);
  if (!marker) throw new Error(`Open agent-work PR #${pr.number} has no valid Work/Worker marker`);
  if (!/^[0-9a-f]{40}$/.test(pr.head.sha ?? "")) throw new Error(`Open agent-work PR #${pr.number} has no immutable head SHA`);
  return marker;
}

export function getOpenAgentWorkPrs() {
  const prs = ghJson(["api", "--method", "GET", `repos/${REPOSITORY}/pulls`,
    "-f", "state=open", "-f", "base=develop", "-f", "labels=agent-work", "-f", "per_page=100"]);
  return prs.filter((pr) => (pr.labels ?? []).some((label) => label.name === "agent-work"));
}

export function verifySuccessfulWorkerRun(runId) {
  const run = ghJson(["api", `repos/${REPOSITORY}/actions/runs/${runId}`]);
  if (String(run.id) !== String(runId) || !isWorkerWorkflowName(run.name) ||
      run.event !== "workflow_dispatch" || run.status !== "completed" || run.conclusion !== "success" ||
      run.repository?.full_name !== REPOSITORY || run.head_repository?.full_name !== REPOSITORY) {
    throw new Error(`Worker run ${runId} is not a completed successful EventGraph GH-AW Worker run`);
  }
  return run;
}

export function dispatchGate() {
  gh(["workflow", "run", "eventgraph-dispatch-gate.yml", "--repo", REPOSITORY, "--ref", "main"]);
}

export function dispatchNext() {
  gh(["aw", "work-queue", "--repo", REPOSITORY, "dispatch", "eventgraph-dispatcher", "--wait"]);
}

export function dispatchCheck(pr) {
  gh(["workflow", "run", "check.yml", "--repo", REPOSITORY, "--ref", pr.head.ref, "-f", `expected_sha=${pr.head.sha}`]);
}
