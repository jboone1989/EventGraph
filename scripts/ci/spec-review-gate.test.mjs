import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/check.yml", "utf8");
const changes = workflow.split("\n  changes:")[1]?.split("\n  spec_review:")[0] ?? "";
const reviewer = workflow.split("\n  spec_review:")[1]?.split("\n  check:")[0] ?? "";
const check = workflow.split("\n  check:")[1]?.split("\n  e2e:")[0] ?? "";
const merge = workflow.split("\n  auto_merge_develop:")[1] ?? "";

test("only Spec changes in a documentation PR activate one Spec review", () => {
  assert.match(changes, /spec_changed: \$\{\{ steps\.scope\.outputs\.spec_changed \}\}/);
  assert.match(changes, /\^specs\/\[\^\/\]\+\/\(spec\|plan\|tasks\)/);
  assert.match(reviewer, /name: spec-review/);
  assert.match(reviewer, /needs\.changes\.outputs\.docs_only == 'true'/);
  assert.match(reviewer, /needs\.changes\.outputs\.spec_changed == 'true'/);
  assert.match(reviewer, /Claude Code Action/);
  assert.match(reviewer, /reviewer\.outputs\.execution_file/);
  assert.match(reviewer, /core\.setFailed/);
});
test("the existing required check is fail-closed on Spec Review", () => {
  assert.match(check, /needs: \[changes, spec_review\]/);
  assert.match(check, /always\(\)/);
  assert.match(check, /Require Spec review before green required check/);
  assert.match(check, /\[\[ "\$SPEC_REVIEW_RESULT" == success \]\] \|\|/);
});
test("Spec PRs retain owner approval and code PRs retain code review", () => {
  assert.match(merge, /needs\.changes\.outputs\.spec_changed != 'true'/);
  assert.match(workflow, /name: claude-review/);
  assert.match(workflow, /needs\.changes\.outputs\.docs_only != 'true'/);
  assert.doesNotMatch(workflow, /ready_for_review/);
});
