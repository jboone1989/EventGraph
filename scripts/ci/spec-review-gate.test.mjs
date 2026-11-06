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
  assert.match(reviewer, /reviewer\.outputs\.structured_output/);
  assert.match(reviewer, /--json-schema/);
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
  assert.equal((workflow.match(/--json-schema/g) ?? []).length, 2);
  assert.equal((workflow.match(/steps\.reviewer\.outputs\.structured_output/g) ?? []).length, 2);
  assert.match(workflow, /needs\.changes\.outputs\.docs_only != 'true'/);
  assert.doesNotMatch(workflow, /ready_for_review/);
  assert.match(workflow, /always\(\) && github\.event_name == 'pull_request'/);
});
test("successful Spec reviews auto-approve only via owner token and re-review changed head", () => {
  assert.match(merge, /needs\.spec_review\.result == 'success'/);
  assert.match(merge, /Approve reviewed Spec on its own PR branch/);
  assert.match(merge, /Owner-approved \(owner-delegated Spec Review/);
  assert.match(merge, /Spec status stamped; new HEAD must pass Spec Review again/);
  assert.match(merge, /gh pr ready/);
  assert.match(merge, /needs\.changes\.outputs\.spec_changed/);
  assert.match(merge, /GH_AW_GITHUB_TOKEN/);
  assert.match(merge, /steps\.spec_approval\.outputs\.changed != 'true'/);
  assert.match(merge, /update-branch/);
});
