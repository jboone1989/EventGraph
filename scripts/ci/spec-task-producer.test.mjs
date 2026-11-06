import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildWorkGraph, canonical, completeTaskIssue, ensureTaskIssues, getSpecDirectory,
  issueBody, parseTasks, parseWorkerPRBody, taskMarker, workId, processMergedCommit, processDevelopRange, readNativeQueueState, resolveProducerHead
} from "./spec-task-producer.mjs";

const validTasks = [
  "## Work Items", "",
  "### T001 — Create the API",
  "**Scope:** Add the API endpoint.",
  "**Depends on:** none",
  "**Acceptance:**",
  "- Create the endpoint.",
  "- Add tests.", "",
  "### T002 — Add the UI",
  "**Scope:** Add the management page.",
  "**Depends on:** T001",
  "**Acceptance:**",
  "- Display the data.",
  "- Add a test action."
].join("\n");

const specPath = "specs/example/spec.md";
const specSha = "a".repeat(40);
const specPrUrl = "https://github.com/jboone1989/EventGraph/pull/500";
const repo = "jboone1989/EventGraph";
const issues = new Map([
  ["T001", { id: 9001, number: 101, html_url: "https://github.com/" + repo + "/issues/101" }],
  ["T002", { id: 9002, number: 102, html_url: "https://github.com/" + repo + "/issues/102" }]
]);
const queueState = {
  grants_paused: false,
  admission_paused: false,
  policy: {
    authorization: "aw",
    limits: { payload_bytes: 16384, predecessors: 64, assignment_bytes: 49152 },
    pools: {
      default: {
        default_profile: "eventgraph-worker",
        profiles: {
          "eventgraph-worker": { trust_domain: "default", logical_contract: "b".repeat(64) }
        }
      }
    }
  },
  deployments: {
    default: {
      "eventgraph-worker": {
        current_ref: "c".repeat(40),
        current_contract: "d".repeat(64),
        revisions: { ["c".repeat(40)]: { available: true } }
      }
    }
  }
};

test("accepts official GH-AW replay JSON emitted on stderr", () => {
  const projection = { policy: queueState.policy, works: {}, grants_paused: false };
  let called = false;
  const value = readNativeQueueState(repo, (command, args, options) => {
    called = true;
    assert.equal(command, "gh");
    assert.deepEqual(args, ["aw", "work-queue", "--repo", repo, "replay", "--json"]);
    assert.equal(options.encoding, "utf8");
    return { status: 0, stdout: "", stderr: JSON.stringify(projection) };
  });
  assert.equal(called, true);
  assert.deepEqual(value, projection);
});

test("accepts official GH-AW replay JSON emitted on stdout", () => {
  const projection = { works: {}, admission_paused: false };
  assert.deepEqual(readNativeQueueState(repo, () => ({
    status: 0, stdout: JSON.stringify(projection), stderr: ""
  })), projection);
});

test("fails closed for nonzero replay or missing JSON", () => {
  assert.throws(() => readNativeQueueState(repo, () => ({
    status: 1, stdout: "", stderr: "{ }"
  })), /replay failed/);
  assert.throws(() => readNativeQueueState(repo, () => ({
    status: 0, stdout: "", stderr: ""
  })), /returned no JSON/);
  assert.throws(() => readNativeQueueState(repo, () => ({
    status: 0, stdout: "", stderr: "not-json"
  })), /malformed JSON/);
});

test("parses canonical task blocks and preserves dependency order", () => {
  const tasks = parseTasks(validTasks);
  assert.deepEqual(tasks.map(task => task.id), ["T001", "T002"]);
  assert.deepEqual(tasks[1].dependsOn, ["T001"]);
  assert.deepEqual(tasks[0].acceptanceCriteria, ["Create the endpoint.", "Add tests."]);
});

test("rejects malformed, duplicate, missing and cyclic task dependencies", () => {
  assert.throws(() => parseTasks(validTasks.replace("**Scope:** Add the API endpoint.", "**Scope:** ")), /empty Scope/);
  assert.throws(() => parseTasks(validTasks.replace("### T002 — Add the UI", "### T001 — Add the UI")), /Duplicate Task ID/);
  assert.throws(() => parseTasks(validTasks.replace("**Depends on:** T001", "**Depends on:** T009")), /unknown dependency/);
  assert.throws(() => parseTasks(validTasks.replace("**Depends on:** T001", "**Depends on:** T001, T001")), /duplicate dependencies/);
  assert.throws(() => parseTasks(validTasks.replace("**Depends on:** none", "**Depends on:** T002")), /cycle/);
  assert.throws(() => parseTasks("## Work Items\n\n### T001 — Missing fields"), /Scope, Depends on and Acceptance/);
});

