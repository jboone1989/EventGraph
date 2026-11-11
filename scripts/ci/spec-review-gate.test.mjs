import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/check.yml", "utf8");
const changes = workflow.split("\n  changes:")[1]?.split("\n  spec_review:")[0] ?? "";
const reviewer = workflow.split("\n  spec_review:")[1]?.split("\n  check:")[0] ?? "";
const check = workflow.split("\n  check:")[1]?.split("\n  e2e:")[0] ?? "";
const merge = workflow.split("\n  auto_merge_develop:")[1]?.split("\n  refresh_behind_prs:")[0] ?? "";
const refresh = workflow.split("\n  refresh_behind_prs:")[1] ?? "";

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
  assert.match(workflow, /types: \[opened, synchronize, reopened, ready_for_review\]/);
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
});
test("a fully verified HEAD arms native auto-merge even while develop moved on (#464)", () => {
  // Arming stays behind the exact-head gate: every check and review must have
  // passed on this one HEAD; no CI or independent-review bypass.
  assert.match(merge, /head\.sha == \$sha/);
  assert.match(merge, /needs\.check\.result == 'success'/);
  assert.match(merge, /needs\.docker\.result == 'success'/);
  assert.match(merge, /needs\.e2e\.result == 'success'/);
  assert.match(merge, /needs\.claude_review\.result == 'success'/);
  // A behind branch must arm native auto-merge — persistent GitHub-side PR
  // state that survives run cancellation — instead of rewriting the verified
  // head: update-branch discards the green checks of that HEAD, cancels the
  // in-flight run via the pull_request concurrency group and re-pays the whole
  // pipeline (Claude review included) on every develop advance. PR #464 looped
  // exactly that way: green checks, auto-merge job skipped, PR left behind.
  assert.doesNotMatch(merge, /pulls\/\$PR_NUMBER\/update-branch/);
  assert.doesNotMatch(merge, /== "behind"/);
  assert.match(merge, /\.auto_merge != null/);
  assert.match(merge, /== "dirty"/);
  assert.match(merge, /gh pr merge "\$PR_NUMBER" --repo "\$GITHUB_REPOSITORY" --auto --squash/);
});
test("develop pushes refresh behind PR branches after mergeability settles", () => {
  assert.match(refresh, /github\.event_name == 'push' && github\.ref_name == 'develop'/);
  assert.match(refresh, /select\(\.draft == false\)/);
  assert.match(refresh, /"\$head_ref" != main && "\$head_ref" != chore\/aihot-upstream-\*/);
  // GitHub reports "unknown" right after a push while it recomputes mergeability;
  // a single-shot read would skip a genuinely behind PR until the next develop
  // advance, so the refresh waits briefly before deciding.
  assert.match(refresh, /"\$state" == "unknown"/);
  assert.match(refresh, /for _ in 1 2 3/);
  assert.match(refresh, /"\$state" != "unknown" \]\] && break/);
  assert.match(refresh, /"\$state" == behind/);
  assert.match(refresh, /update-branch/);
  assert.match(refresh, /"\$state" == dirty/);
});
