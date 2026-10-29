// Execute the real Action shell preflight with a fake gh status endpoint.
// This validates status-based dedupe without contacting GitHub or running a model.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/claude-pr-dispatch.yml", import.meta.url), "utf8");
const runBlock = workflow.match(/      - name: Check for an existing GLM verdict at the exact Check SHA[\s\S]*?\n        run: \|\n([\s\S]*?)\n  official-glm-review:/)?.[1];
assert.ok(runBlock, "missing real dedupe step");
const script = runBlock.split("\n").map(line => line.replace(/^          /, "")).join("\n");

function run(state: string, sha = "a".repeat(40)) {
  const dir = mkdtempSync(join(tmpdir(), "eg-review-status-"));
  try {
    const cli = join(dir, "gh"), out = join(dir, "action-output");
    writeFileSync(cli, `#!/bin/sh
printf '%s\\n' "$FAKE_STATUS"
test "$FAKE_STATUS" != api-failed
`);
    chmodSync(cli, 0o700);
    const result = spawnSync("bash", ["-c", script], {
      encoding: "utf8",
      env: { ...process.env, PATH: dir + ":" + process.env.PATH,
        CHECK_SHA: sha, GITHUB_OUTPUT: out,
        GITHUB_REPOSITORY: "jboone1989/EventGraph", FAKE_STATUS: state },
    });
    let outputs = "";
    try { outputs = readFileSync(out, "utf8"); } catch { /* no output on rejection */ }
    return { status: result.status, stderr: result.stderr, outputs };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("completed status on the exact SHA prevents duplicate paid review", () => {
  for (const state of ["success", "failure", "pending"]) {
    const result = run(state);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.outputs, /required=false/);
  }
});

test("missing or infrastructure-error review may retry after a successful Check", () => {
  for (const state of ["missing", "error"]) {
    const result = run(state);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.outputs, /required=true/);
  }
});

test("unknown status fails closed rather than marking the reviewer complete", () => {
  const result = run("unknown");
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.outputs, /required=(?:true|false)/);
});

test("invalid SHA or failed API cannot give review-required output", () => {
  for (const result of [run("missing", "not-a-sha"), run("api-failed")]) {
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.outputs, /required=true/);
  }
});

test("caller still invokes official central hosted GLM verifier, not old runner", () => {
  assert.match(workflow, /needs: review-status/);
  assert.match(workflow, /if: needs\.review-status\.outputs\.required == 'true'/);
  assert.match(workflow, /uses: jboone1989\/livingruntime-remote\/\.github\/workflows\/eventgraph-glm-review\.yml@main/);
  assert.match(workflow, /check_run_id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(workflow, /GLM_API_KEY: \$\{\{ secrets\.GLM_API_KEY \}\}/);
  assert.doesNotMatch(workflow, /CLAUDE_CENTRAL_DISPATCH_TOKEN|event_type=claude-pr-review|self-hosted/);
});