test("uses GH-AW canonical graph and node identity", () => {
  assert.equal(canonical({ node_key: "T001", graph_id: "spec-" + specSha }), canonical({ graph_id: "spec-" + specSha, node_key: "T001" }));
  assert.equal(workId("spec-" + specSha, "T001"), workId("spec-" + specSha, "T001"));
  assert.notEqual(workId("spec-" + specSha, "T001"), workId("spec-" + specSha, "T002"));
});

test("recognizes exactly one complete Spec directory from merged PR files", () => {
  const files = [
    { filename: "specs/example/spec.md" },
    { filename: "specs/example/plan.md" },
    { filename: "specs/example/tasks.md" },
    { filename: "specs/README.md" }
  ];
  assert.equal(getSpecDirectory(files), "example");
  assert.equal(getSpecDirectory([{ filename: "README.md" }]), null);
  assert.equal(getSpecDirectory(files.slice(0, 2)), "example");
  assert.equal(getSpecDirectory([{ filename: "specs/example/tasks.md" }]), null);
  assert.throws(() => getSpecDirectory([...files, { filename: "specs/other/spec.md" }]), /only one Spec directory/);
});

test("skips a legacy owner-approved Spec PR without a work-intake contract", async () => {
  const legacy = {
    number: 325,
    merged_at: "2026-11-03T10:18:00Z",
    merge_commit_sha: specSha,
    merged_by: { login: "jboone1989" },
    base: { ref: "develop", repo: { full_name: repo } },
    head: { ref: "spec/provider-model-unified-setup", repo: { full_name: repo } },
    labels: []
  };
  const api = {
    request: async path => {
      if (path.endsWith("/pulls/325")) return legacy;
      throw new Error("Legacy PR must not request Issues or Work: " + path);
    },
    paginate: async path => {
      if (path.includes("/pulls?state=closed")) return [legacy];
      if (path.includes("/pulls/325/files")) return [
        { filename: "specs/admin-provider-model-unification/spec.md" }
      ];
      throw new Error("Legacy PR must not request Issues or Work: " + path);
    }
  };
  const result = await processMergedCommit({
    api, repo, headSha: specSha,
    readFileAtCommit: (_sha, path) => {
      assert.equal(path, "specs/admin-provider-model-unification/spec.md");
      return "# Unified provider and model setup\n\n## Owner approval (2026-11-03)\n";
    },
    readQueueState: async () => { throw new Error("Legacy Spec must not read queue state"); }
  });
  assert.equal(result.kind, "not-auto-intake-spec");
});

test("skips a lightweight owner-approved Spec with no plan or tasks without blocking develop", async () => {
  const approved = {
    number: 328, merged_at: "2026-11-03T10:40:00Z", merge_commit_sha: specSha,
    merged_by: { login: "jboone1989" },
    base: { ref: "develop", repo: { full_name: repo } },
    head: { ref: "spec/vm13-writable-production-preview", repo: { full_name: repo } }, labels: []
  };
  const api = {
    request: async path => {
      if (path.endsWith("/pulls/328")) return approved;
      throw new Error("Lightweight Spec must not request Issues or Work: " + path);
    },
    paginate: async path => {
      if (path.includes("/pulls?state=closed")) return [approved];
      if (path.includes("/pulls/328/files")) return [
        { filename: "specs/vm13-writable-preview/spec.md" }
      ];
      throw new Error("Lightweight Spec must not request Issues or Work: " + path);
    }
  };
  const result = await processMergedCommit({
    api, repo, headSha: specSha,
    readFileAtCommit: (_sha, path) => {
      assert.equal(path, "specs/vm13-writable-preview/spec.md");
      return "**Status:** Owner-approved (2026-11-03).\\n";
    },
    readQueueState: async () => { throw new Error("Lightweight Spec must not read queue state"); }
  });
  assert.equal(result.kind, "lightweight-approved-spec");
});

