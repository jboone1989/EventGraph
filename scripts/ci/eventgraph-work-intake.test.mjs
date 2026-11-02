import test from "node:test";
import assert from "node:assert/strict";
import { agentWorkLabelArgs, buildWorkPayload, parseAdmission, runIntake, verifySpec } from "./eventgraph-work-intake.mjs";

const specSha = "e90f7e4343e122b4985abd1e530ac848199bc323";
const body = `## Task
Implement the requested change in the existing EventGraph codebase. Preserve current behavior outside the acceptance criteria and add focused regression coverage.

## Acceptance Criteria
- [ ] The requested behavior is implemented and covered by a focused test.
- [ ] Relevant checks pass and the PR records their actual results.

Spec: specs/012-github-hosted-agent-queue/spec.md@${specSha}
Spec PR: https://github.com/jboone1989/EventGraph/pull/236
`;

function event(overrides = {}) {
  return {
    action: "labeled",
    label: { name: "agent-ready" },
    sender: { login: "jboone1989" },
    ...overrides,
    issue: { number: 42, title: "Implement the approved task", body, ...overrides.issue },
  };
}

test("accepts an owner-authored agent-ready Issue with a pinned merged Spec reference", () => {
  const parsed = parseAdmission(event());
  assert.equal(parsed.issue.number, 42);
  assert.equal(parsed.specPath, "specs/012-github-hosted-agent-queue/spec.md");
  assert.equal(parsed.specSha, specSha);
  assert.equal(parsed.specPrNumber, 236);
  assert.match(parsed.task, /existing EventGraph codebase/);
  assert.match(parsed.acceptanceCriteria, /focused test/);
});

test("ignores unrelated labels and non-owner label events", () => {
  assert.equal(parseAdmission(event({ label: { name: "bug" } })), null);
  assert.equal(parseAdmission(event({ sender: { login: "contributor" } })), null);
});

test("rejects an Issue without testable acceptance criteria", () => {
  assert.throws(
    () => parseAdmission(event({ issue: { body: body.replace(/## Acceptance Criteria[\s\S]*/, "## Acceptance Criteria\nNot testable") } })),
    /testable unchecked items/,
  );
});

test("rejects a Spec path with traversal segments", () => {
  const unsafe = body.replace("specs/012-github-hosted-agent-queue/spec.md", "specs/../spec.md");
  assert.throws(() => parseAdmission(event({ issue: { body: unsafe } })), /pin Spec/);
});

test("builds a closed PR-only effect contract and exact repository resource scope", () => {
  const payload = buildWorkPayload(parseAdmission(event()));
  assert.deepEqual(payload.effect_contract, {
    version: 1,
    outputs: [{ type: "create_pull_request", min: 1, max: 1 }],
  });
  assert.deepEqual(payload.resource_scope, {
    version: 1,
    resources: [{
      host: "github.com",
      repository: "jboone1989/EventGraph",
      repository_id: "1416699488",
    }],
  });
  assert.match(payload.task, /Spec: specs\/012-github-hosted-agent-queue\/spec\.md@/);
  assert.match(payload.task, /Issue URL: https:\/\/github\.com\/jboone1989\/EventGraph\/issues\/42/);
});

test("verifySpec reads only scalars from potentially huge API payloads", () => {
  // A Spec pinned a week back makes the compare payload exceed execFileSync's
  // stdout buffer (run 41234220882 died on ENOBUFS); --jq keeps the pipe small.
  const calls = [];
  const ghApi = (args) => {
    calls.push(args.join(" "));
    if (args.some((arg) => arg.includes("compare"))) return "ahead";
    if (args.some((arg) => arg.includes("/contents/"))) return "a".repeat(40);
    return JSON.stringify({
      merged_at: "2026-10-24T16:22:27Z", base: { ref: "develop", repo: { full_name: "jboone1989/EventGraph" } },
      head: { repo: { full_name: "jboone1989/EventGraph" } }, merged_by: { login: "jboone1989" },
    });
  };
  verifySpec(parseAdmission(event()), ghApi);
  assert.match(calls.find((call) => call.includes("compare")), /--jq \.status$/);
  assert.ok(calls.filter((call) => call.includes("contents/")).every((call) => call.endsWith("--jq .sha")));

  for (const [label, stub] of [
    ["diverged", (args) => (args.some((arg) => arg.includes("compare")) ? "diverged" : ghApi(args))],
    ["rebased Spec content", (args) => (args.some((arg) => arg.endsWith("?ref=develop")) ? "b".repeat(40) : ghApi(args))],
  ]) {
    assert.throws(() => verifySpec(parseAdmission(event()), stub), label === "diverged" ? /ancestor/ : /content has changed/);
  }
});

test("labels the Issue agent-work only after the Work submit succeeds, then triggers the gate", () => {
  const calls = [];
  const result = runIntake(event(), {
    verifySpec: () => calls.push(["verify"]),
    submitWork: (payload, issueNumber) => calls.push(["submit", issueNumber]),
    labelIssue: issueNumber => calls.push(["label", issueNumber]),
    dispatchGate: () => calls.push(["gate"]),
  });
  assert.equal(result, "submitted");
  assert.deepEqual(calls, [
    ["verify"], ["submit", 42], ["label", 42], ["gate"],
  ]);
});

test("a failed Work submit leaves the Issue unlabeled and dispatches nothing", () => {
  const calls = [];
  assert.throws(() => runIntake(event(), {
    verifySpec: () => calls.push(["verify"]),
    submitWork: () => { throw new Error("queue rejected the Work"); },
    labelIssue: () => calls.push(["label"]),
    dispatchGate: () => calls.push(["gate"]),
  }), /queue rejected the Work/);
  assert.deepEqual(calls, [["verify"]]);
});

test("non-admission events run no steps", () => {
  const calls = [];
  const result = runIntake(event({ label: { name: "agent-work" } }), {
    verifySpec: () => calls.push("verify"),
    submitWork: () => calls.push("submit"),
    labelIssue: () => calls.push("label"),
    dispatchGate: () => calls.push("gate"),
  });
  assert.equal(result, "ignored");
  assert.deepEqual(calls, []);
});

test("the agent-work label command is idempotent and repo-pinned", () => {
  assert.deepEqual(agentWorkLabelArgs(42), [
    "issue", "edit", "42", "--repo", "jboone1989/EventGraph", "--add-label", "agent-work",
  ]);
  // Duplicate intake re-runs issue the exact same command; GitHub treats
  // adding an existing label as a no-op, so reruns stay idempotent.
  assert.deepEqual(agentWorkLabelArgs(42), agentWorkLabelArgs(42));
});
