import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dispatchProjectOps } from "./eventgraph-work-queue-guards.mjs";

export const REPOSITORY = "jboone1989/EventGraph";
export const OWNER = "jboone1989";
export const SPEC_REPOSITORY_ID = "1416699488";

function gh(args, { env = process.env } = {}) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], env }).trim();
}

function section(body, heading) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${heading}\\s*$`, "i").test(line));
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

export function parseAdmission(event) {
  if (event?.action !== "labeled" || event?.label?.name !== "agent-ready") return null;
  if (event?.sender?.login !== OWNER) return null;
  const issue = event.issue;
  if (!issue || issue.pull_request || !Number.isInteger(issue.number) || issue.number < 1) {
    throw new Error("agent-ready event does not reference a normal Issue");
  }
  const body = String(issue.body ?? "");
  const task = section(body, "Task");
  const criteria = section(body, "Acceptance Criteria");
  if (task.length < 30) throw new Error("Issue must contain a substantive ## Task section");
  const checks = criteria.split(/\r?\n/).filter((line) => /^\s*-\s*\[\s\]\s+\S/.test(line));
  if (checks.length === 0) throw new Error("Issue must contain testable unchecked items under ## Acceptance Criteria");
  const specMatch = body.match(/^Spec:\s*(specs\/[A-Za-z0-9._/-]+\/spec\.md)@([a-f0-9]{40})\s*$/im);
  if (!specMatch || specMatch[1].split("/").includes("..")) throw new Error("Issue must pin Spec: specs/<feature>/spec.md@<40-character-commit-sha>");
  const prMatch = body.match(/^Spec PR:\s*(https:\/\/github\.com\/jboone1989\/EventGraph\/pull\/(\d+))\s*$/im);
  if (!prMatch) throw new Error("Issue must include Spec PR: https://github.com/jboone1989/EventGraph/pull/<number>");
  return {
    issue,
    task,
    acceptanceCriteria: checks.join("\n"),
    specPath: specMatch[1],
    specSha: specMatch[2],
    specPrUrl: prMatch[1],
    specPrNumber: Number(prMatch[2]),
  };
}

function verifySpec(admission) {
  const pr = JSON.parse(gh(["api", `repos/${REPOSITORY}/pulls/${admission.specPrNumber}`]));
  if (!pr.merged_at || pr.base?.ref !== "develop" || pr.base?.repo?.full_name !== REPOSITORY ||
      pr.head?.repo?.full_name !== REPOSITORY || pr.merged_by?.login !== OWNER) {
    throw new Error("Spec PR must be merged by the repository owner into develop from this repository");
  }
  const comparison = JSON.parse(gh(["api", `repos/${REPOSITORY}/compare/${admission.specSha}...develop`]));
  if (!["ahead", "identical"].includes(comparison.status)) {
    throw new Error("Pinned Spec commit is not an ancestor of current develop");
  }
  const pinned = JSON.parse(gh(["api", `repos/${REPOSITORY}/contents/${admission.specPath}?ref=${admission.specSha}`]));
  const current = JSON.parse(gh(["api", `repos/${REPOSITORY}/contents/${admission.specPath}?ref=develop`]));
  if (!pinned.sha || pinned.sha !== current.sha) throw new Error("Pinned Spec content has changed on develop");
}

export function buildWorkPayload(admission) {
  const issueUrl = `https://github.com/${REPOSITORY}/issues/${admission.issue.number}`;
  return {
    task: [
      `Issue #${admission.issue.number}: ${admission.issue.title}`,
      `Issue URL: ${issueUrl}`,
      `Spec: ${admission.specPath}@${admission.specSha}`,
      `Spec PR: ${admission.specPrUrl}`,
      "",
      "Task:",
      admission.task,
      "",
      "Acceptance Criteria:",
      admission.acceptanceCriteria,
    ].join("\n"),
    effect_contract: {
      version: 1,
      outputs: [{ type: "create_pull_request", min: 1, max: 1 }],
    },
    resource_scope: {
      version: 1,
      resources: [{
        host: "github.com",
        repository: REPOSITORY,
        repository_id: SPEC_REPOSITORY_ID,
      }],
    },
  };
}

function submitWork(payload, issueNumber) {
  const workPath = join(process.env.RUNNER_TEMP || "/tmp", `eventgraph-work-${issueNumber}.json`);
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > 16_384) throw new Error("Work payload exceeds GH-AW's 16 KiB limit");
  writeFileSync(workPath, serialized, { mode: 0o600 });
  gh(["aw", "work-queue", "--repo", REPOSITORY, "submit-work", "--file", workPath,
    "--worker-profile", "eventgraph-worker", "--request-id", `issue-${issueNumber}`]);
}

function dispatchGate() {
  gh(["workflow", "run", "eventgraph-dispatch-gate.yml", "--repo", REPOSITORY, "--ref", "main"]);
}

// Label the source Issue only after its Work exists, so native Project
// Auto-add never sees an Issue that failed to enter the queue.
// `gh issue edit --add-label` is idempotent: adding an existing label is a no-op.
export function agentWorkLabelArgs(issueNumber) {
  return ["issue", "edit", String(issueNumber), "--repo", REPOSITORY, "--add-label", "agent-work"];
}

function issueLabelEnv() {
  const token = process.env.EVENTGRAPH_ISSUE_TOKEN;
  return token ? { ...process.env, GH_TOKEN: token } : process.env;
}

export function labelIssue(issueNumber) {
  gh(agentWorkLabelArgs(issueNumber), { env: issueLabelEnv() });
}

export function runIntake(event, overrides = {}) {
  const steps = { verifySpec, submitWork, labelIssue, dispatchGate, dispatchProjectOps, ...overrides };
  const admission = parseAdmission(event);
  if (!admission) {
    process.stdout.write("Ignored: this is not an owner-authored agent-ready Issue event.\n");
    return "ignored";
  }
  steps.verifySpec(admission);
  steps.submitWork(buildWorkPayload(admission), admission.issue.number);
  steps.labelIssue(admission.issue.number);
  steps.dispatchGate();
  steps.dispatchProjectOps();
  process.stdout.write(`Submitted idempotent Work for Issue #${admission.issue.number}, labeled it agent-work, and requested a dispatch-gate run.\n`);
  return "submitted";
}

export function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  runIntake(event);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch (error) {
    process.stderr.write(`EventGraph Work intake failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