test("rejects a declared auto-intake Spec that omits tasks.md", async () => {
  const approved = {
    number: 500, merged_at: "2026-11-03T10:18:00Z", merge_commit_sha: specSha,
    merged_by: { login: "jboone1989" },
    base: { ref: "develop", repo: { full_name: repo } },
    head: { ref: "spec/example", repo: { full_name: repo } }, labels: []
  };
  const api = {
    request: async path => {
      if (path.endsWith("/pulls/500")) return approved;
      throw new Error("No Issue/Work request allowed: " + path);
    },
    paginate: async path => {
      if (path.includes("/pulls?state=closed")) return [approved];
      if (path.includes("/pulls/500/files")) return [
        { filename: "specs/example/spec.md" }, { filename: "specs/example/plan.md" }
      ];
      throw new Error("No Issue/Work request allowed: " + path);
    }
  };
  await assert.rejects(() => processMergedCommit({
    api, repo, headSha: specSha,
    readFileAtCommit: () => "**Status:** Owner-approved\n",
    readQueueState: async () => { throw new Error("Incomplete Spec must not read queue state"); }
  }), /requires the PR to change all three files: specs\/example\/tasks\.md/);
});

test("builds a native graph with policy-derived routing and completed Issue dependencies", () => {
  const tasks = parseTasks(validTasks);
  const graph = buildWorkGraph({ tasks, issues, queueState, repo, repositoryId: "1416699488", specPath, specSha, specPrUrl, now: 1234 });
  assert.equal(graph.length, 2);
  assert.equal(graph[0].worker_profile, "eventgraph-worker");
  assert.equal(graph[0].logical_contract, "b".repeat(64));
  assert.equal(graph[0].batch_trust_domain, "default");
  assert.deepEqual(graph[0].depends_on, []);
  assert.deepEqual(graph[1].depends_on, [{
    kind: "issue",
    resource: {
      kind: "issue", host: "github.com", repository: repo,
      repository_id: "1416699488", resource_id: "9001", number: "101"
    },
    condition: "completed"
  }]);
  assert.deepEqual(graph[0].payload.effect_contract, {
    version: 1, outputs: [{ type: "create_pull_request", min: 1, max: 1 }]
  });
  assert.deepEqual(graph[0].payload.resource_scope, {
    version: 1, resources: [{ host: "github.com", repository: repo, repository_id: "1416699488" }]
  });
  assert.equal(graph[0].payload.spec_sha, specSha);
  assert.equal(graph[0].payload.issue_number, 101);
  assert.equal(graph[0].enqueued, 1234);
});

test("refuses a paused or incomplete native queue policy", () => {
  const tasks = parseTasks(validTasks);
  assert.throws(() => buildWorkGraph({
    tasks, issues, queueState: { ...queueState, grants_paused: true }, repo, specPath, specSha, specPrUrl
  }), /Queue is paused/);
  assert.throws(() => buildWorkGraph({
    tasks, issues, queueState: { policy: { authorization: "aw", pools: {} } }, repo, specPath, specSha, specPrUrl
  }), /default Worker pool/);
});

test("rejects unavailable Worker deployment and native payload overflow", () => {
  const tasks = parseTasks(validTasks);
  const unavailable = {
    ...queueState,
    deployments: {
      default: {
        "eventgraph-worker": {
          current_ref: "c".repeat(40), current_contract: "d".repeat(64),
          revisions: { ["c".repeat(40)]: { available: false } }
        }
      }
    }
  };
  assert.throws(() => buildWorkGraph({
    tasks, issues, queueState: unavailable, repo, repositoryId: "1416699488", specPath, specSha, specPrUrl
  }), /no available installed deployment/);
  const oversized = [{
    id: "T001", title: "Large task", scope: "Large scope",
    dependsOn: [], acceptanceCriteria: ["x".repeat(20000)]
  }];
  const largeIssues = new Map([["T001", issues.get("T001")]]);
  assert.throws(() => buildWorkGraph({
    tasks: oversized, issues: largeIssues, queueState, repo,
    repositoryId: "1416699488", specPath, specSha, specPrUrl
  }), /payload exceeds the native/);
});

test("creates stable Issue marker and full task body", () => {
  const task = parseTasks(validTasks)[0];
  const marker = taskMarker(specSha, specPath, task.id);
  const body = issueBody(task, specPath, specSha, specPrUrl);
  assert.ok(body.includes(marker));
  assert.ok(body.includes("**Spec:** " + specPath + "@" + specSha));
  assert.ok(body.includes("Create the endpoint."));
});

test("reuses an existing Issue and restores its Project-triggering label", async () => {
  const task = parseTasks(validTasks)[0];
  const existing = {
    number: 101, html_url: "https://github.com/" + repo + "/issues/101",
    body: taskMarker(specSha, specPath, task.id), state: "open", labels: []
  };
  const calls = [];
  const api = {
    paginate: async () => [existing],
    request: async (path, options) => { calls.push({ path, options }); return {}; }
  };
  const result = await ensureTaskIssues({ api, repo, tasks: [task], specPath, specSha, specPrUrl });
  assert.equal(result.get("T001").number, 101);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/repos/" + repo + "/issues/101/labels");
});

