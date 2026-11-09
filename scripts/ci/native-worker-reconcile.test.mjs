import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(".github/workflows/eventgraph-native-queue-events.yml", "utf8");
const lines = workflow.split(/\r?\n/);
const dispatchId = "d_" + "a".repeat(64) + "_1";
const runTitle = "gh-aw work-queue " + dispatchId;

function segment(start, end) {
  const i = workflow.indexOf(start);
  const j = workflow.indexOf(end, i + start.length);
  assert.ok(i >= 0 && j > i, "missing workflow contract section");
  return workflow.slice(i, j);
}

const jobGate = segment("  resume:\n", "\n    runs-on:");
const reconcileStep = segment("      - name: Reconcile verified terminal native Worker\n", "      - name: Admit approved Spec tasks");
const dispatchStep = segment("      - name: Dispatch at most one eligible native Work\n", "\n          gh aw work-queue --repo");

function shellFromStep() {
  const offset = lines.findIndex((line) => line === "      - name: Reconcile verified terminal native Worker");
  assert.ok(offset > -1);
  let start = offset + 1;
  while (start < lines.length && lines[start] !== "        run: |") start++;
  assert.ok(start < lines.length, "reconciliation step has no run script");
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("          ")) body.push(line.slice(10));
    else if (line.trim() === "") body.push("");
    else break;
  }
  return body.join("\n") + "\n";
}

const reconciliationShell = shellFromStep();
const cliStub = `
gh() {
  printf '%s\\n' "$*" >> "$MOCK_CALLS"
  if [[ "\${MOCK_FAIL:-0}" == 1 ]]; then return 41; fi
  if [[ "${MOCK_OUTPUT_STREAM:-stdout}" == "stderr" ]]; then
    printf '%s\\n' "$MOCK_RESPONSE" >&2
  else
    printf '%s\\n' "$MOCK_RESPONSE"
  fi
}
`;

