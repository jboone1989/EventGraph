import test from "node:test";
import assert from "node:assert/strict";
import {
  isWorkerWorkflowName,
  parseWorkerMarker,
  validateAgentWorkPr,
} from "./eventgraph-work-queue-guards.mjs";

test("only the two approved GH-AW Worker names can advance completion", () => {
  assert.equal(isWorkerWorkflowName("EventGraph GH-AW Worker"), true);
  assert.equal(isWorkerWorkflowName("EventGraph GH-AW Pi Worker"), true);
  assert.equal(isWorkerWorkflowName("EventGraph GH-AW Dispatcher"), false);
  assert.equal(isWorkerWorkflowName("Unrelated Workflow"), false);
});

test("parses an exact Work ID and run ID pair", () => {
  assert.deepEqual(parseWorkerMarker("<!-- eventgraph-work-id:abc123 worker-run-id:123456 -->"), {
    workId: "abc123",
    runId: "123456",
  });
  assert.equal(parseWorkerMarker("unrelated text"), null);
});

const goodPr = {
  number: 123,
  state: "open",
  draft: false,
  base: { ref: "develop", repo: { full_name: "jboone1989/EventGraph" } },
  head: {
    ref: "agent/issue-123",
    sha: "a".repeat(40),
    repo: { full_name: "jboone1989/EventGraph" },
  },
  labels: [{ name: "agent-work" }],
  body: "<!-- eventgraph-work-id:abc123 worker-run-id:123456 -->",
};

test("accepts the same immutable PR marker regardless of Worker harness", () => {
  assert.deepEqual(validateAgentWorkPr(goodPr), { workId: "abc123", runId: "123456" });
});

test("rejects draft, wrong branch, missing marker and wrong repository", () => {
  for (const changed of [
    { draft: true },
    { head: { ...goodPr.head, ref: "random/branch" } },
    { body: "no marker" },
    { base: { ...goodPr.base, ref: "main" } },
    { head: { ...goodPr.head, repo: { full_name: "someone/else" } } },
  ]) {
    assert.throws(() => validateAgentWorkPr({ ...goodPr, ...changed }));
  }
});