test("creates a missing Issue with the existing agent-work label", async () => {
  const task = parseTasks(validTasks)[0];
  let created;
  const api = {
    paginate: async () => [],
    request: async (path, options) => {
      assert.equal(path, "/repos/" + repo + "/issues");
      created = options.body;
      return { number: 201, html_url: "https://github.com/" + repo + "/issues/201", body: options.body.body };
    }
  };
  const result = await ensureTaskIssues({ api, repo, tasks: [task], specPath, specSha, specPrUrl });
  assert.equal(result.get("T001").number, 201);
  assert.deepEqual(created.labels, ["agent-work"]);
  assert.ok(created.body.includes(taskMarker(specSha, specPath, "T001")));
});

test("parses only complete, repository-matching Worker PR provenance", () => {
  const body = [
    "Issue: #101",
    "Issue URL: https://github.com/" + repo + "/issues/101",
    "Task: T001",
    "Spec: " + specPath + "@" + specSha
  ].join("\n");
  assert.deepEqual(parseWorkerPRBody(body, repo), { issueNumber: "101", taskId: "T001", specPath, specSha });
  assert.equal(parseWorkerPRBody("Legacy PR without task metadata", repo), null);
  assert.throws(() => parseWorkerPRBody(body.replace("/issues/101", "/issues/102"), repo), /does not match/);
});

test("closes a matching task Issue only with completed state reason", async () => {
  const body = [
    "Issue: #101",
    "Issue URL: https://github.com/" + repo + "/issues/101",
    "Task: T001",
    "Spec: " + specPath + "@" + specSha
  ].join("\n");
  const issue = {
    number: 101, state: "open", body: taskMarker(specSha, specPath, "T001"),
    labels: [{ name: "agent-work" }]
  };
  const calls = [];
  const api = {
    request: async (path, options = {}) => {
      calls.push({ path, options });
      if (options.method === "PATCH") return { ...issue, state: "closed", state_reason: "completed" };
      return issue;
    }
  };
  const result = await completeTaskIssue({ api, repo, pr: { body } });
  assert.equal(result.completed, true);
  assert.deepEqual(calls[1].options.body, { state: "closed", state_reason: "completed" });
});

test("does not re-close completed Issues and rejects unrelated closed Issues", async () => {
  const body = [
    "Issue: #101",
    "Issue URL: https://github.com/" + repo + "/issues/101",
    "Task: T001",
    "Spec: " + specPath + "@" + specSha
  ].join("\n");
  const completed = {
    number: 101, state: "closed", state_reason: "completed",
    body: taskMarker(specSha, specPath, "T001"), labels: [{ name: "agent-work" }]
  };
  const api = { request: async () => completed };
  assert.equal((await completeTaskIssue({ api, repo, pr: { body } })).reason, "already-completed");
  const notPlanned = { ...completed, state_reason: "not_planned" };
  await assert.rejects(() => completeTaskIssue({ api: { request: async () => notPlanned }, repo, pr: { body } }), /other than completed/);
});