function invoke({ title = runTitle, token = "fixture-token", fail = false, response = '{"state":"bound","reason":"native_released_delivery_independent"}', conclusion = "failure", outputStream = "stdout" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "eventgraph-reconcile-"));
  const callsPath = join(dir, "calls");
  try {
    const r = spawnSync("bash", ["-c", cliStub + reconciliationShell], {
      encoding: "utf8",
      env: {
        ...process.env,
        GH_TOKEN: token,
        GITHUB_REPOSITORY: "jboone1989/EventGraph",
        WORKER_DISPLAY_TITLE: title,
        WORKER_RUN_ID: "12345",
        WORKER_RUN_URL: "https://github.com/jboone1989/EventGraph/actions/runs/12345",
        WORKER_CONCLUSION: conclusion,
        MOCK_CALLS: callsPath,
        MOCK_FAIL: fail ? "1" : "0",
        MOCK_RESPONSE: response,
        MOCK_OUTPUT_STREAM: outputStream,
      },
    });
    let calls = [];
    try { calls = readFileSync(callsPath, "utf8").trim().split("\n"); } catch { /* never invoked */ }
    return { ...r, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("same-repository completed native Worker bypasses enable flag and conclusion allowlist", () => {
  assert.match(jobGate, /head_repository\.full_name == github\.repository/);
  assert.match(jobGate, /eventgraph-worker\.lock\.yml/);
  assert.match(jobGate, /workflow_run\.event == 'workflow_dispatch'/);
  assert.match(jobGate, /workflow_run\.status == 'completed'/);
  const beforeFlag = jobGate.slice(0, jobGate.indexOf("vars.EVENTGRAPH_NATIVE_QUEUE_EVENTS_ENABLED"));
  assert.match(beforeFlag, /workflow_run\.status == 'completed'/);
  assert.doesNotMatch(beforeFlag, /workflow_run\.conclusion/);
  assert.match(reconcileStep, /workflow_run\.status == 'completed'/);
  assert.doesNotMatch(reconcileStep, /workflow_run\.conclusion/);
});

test("every terminal conclusion uses one exact pinned official native CLI call", () => {
  for (const conclusion of ["success", "failure", "cancelled", "timed_out", "startup_failure", "skipped", "future_conclusion"]) {
    const r = invoke({ conclusion });
    assert.equal(r.status, 0, conclusion + ": " + r.stderr);
    assert.deepEqual(r.calls, ["aw work-queue --repo jboone1989/EventGraph reconcile --dispatch-id " + dispatchId + " --json"]);
    assert.match(r.stdout, /native_released_delivery_independent/);
  }
});

test("official reconcile JSON written to stderr is captured and validated", () => {
  const response = JSON.stringify({
    dispatch_id: dispatchId,
    state: "bound",
    reason: "native_released_delivery_independent",
    changed: true,
    publication: { commit: { request: { operations: [{ kind: "Release", dispatch_id: dispatchId }] } } },
  });
  const r = invoke({ outputStream: "stderr", response });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.deepEqual(r.calls, ["aw work-queue --repo jboone1989/EventGraph reconcile --dispatch-id " + dispatchId + " --json"]);
  assert.match(r.stdout, /native_released_delivery_independent/);
  assert.doesNotMatch(r.stdout, /Malformed native reconciliation response/);
});

test("non-JSON output on stderr fails closed even when CLI exits successfully", () => {
  const r = invoke({ outputStream: "stderr", response: "unexpected diagnostic" });
  assert.notEqual(r.status, 0);
  assert.equal(r.calls.length, 1);
  assert.match(r.stdout, /Malformed native reconciliation response/);
});
test("missing token and invalid or ambiguous titles fail closed without CLI", () => {
  const variants = [
    "gh-aw work-queue d_" + "b".repeat(63) + "_1",
    runTitle + " trailing text",
    "prefix " + runTitle,
    runTitle + "\n" + runTitle,
    "gh-aw work-queue d_" + "b".repeat(64) + "_0",
    "worker #123",
  ];
  for (const title of variants) {
    const r = invoke({ title });
    assert.notEqual(r.status, 0, title);
    assert.deepEqual(r.calls, []);
    assert.match(r.stderr + r.stdout, /Unrecognized native Worker run title/);
  }
  const missing = invoke({ token: "" });
  assert.notEqual(missing.status, 0);
  assert.deepEqual(missing.calls, []);
  assert.match(missing.stdout, /GH_AW_GITHUB_TOKEN missing/);
});

test("CLI or malformed response failure is visible and never reported as release", () => {
  const cli = invoke({ fail: true });
  assert.notEqual(cli.status, 0);
  assert.equal(cli.calls.length, 1);
  assert.match(cli.stdout, /Manual recovery:/);
  const malformed = invoke({ response: "not-json" });
  assert.notEqual(malformed.status, 0);
  assert.equal(malformed.calls.length, 1);
  assert.match(malformed.stdout, /Malformed native reconciliation response/);
});

test("duplicate event repeats idempotent official reconcile, not a custom Release", () => {
  for (let n = 0; n < 2; n++) {
    const r = invoke({ response: '{"state":"bound","reason":"native_already_reconciled"}' });
    assert.equal(r.status, 0);
    assert.equal(r.calls.length, 1);
    assert.match(r.stdout, /native_already_reconciled/);
  }
  assert.doesNotMatch(reconciliationShell, /work-queue\s+(dispatch|claim|submit-graph)/);
});

test("dispatch remains gated by flag, success, PR serialization and native pause", () => {
  assert.match(dispatchStep, /EVENTGRAPH_NATIVE_QUEUE_EVENTS_ENABLED == 'true'/);
  assert.match(dispatchStep, /workflow_run\.conclusion == 'success'/);
  assert.match(dispatchStep, /--label agent-work/);
  assert.match(dispatchStep, /grants_paused == false/);
  assert.match(dispatchStep, /scheduling_eligible/);
  assert.ok(workflow.indexOf("Reconcile verified terminal native Worker") < workflow.indexOf("Dispatch at most one eligible native Work"));
  assert.match(jobGate, /pull_request\.merged == false/);
  assert.match(jobGate, /workflow_run\.path == '\.github\/workflows\/check\.yml'/);
});

test("reconciliation shell passes bash syntax validation and CI registers these tests", () => {
  const syntax = spawnSync("bash", ["-n"], { input: reconciliationShell, encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
  const ci = readFileSync(".github/workflows/check.yml", "utf8");
  assert.match(ci, /scripts\/ci\/native-worker-reconcile\.test\.mjs/);
});

test("continuation contains exactly one Spec intake and one paid dispatch step", () => {
  assert.equal((workflow.match(/- name: Admit approved Spec tasks only from current verified develop/g) || []).length, 1);
  assert.equal((workflow.match(/- name: Dispatch at most one eligible native Work/g) || []).length, 1);
  assert.equal((workflow.match(/- name: Reconcile verified terminal native Worker/g) || []).length, 1);
  assert.equal((workflow.match(/gh aw work-queue --repo "\$GITHUB_REPOSITORY" dispatch eventgraph-dispatcher --wait/g) || []).length, 1);
  const dispatch = workflow.slice(workflow.indexOf("      - name: Dispatch at most one eligible native Work"));
  assert.doesNotMatch(dispatch, /reconcile --dispatch-id|WORKER_DISPLAY_TITLE|native_title_re/);
});
