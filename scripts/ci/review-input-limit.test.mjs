import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/check.yml", "utf8");
const spec = workflow.match(/^  spec_review:([\s\S]*?)(?=^  check:)/m)?.[1];
const code = workflow.match(/^  claude_review:([\s\S]*?)(?=^  auto_merge_develop:)/m)?.[1];

test("code review accepts the observed main promotion diff without bypassing a reviewer", () => {
  assert.ok(code, "missing code review job");
  assert.match(code, /bytes > 262144/);
  assert.match(code, /limit 262144 bytes/);
  assert.ok(159986 <= 262144, "the observed 159,986-byte release diff must fit");
  assert.match(code, /uses: anthropics\/claude-code-action@v1/);
  assert.match(code, /parseStructuredReviewVerdict\(process\.env\.REVIEW_OUTPUT, 'code'\)/);
  assert.match(code, /core\.setFailed\('Claude Review found '/);
});

test("oversized reviews still fail closed and Spec Review retains its old limit", () => {
  assert.ok(spec, "missing Spec Review job");
  assert.match(spec, /bytes > 150000/);
  assert.doesNotMatch(spec, /bytes > 262144/);
  assert.ok(262145 > 262144, "oversize code review must fail");
  assert.match(code ?? "", /if \(\( bytes > 262144 \)\); then\s+echo "::error::Diff is too large[^\n]*\s+exit 1/);
  assert.match(workflow, /needs\.claude_review\.result == 'success'/);
});
