#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const OWNER_LOGIN = "jboone1989";
export const WORKER_LABEL = "agent-work";
export const TASK_ID_PATTERN = /^T\d{3}$/;
const REPOSITORY_ID = "1416699488";

function fail(message) {
  throw new Error(message);
}

export function parseTasks(markdown) {
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const sectionStarts = lines.flatMap((line, index) => line.trim() === "## Work Items" ? [index] : []);
  if (sectionStarts.length !== 1) fail("tasks.md must contain exactly one '## Work Items' section");
  const start = sectionStarts[0] + 1;
  let end = lines.findIndex((line, index) => index >= start && /^## /.test(line));
  if (end < 0) end = lines.length;
  const headingIndexes = [];
  for (let index = start; index < end; index++) {
    if (/^### /.test(lines[index])) headingIndexes.push(index);
  }
  if (!headingIndexes.length) fail("Work Items must contain at least one task");
  if (headingIndexes.length > 256) fail("Work Graph exceeds the native 256-node limit");

  const tasks = headingIndexes.map((headingIndex, position) => {
    const match = /^### (T\d{3}) — (.+?)\s*$/.exec(lines[headingIndex]);
    if (!match) fail("Invalid task heading at line " + (headingIndex + 1));
    const blockEnd = headingIndexes[position + 1] ?? end;
    const block = lines.slice(headingIndex + 1, blockEnd);
    const scopeLines = block.filter(line => /^\*\*Scope:\*\*\s*/.test(line));
    const dependencyLines = block.filter(line => /^\*\*Depends on:\*\*\s*/.test(line));
    const acceptanceIndexes = block.flatMap((line, index) => line.trim() === "**Acceptance:**" ? [index] : []);
    if (scopeLines.length !== 1 || dependencyLines.length !== 1 || acceptanceIndexes.length !== 1) {
      fail(match[1] + " must contain exactly one Scope, Depends on and Acceptance field");
    }
    const scope = scopeLines[0].replace(/^\*\*Scope:\*\*\s*/, "").trim();
    const dependencyText = dependencyLines[0].replace(/^\*\*Depends on:\*\*\s*/, "").trim();
    if (!scope) fail(match[1] + " has an empty Scope");
    if (match[2].length > 180) fail(match[1] + " title exceeds 180 characters");
    let dependsOn = [];
    if (dependencyText.toLowerCase() !== "none") {
      if (!/T\d{3}(?:\s*,\s*T\d{3})*$/.test(dependencyText)) {
        fail(match[1] + " has malformed Depends on syntax");
      }
      dependsOn = dependencyText.split(",").map(value => value.trim());
      if (new Set(dependsOn).size !== dependsOn.length) fail(match[1] + " has duplicate dependencies");
    }
    const acceptanceIndex = acceptanceIndexes[0];
    const acceptanceLines = block.slice(acceptanceIndex + 1).filter(line => line.trim());
    if (!acceptanceLines.length || acceptanceLines.some(line => !/^- .+/.test(line.trim()))) {
      fail(match[1] + " Acceptance must contain one or more '- ' bullets only");
    }
    const acceptanceCriteria = acceptanceLines.map(line => line.trim().slice(2).trim());
    if (acceptanceCriteria.some(value => !value)) fail(match[1] + " has an empty Acceptance bullet");
    return { id: match[1], title: match[2].trim(), scope, dependsOn, acceptanceCriteria };
  });
  validateTaskGraph(tasks);
  return tasks;
}

export function validateTaskGraph(tasks) {
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 256) {
    fail("Work Graph must contain 1..256 tasks");
  }
  const byId = new Map();
  for (const task of tasks) {
    if (!TASK_ID_PATTERN.test(task.id)) fail("Invalid Task ID: " + task.id);
    if (byId.has(task.id)) fail("Duplicate Task ID: " + task.id);
    byId.set(task.id, task);
  }
  for (const task of tasks) {
    if (new Set(task.dependsOn).size !== task.dependsOn.length) fail(task.id + " has duplicate dependencies");
    for (const dependency of task.dependsOn) {
      if (dependency === task.id) fail(task.id + " cannot depend on itself");
      if (!byId.has(dependency)) fail(task.id + " references unknown dependency " + dependency);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail("Task dependency cycle includes " + id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of tasks) visit(task.id);
  return tasks;
}

export function canonical(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail("Work identity contains a noncanonical number");
    return String(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value !== "object") fail("Work identity contains unsupported data");
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
}

export function workId(graphId, nodeKey) {
  const identity = { graph_id: graphId, node_key: nodeKey };
  return createHash("sha256").update(canonical(identity), "utf8").digest("hex");
}

export function taskMarker(specSha, specPath, taskId) {
  return "<!-- eventgraph-spec-task:v1 spec_sha=" + specSha +
    " spec_path=" + specPath + " task_id=" + taskId + " -->";
}

export function issueBody(task, specPath, specSha, specPrUrl) {
  const lines = [
    taskMarker(specSha, specPath, task.id),
    "",
    "## " + task.id + " — " + task.title,
    "",
    "**Spec:** " + specPath + "@" + specSha,
    "**Spec PR:** " + specPrUrl,
    "**Task ID:** " + task.id,
    "**Depends on:** " + (task.dependsOn.length ? task.dependsOn.join(", ") : "none"),
    "",
    "## Scope",
    task.scope,
    "",
    "## Acceptance criteria",
    ...task.acceptanceCriteria.map(value => "- " + value),
    "",
    "This Issue was generated from an owner-approved immutable Spec. Edit the Spec and obtain a new approval rather than changing the task contract here."
  ];
  return lines.join("\n");
}

export function getSpecDirectory(files) {
  const relevant = files.map(file => file.filename).filter(path => /^specs\/[A-Za-z0-9._-]+\/(?:spec|plan|tasks)\.md$/.test(path));
  if (!relevant.length) return null;
  const directories = new Set(relevant.map(path => path.split("/")[1]));
  if (directories.size !== 1) fail("A single merged PR may activate only one Spec directory");
  const directory = Array.from(directories)[0];
  if (!relevant.includes("specs/" + directory + "/spec.md")) return null;
  return directory;
}

export function parseWorkerPRBody(body, repo) {
  const text = String(body ?? "");
  const taskMatches = Array.from(text.matchAll(/^Task:\s*(T\d{3})\s*$/gm));
  if (!taskMatches.length) return null;
  const issueMatches = Array.from(text.matchAll(/^Issue:\s*#(\d+)\s*$/gm));
  const urlMatches = Array.from(text.matchAll(/^Issue URL:\s*(https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+)\s*$/gm));
  const specMatches = Array.from(text.matchAll(/^Spec:\s*(specs\/[A-Za-z0-9._-]+\/spec\.md)@([0-9a-f]{40})\s*$/gm));
  if (taskMatches.length !== 1 || issueMatches.length !== 1 || urlMatches.length !== 1 || specMatches.length !== 1) {
    fail("Spec-generated Worker PR must contain exactly one Issue, Issue URL, Task and Spec line");
  }
  const issueNumber = issueMatches[0][1];
  const expectedUrl = "https://github.com/" + repo + "/issues/" + issueNumber;
  if (urlMatches[0][1] !== expectedUrl || urlMatches[0][1].split("/").at(-1) !== issueNumber) {
    fail("Worker PR Issue URL does not match its Issue number and repository");
  }
  return {
    issueNumber,
    taskId: taskMatches[0][1],
    specPath: specMatches[0][1],
    specSha: specMatches[0][2]
  };
}

export function defaultWorkerRoute(queueState) {
  if (queueState.grants_paused === true || queueState.admission_paused === true) {
    fail("Native Work Queue is paused; no Work was submitted");
  }
  const policy = queueState.policy;
  if (!policy || policy.authorization !== "aw") fail("Native Work Queue has no active GH-AW Policy");
  const poolName = "default";
  const pool = policy.pools?.[poolName];
  if (!pool || !pool.default_profile) fail("Native Work Queue has no approved default Worker pool");
  if (!pool.allowed_repositories?.includes("jboone1989/EventGraph")) {
    fail("Default Worker pool is not authorized for EventGraph repository");
  }
  const profileName = pool.default_profile;
  const profile = pool.profiles?.[profileName];
  if (!profile?.trust_domain) fail("Default Worker profile is missing its trust domain");
  const deployment = queueState.deployments?.[poolName]?.[profileName];
  const currentRef = deployment?.current_ref;
  const current = deployment?.revisions?.[currentRef];
  if (!/^[a-f0-9]{40}$/.test(currentRef ?? "") ||
      !/^[a-f0-9]{64}$/.test(deployment?.current_contract ?? "") ||
      current?.available !== true || !current?.profile) {
    fail("Default Worker profile has no available installed deployment");
  }
  const active = current.profile;
  // Official GH-AW v1.0.1 deploymentBoundary(): these identity/authority
  // properties must not change across compatible registered revisions.
  const boundary = ["workflow", "principal", "trust_domain", "credential_scope",
    "effect_scope", "max_claims", "share_keys"];
  if (boundary.some((key) => profile[key] !== active[key]) ||
      active.ref !== currentRef || active.logical_contract !== deployment.current_contract) {
    fail("Current Worker deployment does not match its approved Policy identity or registered contract");
  }
  const limits = policy.limits;
  if (!limits?.payload_bytes || !limits?.predecessors || !limits?.assignment_bytes) {
    fail("Native Work Queue Policy is missing payload or dependency limits");
  }
  return { poolName, profileName, profile, limits };
}

export function buildWorkGraph({ tasks, issues, queueState, repo, repositoryId, specPath, specSha, specPrUrl, now = Date.now() }) {
  validateTaskGraph(tasks);
  const { poolName, profileName, profile, limits } = defaultWorkerRoute(queueState);
  if (String(repositoryId) !== REPOSITORY_ID) fail("Repository ID does not match the approved EventGraph resource scope");
  const graphId = "spec-" + specSha;
  const effectContract = {
    version: 1,
    outputs: [{ type: "create_pull_request", min: 1, max: 1 }]
  };
  const resourceScope = {
    version: 1,
    resources: [{ host: "github.com", repository: repo, repository_id: REPOSITORY_ID }]
  };
  const issueFor = taskId => {
    const issue = issues instanceof Map ? issues.get(taskId) : issues[taskId];
    if (!issue || !issue.id || !issue.number || !issue.html_url) fail("Missing Issue identity for task " + taskId);
    return issue;
  };
  return tasks.map(task => {
    const issue = issueFor(task.id);
    if (task.dependsOn.length > limits.predecessors) {
      fail(task.id + " exceeds the native predecessor limit of " + limits.predecessors);
    }
    const dependencies = task.dependsOn.map(dependencyId => {
      const predecessor = issueFor(dependencyId);
      return {
        kind: "issue",
        resource: {
          kind: "issue", host: "github.com", repository: repo,
          repository_id: String(repositoryId), resource_id: String(predecessor.id),
          number: String(predecessor.number)
        },
        condition: "completed"
      };
    });
    const taskText = task.id + " — " + task.title + "\nScope: " + task.scope +
      "\nAcceptance:\n" + task.acceptanceCriteria.map(value => "- " + value).join("\n");
    const payload = {
      task: taskText,
      task_id: task.id,
      issue_number: issue.number,
      issue_url: issue.html_url,
      spec_path: specPath,
      spec_sha: specSha,
      spec_pr_url: specPrUrl,
      scope: task.scope,
      acceptance_criteria: task.acceptanceCriteria,
      depends_on_task_ids: task.dependsOn,
      effect_contract: effectContract,
      resource_scope: resourceScope
    };
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > limits.payload_bytes) {
      fail(task.id + " payload exceeds the native " + limits.payload_bytes + "-byte limit");
    }
    const node = {
      kind: "Work",
      work_id: workId(graphId, task.id),
      graph_id: graphId,
      node_key: task.id,
      pool: poolName,
      priority: 3,
      fairness_key: "",
      worker_profile: profileName,
      // Do not pin the installed Policy's historical contract: official GH-AW
      // binds the current verified Deployment revision on admission and
      // persists the immutable AdmissionContract. An explicit stale pin
      // would reject compatible Worker upgrades with work_invalid.
      batch_trust_domain: profile.trust_domain,
      payload,
      depends_on: dependencies,
      enqueued: now
    };
    if (Buffer.byteLength(canonical(node), "utf8") > limits.assignment_bytes) {
      fail(task.id + " normalized Work exceeds the native assignment byte limit");
    }
    return node;
  });
}

export function createGitHubApi(token, fetchImpl = fetch) {
  if (!token) fail("GH_TOKEN is required for trusted Spec intake");
  const request = async (path, options = {}) => {
    const response = await fetchImpl("https://api.github.com" + path, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    const text = await response.text();
    if (!response.ok) fail("GitHub API " + (options.method ?? "GET") + " " + path +
      " returned " + response.status + ": " + text.slice(0, 1000));
    return text ? JSON.parse(text) : null;
  };
  const paginate = async path => {
    const result = [];
    for (let page = 1; page <= 100; page++) {
      const separator = path.includes("?") ? "&" : "?";
      const batch = await request(path + separator + "per_page=100&page=" + page);
      if (!Array.isArray(batch)) fail("GitHub API pagination returned a non-array for " + path);
      result.push(...batch);
      if (batch.length < 100) return result;
    }
    fail("GitHub API pagination exceeded 10,000 records for " + path);
  };
  return { request, paginate };
}

export async function ensureTaskIssues({ api, repo, tasks, specPath, specSha, specPrUrl }) {
  const allIssues = await api.paginate("/repos/" + repo + "/issues?state=all");
  const issues = allIssues.filter(issue => !issue.pull_request);
  const result = new Map();
  for (const task of tasks) {
    const marker = taskMarker(specSha, specPath, task.id);
    const matches = issues.filter(issue => String(issue.body ?? "").includes(marker));
    if (matches.length > 1) fail("Multiple Issues match " + task.id + " for Spec " + specSha);
    let issue;
    if (matches.length === 1) {
      issue = matches[0];
      if (issue.state === "closed" && issue.state_reason !== "completed") {
        fail("Existing task Issue " + issue.number + " was closed without completion");
      }
      const labels = (issue.labels ?? []).map(label => typeof label === "string" ? label : label.name);
      if (!labels.includes(WORKER_LABEL)) {
        await api.request("/repos/" + repo + "/issues/" + issue.number + "/labels", {
          method: "POST", body: { labels: [WORKER_LABEL] }
        });
      }
    } else {
      issue = await api.request("/repos/" + repo + "/issues", {
        method: "POST",
        body: {
          title: task.id + " — " + task.title,
          body: issueBody(task, specPath, specSha, specPrUrl),
          labels: [WORKER_LABEL]
        }
      });
      issues.push(issue);
    }
    result.set(task.id, issue);
  }
  return result;
}

async function findMergedPRForCommit({ api, repo, headSha, mergedPRs }) {
  const closedPRs = mergedPRs ?? await api.paginate(
    "/repos/" + repo + "/pulls?state=closed&base=develop&sort=updated&direction=desc"
  );
  const candidates = closedPRs.filter(pr =>
    pr.merge_commit_sha === headSha &&
    pr.merged_at &&
    pr.base?.ref === "develop" &&
    pr.base?.repo?.full_name === repo &&
    pr.head?.repo?.full_name === repo
  );
  if (candidates.length > 1) fail("Multiple merged same-repository PRs resolve to develop SHA " + headSha);
  if (!candidates.length) return null;
  return api.request("/repos/" + repo + "/pulls/" + candidates[0].number);
}

export async function completeTaskIssue({ api, repo, pr }) {
  const reference = parseWorkerPRBody(pr.body, repo);
  if (!reference) return { completed: false, reason: "legacy-agent-work-pr" };
  const issue = await api.request("/repos/" + repo + "/issues/" + reference.issueNumber);
  const marker = taskMarker(reference.specSha, reference.specPath, reference.taskId);
  if (!String(issue.body ?? "").includes(marker)) fail("Worker PR provenance does not match its task Issue");
  const labels = (issue.labels ?? []).map(label => typeof label === "string" ? label : label.name);
  if (!labels.includes(WORKER_LABEL)) fail("Task Issue is missing the agent-work label");
  if (issue.state === "closed") {
    if (issue.state_reason === "completed") return { completed: false, reason: "already-completed" };
    fail("Task Issue is closed for a reason other than completed");
  }
  const updated = await api.request("/repos/" + repo + "/issues/" + reference.issueNumber, {
    method: "PATCH",
    body: { state: "closed", state_reason: "completed" }
  });
  if (updated.state !== "closed" || updated.state_reason !== "completed") {
    fail("GitHub did not confirm completed state for task Issue " + reference.issueNumber);
  }
  return { completed: true, issueNumber: reference.issueNumber, taskId: reference.taskId };
}

export function readGitFile(root, commitSha, filePath) {
  try {
    return execFileSync("git", ["-C", root, "show", commitSha + ":" + filePath], {
      encoding: "utf8", maxBuffer: 8 * 1024 * 1024
    });
  } catch {
    fail("Spec file " + filePath + " is not present at approved merge SHA " + commitSha);
  }
}

export async function processMergedCommit({
  api, repo, headSha, root = process.cwd(), readQueueState, readFileAtCommit, mergedPRs,
  now = Date.now()
}) {
  const readSpecFile = readFileAtCommit ?? ((sha, filePath) => readGitFile(root, sha, filePath));
  const pr = await findMergedPRForCommit({ api, repo, headSha, mergedPRs });
  if (!pr) return { kind: "no-associated-merged-pr" };

  const isAgentWork = (pr.labels ?? []).some(label => label.name === WORKER_LABEL);
  if (isAgentWork && pr.head?.ref?.startsWith("agent/")) {
    const completion = await completeTaskIssue({ api, repo, pr });
    return { kind: "task-completion", prNumber: pr.number, completion };
  }

  const files = await api.paginate("/repos/" + repo + "/pulls/" + pr.number + "/files");
  const directory = getSpecDirectory(files);
  if (!directory) return { kind: "no-spec-change", prNumber: pr.number };
  if (pr.merged_by?.login !== OWNER_LOGIN) {
    return { kind: "not-owner-merged-spec", prNumber: pr.number };
  }

  const specPath = "specs/" + directory + "/spec.md";
  const planPath = "specs/" + directory + "/plan.md";
  const tasksPath = "specs/" + directory + "/tasks.md";
  const specText = readSpecFile(headSha, specPath);
  if (!/^\*\*Status:\*\*\s*Owner-approved\b/m.test(specText)) {
    return { kind: "not-auto-intake-spec", prNumber: pr.number, specPath };
  }
  const changedPaths = new Set(files.map(file => file.filename));
  // A lightweight approved Spec with no task contract is not a Work Queue intake.
  // If either task-intake file is present, still reject an incomplete triad.
  if (!changedPaths.has(planPath) && !changedPaths.has(tasksPath)) {
    return { kind: "lightweight-approved-spec", prNumber: pr.number, specPath };
  }
  for (const required of [specPath, planPath, tasksPath]) {
    if (!changedPaths.has(required)) {
      fail("Approved Spec intake requires the PR to change all three files: " + required);
    }
  }
  readSpecFile(headSha, planPath);
  const tasksText = readSpecFile(headSha, tasksPath);
  const tasks = parseTasks(tasksText);
  const queueState = await readQueueState();
  defaultWorkerRoute(queueState);
  const graphId = "spec-" + headSha;
  const workIds = tasks.map(task => workId(graphId, task.id));
  const admitted = queueState.works ?? {};
  if (workIds.every(id => Object.hasOwn(admitted, id))) {
    return { kind: "already-admitted", prNumber: pr.number, specPath, specSha: headSha };
  }
  const repository = await api.request("/repos/" + repo);
  if (String(repository.id) !== REPOSITORY_ID) fail("GitHub repository ID differs from the approved Work Queue resource scope");
  const placeholderIssues = new Map(tasks.map(task => [task.id, {
    id: 9999999999, number: 9999999999,
    html_url: "https://github.com/" + repo + "/issues/9999999999"
  }]));
  buildWorkGraph({
    tasks, issues: placeholderIssues, queueState, repo, repositoryId: repository.id,
    specPath, specSha: headSha, specPrUrl: pr.html_url, now
  });
  const issues = await ensureTaskIssues({ api, repo, tasks, specPath, specSha: headSha, specPrUrl: pr.html_url });
  const graph = buildWorkGraph({
    tasks, issues, queueState, repo, repositoryId: repository.id,
    specPath, specSha: headSha, specPrUrl: pr.html_url, now
  });
  return { kind: "spec-intake", prNumber: pr.number, specPath, specSha: headSha, issueCount: issues.size, graph };
}

export async function processDevelopRange({ api, repo, headSha, root = process.cwd(), readQueueState, commitShas } = {}) {
  const current = await api.request("/repos/" + repo + "/branches/develop");
  if (current.commit?.sha !== headSha) return { kind: "stale-develop-head", graphs: [], results: [] };
  const installSha = execFileSync("git", [
    "-C", root, "log", "--first-parent", "--diff-filter=A", "-1", "--format=%H", "--", "scripts/ci/spec-task-producer.mjs"
  ], { encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/.test(installSha)) fail("Could not locate the Producer installation commit");
  const commits = commitShas ?? execFileSync("git", [
    "-C", root, "rev-list", "--reverse", "--first-parent", installSha + ".." + headSha
  ], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  if (!commits.length) return { kind: "develop-range", scanned: 0, graphs: [], results: [] };
  const mergedPRs = await api.paginate(
    "/repos/" + repo + "/pulls?state=closed&base=develop&sort=updated&direction=desc"
  );
  let queueStatePromise;
  const cachedQueueRead = () => {
    if (!queueStatePromise) queueStatePromise = Promise.resolve(readQueueState());
    return queueStatePromise;
  };
  const results = [];
  const graphs = [];
  for (const commitSha of commits) {
    const result = await processMergedCommit({
      api, repo, headSha: commitSha, root, readQueueState: cachedQueueRead, mergedPRs
    });
    results.push(result);
    if (result.graph) graphs.push(result);
  }
  return { kind: "develop-range", scanned: commits.length, graphs, results };
}

// The pinned GH-AW v1.0.1 CLI sometimes emits --json on stderr even on success.
// The existing native-queue workflow handles this with 2>&1. Keep both streams
// separate here so a nonzero command cannot be mistaken for a valid replay.
export function readNativeQueueState(repo, spawn = spawnSync) {
  const result = spawn("gh", ["aw", "work-queue", "--repo", repo, "replay", "--json"], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    fail("Native GH-AW Work Queue replay failed; admission was not attempted");
  }
  const output = String(result.stdout ?? "").trim() || String(result.stderr ?? "").trim();
  if (!output) fail("Native GH-AW Work Queue replay returned no JSON");
  try {
    return JSON.parse(output);
  } catch {
    fail("Native GH-AW Work Queue replay returned malformed JSON");
  }
}

// A workflow_run continuation executes from main: GITHUB_SHA and GITHUB_REF_NAME
// therefore describe main, NOT the verified develop Check that triggered it.
export function resolveProducerHead(env, suppliedEvent) {
  if (env.GITHUB_EVENT_NAME === "push") {
    return env.GITHUB_REF_NAME === "develop" ? env.GITHUB_SHA : null;
  }
  if (env.GITHUB_EVENT_NAME !== "workflow_run") return null;
  const event = suppliedEvent ?? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const run = event.workflow_run;
  if (event.action !== "completed" ||
      event.repository?.full_name !== env.GITHUB_REPOSITORY ||
      run?.status !== "completed" || run.conclusion !== "success" ||
      run.path !== ".github/workflows/check.yml" ||
      run.head_branch !== "develop" ||
      !["push", "workflow_dispatch"].includes(run.event) ||
      run.head_repository?.full_name !== env.GITHUB_REPOSITORY) {
    return null;
  }
  return run.head_sha;
}

export async function runProducer({ env = process.env, api, root = process.cwd(), readQueueState } = {}) {
  const headSha = resolveProducerHead(env);
  if (!headSha) return { kind: "not-a-verified-develop-check" };
  const repo = env.GITHUB_REPOSITORY;
  if (!repo || !/^[0-9a-f]{40}$/.test(headSha)) fail("Missing repository or exact develop SHA");
  if (!api) api = createGitHubApi(env.GH_TOKEN);
  return processDevelopRange({
    api, repo, headSha, root,
    readQueueState: readQueueState ?? (() => readNativeQueueState(repo))
  });
}

async function main() {
  const env = process.env;
  if (!resolveProducerHead(env)) {
    console.log("Spec Producer skipped: not a verified develop Check continuation.");
    return;
  }
  const outputDirectory = env.SPEC_WORK_GRAPH_DIR;
  if (!outputDirectory) fail("SPEC_WORK_GRAPH_DIR is required");
  mkdirSync(outputDirectory, { recursive: true });
  const result = await runProducer();
  for (const item of result.graphs ?? []) {
    const outputPath = join(outputDirectory, item.specSha + ".json");
    writeFileSync(outputPath, JSON.stringify(item.graph, null, 2) + "\n", "utf8");
    console.log("Prepared " + item.graph.length + " Work nodes for Spec " + item.specSha);
  }
  console.log("Spec Producer result: " + result.kind + "; scanned " + (result.scanned ?? 0) + " merged develop commits");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error("::error::Spec task Producer: " + (error?.message ?? String(error)));
    process.exitCode = 1;
  });
}