test("serial catch-up scans every first-parent commit after Producer installation", async () => {
  const root = mkdtempSync(join(tmpdir(), "eventgraph-range-"));
  mkdirSync(join(root, "scripts", "ci"), { recursive: true });
  execFileSync("git", ["-C", root, "init", "-q"]);
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "EventGraph Test"]);
  writeFileSync(join(root, "scripts", "ci", "spec-task-producer.mjs"), "installed\n");
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "install producer"]);
  writeFileSync(join(root, "README.md"), "first\n");
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "first develop commit"]);
  writeFileSync(join(root, "README.md"), "second\n");
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "second develop commit"]);
  const headSha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  let closedPRLookups = 0;
  let queueReads = 0;
  const api = {
    request: async path => {
      assert.equal(path, "/repos/" + repo + "/branches/develop");
      return { commit: { sha: headSha } };
    },
    paginate: async path => {
      assert.ok(path.includes("/pulls?state=closed&base=develop"));
      closedPRLookups++;
      return [];
    }
  };
  try {
    const result = await processDevelopRange({
      api, repo, headSha, root,
      readQueueState: async () => { queueReads++; return queueState; }
    });
    assert.equal(result.scanned, 2);
    assert.equal(result.results.length, 2);
    assert.ok(result.results.every(item => item.kind === "no-associated-merged-pr"));
    assert.equal(closedPRLookups, 1);
    assert.equal(queueReads, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Spec intake uses the exact merge SHA and builds its graph", async () => {
  const root = mkdtempSync(join(tmpdir(), "eventgraph-spec-"));
  const directory = join(root, "specs", "example");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "spec.md"), "**Status:** Owner-approved\n");
  writeFileSync(join(directory, "plan.md"), "Plan\n");
  writeFileSync(join(directory, "tasks.md"), validTasks);
  const mergedPr = {
    number: 500, html_url: specPrUrl, merged_at: "2026-11-03T00:00:00Z",
    merged_by: { login: "jboone1989" }, merge_commit_sha: specSha,
    base: { ref: "develop", repo: { full_name: repo } },
    head: { ref: "spec/example", repo: { full_name: repo } }, labels: []
  };
  let createdNumber = 200;
  const api = {
    request: async (path, options = {}) => {
      if (path.endsWith("/branches/develop")) return { commit: { sha: specSha } };
      if (path === "/repos/" + repo) return { id: 1416699488 };
      if (path.endsWith("/pulls/500")) return mergedPr;
      if (path.endsWith("/issues") && options.method === "POST") {
        createdNumber++;
        return { id: 9900 + createdNumber, number: createdNumber, html_url: "https://github.com/" + repo + "/issues/" + createdNumber, body: options.body.body };
      }
      throw new Error("Unexpected request: " + path);
    },
    paginate: async path => {
      if (path.includes("/pulls?state=closed")) return [{
        number: 500, merge_commit_sha: specSha, merged_at: mergedPr.merged_at,
        base: mergedPr.base, head: mergedPr.head
      }];
      if (path.includes("/pulls/500/files")) return [
        { filename: "specs/example/spec.md" },
        { filename: "specs/example/plan.md" },
        { filename: "specs/example/tasks.md" }
      ];
      if (path.includes("/issues?state=all")) return [];
      throw new Error("Unexpected pagination: " + path);
    }
  };
  try {
    const result = await processMergedCommit({
      api, repo, headSha: specSha, root,
      readQueueState: async () => queueState,
      readFileAtCommit: (_sha, filePath) => {
        if (filePath === "specs/example/spec.md") return "**Status:** Owner-approved\n";
        if (filePath === "specs/example/plan.md") return "Plan\n";
        if (filePath === "specs/example/tasks.md") return validTasks;
        throw new Error("Unexpected Spec file: " + filePath);
      },
      now: 1234
    });
    assert.equal(result.kind, "spec-intake");
    assert.equal(result.specSha, specSha);
    assert.equal(result.graph.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Producer uses the verified develop Check SHA from a workflow_run event, not main GITHUB_SHA", () => {
  const checkedHead = "b".repeat(40);
  const env = {
    GITHUB_EVENT_NAME: "workflow_run", GITHUB_REF_NAME: "main",
    GITHUB_SHA: "a".repeat(40), GITHUB_REPOSITORY: repo
  };
  const event = {
    action: "completed",
    repository: { full_name: repo },
    workflow_run: {
      status: "completed", conclusion: "success", path: ".github/workflows/check.yml",
      head_branch: "develop", head_sha: checkedHead, event: "push",
      head_repository: { full_name: repo }
    }
  };
  assert.equal(resolveProducerHead(env, event), checkedHead);
  assert.equal(resolveProducerHead(env, {
    ...event, workflow_run: { ...event.workflow_run, event: "workflow_dispatch" }
  }), checkedHead);
  for (const invalid of [
    { ...event, action: "requested" },
    { ...event, repository: { full_name: "other/repo" } },
    { ...event, workflow_run: { ...event.workflow_run, conclusion: "failure" } },
    { ...event, workflow_run: { ...event.workflow_run, head_branch: "main" } },
    { ...event, workflow_run: { ...event.workflow_run, path: ".github/workflows/other.yml" } },
    { ...event, workflow_run: { ...event.workflow_run, head_repository: { full_name: "fork/repo" } } },
    { ...event, workflow_run: { ...event.workflow_run, event: "pull_request" } }
  ]) {
    assert.equal(resolveProducerHead(env, invalid), null);
  }
  assert.equal(resolveProducerHead({ ...env, GITHUB_EVENT_NAME: "pull_request" }), null);
  assert.equal(resolveProducerHead({
    ...env, GITHUB_EVENT_NAME: "push", GITHUB_REF_NAME: "develop"
  }), env.GITHUB_SHA);
  assert.equal(resolveProducerHead({
    ...env, GITHUB_EVENT_NAME: "push", GITHUB_REF_NAME: "main"
  }), null);
});
