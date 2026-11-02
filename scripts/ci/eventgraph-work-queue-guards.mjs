import { execFileSync } from "node:child_process";

export const REPOSITORY = "jboone1989/EventGraph";
// Registered workflow identity; run.name is the native queue's dynamic run-name.
export const WORKER_ID = 401548383;
export const WORKER_PATH = ".github/workflows/eventgraph-worker.lock.yml";
export const WORKER_WORKFLOW_ID = "eventgraph-worker";
// Maximum simultaneously in-flight code Works (active Worker runs plus open
// agent-work PRs, deduplicated by Work identity). See specs/013.
export const IN_FLIGHT_CAP = 2;

export function isWorkerRun(run) {
  return run?.workflow_id === WORKER_ID && run.path === WORKER_PATH &&
    run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY;
}

export function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

export function ghJson(args) {
  return JSON.parse(gh(args));
}

function parseLegacyWorkerMarker(body) {
  const match = String(body ?? "").match(/<!-- eventgraph-work-id:([^\s<>]+) worker-run-id:(\d+) -->/);
  return match ? { workId: match[1], runId: match[2] } : null;
}

function parseTrustedGhAwFooter(body) {
  const text = String(body ?? "");
  if (!text.match(new RegExp(`<!--\\s*gh-aw-workflow-id:\\s*${WORKER_WORKFLOW_ID}\\s*-->`))) return null;

  const work = text.match(/^>\s*Work \`([^\`\s]+)\`\s*·\s*Claim \`[^\`\s]+\`\s*$/m);
  const runUrl = text.match(/https:\/\/github\.com\/jboone1989\/EventGraph\/actions\/runs\/(\d+)/);
  if (!work || !runUrl) return null;

  const execution = text.match(/<!--\s*gh-aw-execution:\s*(\{[^\n]*\})\s*-->/);
  if (execution) {
    let parsed;
    try { parsed = JSON.parse(execution[1]); } catch { return null; }
    if (parsed.repository !== REPOSITORY || parsed.aw_workflow_id !== WORKER_WORKFLOW_ID ||
        String(parsed.run_id) !== runUrl[1]) return null;
  }
  return { workId: work[1], runId: runUrl[1] };
}

export function parseWorkerMarker(body) {
  return parseLegacyWorkerMarker(body) ?? parseTrustedGhAwFooter(body);
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

export function verifySuccessfulWorkerRun(runId, read = ghJson) {
  const run = read(["api", `repos/${REPOSITORY}/actions/runs/${runId}`]);
  if (String(run.id) !== String(runId) || !isWorkerRun(run) ||
      run.event !== "workflow_dispatch" || run.status !== "completed" || run.conclusion !== "success") {
    throw new Error(`Worker run ${runId} is not a completed successful EventGraph GH-AW Worker run`);
  }
  return run;
}

// An open agent-work PR may be backed by a Worker run that already completed
// successfully or is still finishing (the safe output stages the PR before the
// run ends). A completed-but-failed run can never back an open PR.
export function verifyPrRunState(runId, read = ghJson) {
  const run = read(["api", `repos/${REPOSITORY}/actions/runs/${runId}`]);
  if (String(run.id) !== String(runId) || !isWorkerRun(run) || run.event !== "workflow_dispatch") {
    throw new Error(`Open agent-work PR references run ${runId}, which is not an EventGraph GH-AW Worker run`);
  }
  if (run.status === "completed" && run.conclusion !== "success") {
    throw new Error(`Open agent-work PR references Worker run ${runId}, which already failed`);
  }
  return run;
}

export function getActiveWorkerRuns(read = ghJson) {
  // gh api defaults to POST once -f fields are present; the runs endpoint is GET-only.
  const payload = read(["api", "--method", "GET", `repos/${REPOSITORY}/actions/workflows/${WORKER_ID}/runs`, "-f", "per_page=100"]);
  return (payload.workflow_runs ?? []).filter((run) =>
    isWorkerRun(run) && run.event === "workflow_dispatch" && run.status !== "completed");
}

// One in-flight identity per Work: an active Worker run and the open PR it
// staged share the run ID (and a retry shares the Work ID), so they merge.
export function countInFlight(activeRuns, prEntries) {
  const groups = [];
  const index = new Map();
  for (const run of activeRuns) {
    const key = `run:${run.id}`;
    if (index.has(key)) continue;
    const group = { runIds: [String(run.id)], workIds: [], prNumbers: [] };
    groups.push(group);
    index.set(key, group);
  }
  for (const entry of prEntries) {
    const keys = [`run:${entry.runId}`, `work:${entry.workId}`];
    const matches = [...new Set(keys.map((key) => index.get(key)).filter(Boolean))];
    let group;
    if (matches.length === 0) {
      group = { runIds: [], workIds: [], prNumbers: [] };
      groups.push(group);
    } else {
      group = matches[0];
      for (const other of matches.slice(1)) {
        groups.splice(groups.indexOf(other), 1);
        for (const runId of other.runIds) if (!group.runIds.includes(runId)) group.runIds.push(runId);
        for (const workId of other.workIds) if (!group.workIds.includes(workId)) group.workIds.push(workId);
        for (const prNumber of other.prNumbers) if (!group.prNumbers.includes(prNumber)) group.prNumbers.push(prNumber);
        for (const [key, owner] of index) if (owner === other) index.set(key, group);
      }
    }
    if (!group.runIds.includes(entry.runId)) group.runIds.push(entry.runId);
    if (!group.workIds.includes(entry.workId)) group.workIds.push(entry.workId);
    if (!group.prNumbers.includes(entry.prNumber)) group.prNumbers.push(entry.prNumber);
    for (const key of keys) index.set(key, group);
  }
  return { count: groups.length, groups };
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
