import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkPayload, parseAdmission, selectWorkerProfile, workRequestId } from "./eventgraph-work-intake.mjs";

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
  const { issue: issueOverrides = {}, ...eventOverrides } = overrides;
  return {
    action: "labeled",
    label: { name: "agent-ready" },
    sender: { login: "jboone1989" },
    issue: { number: 42, title: "Implement the approved task", body, ...issueOverrides },
    ...eventOverrides,
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

test("routes default and explicit GLM labels to the existing Worker", () => {
  assert.equal(selectWorkerProfile([]), "eventgraph-worker");
  assert.equal(selectWorkerProfile([{ name: "agent-worker:glm" }]), "eventgraph-worker");
  assert.equal(parseAdmission(event()).workerProfile, "eventgraph-worker");
});

test("routes the Pi label to the Pi Worker", () => {
  assert.equal(selectWorkerProfile([{ name: "agent-worker:pi" }]), "eventgraph-pi-worker");
  assert.equal(parseAdmission(event({ issue: { labels: [{ name: "agent-worker:pi" }] } })).workerProfile, "eventgraph-pi-worker");
});

test("rejects mutually exclusive Worker labels", () => {
  const labels = [{ name: "agent-worker:glm" }, { name: "agent-worker:pi" }];
  assert.throws(() => selectWorkerProfile(labels), /Conflicting Worker profiles/);
  assert.throws(() => parseAdmission(event({ issue: { labels } })), /Conflicting Worker profiles/);
});

test("a Worker selection label by itself cannot admit Work", () => {
  assert.equal(parseAdmission(event({ label: { name: "agent-worker:pi" } })), null);
  assert.equal(parseAdmission(event({ label: { name: "agent-worker:glm" } })), null);
});

test("route is captured at admission, not changed by a later label", () => {
  const admission = parseAdmission(event());
  assert.equal(admission.workerProfile, "eventgraph-worker");
  admission.issue.labels = [{ name: "agent-worker:pi" }];
  assert.equal(admission.workerProfile, "eventgraph-worker");
});

test("a later Pi label cannot create a second request ID for the same admitted Issue", () => {
  const first = parseAdmission(event());
  const later = parseAdmission(event({ issue: { labels: [{ name: "agent-worker:pi" }] } }));
  assert.equal(first.workerProfile, "eventgraph-worker");
  assert.equal(later.workerProfile, "eventgraph-pi-worker");
  assert.equal(workRequestId(first.issue.number), workRequestId(later.issue.number));
  assert.equal(workRequestId(first.issue.number), "issue-42");
});
