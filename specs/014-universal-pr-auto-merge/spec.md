# Universal PR auto-merge after required checks

**Status:** Owner-approved direction, 2026-11-03  
**Repository:** `jboone1989/EventGraph`  
**Development branch:** `develop`  
**Release branch:** `main`

## 1. Goal

Automatically enable GitHub native Auto-merge for every eligible same-repository, open, non-draft PR after its exact-head CI run succeeds. A human must not need to click Merge or enable Auto-merge on each PR.

**Independent GLM Review is paused by owner instruction.** This Spec must not re-enable the GLM reviewer workflow, require `claude-review` on `develop`, or make GLM review a prerequisite for auto-merge.

Use GitHub's native Auto-merge and existing branch rulesets. Do not introduce a custom merge queue, scheduler, bot service, host process, timer, or parallel review pipeline.

## 2. Current repository state

- Repository-level GitHub Auto-merge is already enabled (`allow_auto_merge=true`).
- The active `develop` ruleset is named `develop / CI (Claude review paused)`. Its required checks are exactly `check`, `docker`, and `e2e`.
- The `develop` ruleset has `required_approving_review_count: 0`; unresolved review threads must still be resolved.
- The active `main` ruleset currently requires `check`, `docker`, and `claude-review`. The GLM reviewer is paused, so this is a stale/inconsistent gate for new PRs to `main`. This Spec must not silently restore GLM review or change the `main` ruleset. Until the owner separately decides whether to remove that stale requirement or resume review, GitHub native Auto-merge may remain queued for `main` PRs and must not bypass the rule.
- Existing Check workflow jobs and branch rulesets remain the source of truth for required CI.

## 3. Required behavior

1. Cover every same-repository, open, non-draft PR targeting `develop` or `main`. Do not require an `agent-work` label, an `agent/*` branch name, or a special workflow variable.
2. After the existing `Check` workflow completes successfully for the exact current PR head, a trusted default-branch workflow revalidates the live PR and enables GitHub native Auto-merge using squash.
3. Before enabling Auto-merge, revalidate:
   - the source Check run completed successfully and belongs to the current PR head SHA;
   - the PR remains open, non-draft, same-repository, and targets a supported branch;
   - the live PR head SHA still equals the successful Check run's head SHA;
   - the PR base ref and base SHA are read live;
   - no unresolved review threads or other branch-rule blockers are bypassed.
4. Do not call the GLM reviewer, wait for `claude-review` on `develop`, create a synthetic `claude-review` status, or treat historical GLM statuses as current approval. Do not re-enable the paused workflow.
5. Invoke GitHub native Auto-merge only; do not use administrative bypass or direct merge. GitHub waits for all required checks and branch rules. A missing or failing required check, stale head, draft/fork PR, unresolved thread, or unsupported target leaves the PR unmerged.
6. A subsequent code push creates a new exact-head Check; only that successful run may enable Auto-merge for the new head. Repeated Check completions must be idempotent.
7. Preserve weekly release policy through the existing PR target branch and main ruleset. This change does not create a new production deployment path.
8. Keep the native queue continuation behavior currently triggered after an agent PR closes. Remove only the duplicate agent-only merge path after the universal path is proven; do not remove queue continuation.

## 4. Implementation boundary

Extend the existing default-branch workflow responsible for post-Check PR handling with one trusted Auto-merge job. Do not add a reviewer job. Do not call the reusable GLM workflow. Do not put the merge job in the model-facing agent workflow.

The merge job should use the GitHub native Auto-merge API or `gh pr merge --auto --squash`, with job-scoped write permissions. Preserve the original Check run ID, exact head SHA, PR identity, and live base validation. Keep GitHub branch protection authoritative.

The develop-only `eventgraph-native-pr-closed.yml` currently has a special-case auto-merge job restricted to `agent/*` + `agent-work` and a feature flag. Retire that duplicate merge path once the universal default-branch path is active; retain its unrelated native queue continuation behavior.

## 5. Acceptance criteria

- [ ] Every eligible ordinary PR to `develop` is automatically queued for squash merge after exact-head `check`, `docker`, and `e2e` all succeed.
- [ ] No `agent-work` label or `agent/*` branch name is required.
- [ ] No GLM reviewer invocation, `claude-review` status, or GLM quota is required for PRs to `develop`.
- [ ] A PR with failed, cancelled, pending, or stale required CI remains unmerged.
- [ ] A new head SHA requires a new successful Check before Auto-merge is enabled.
- [ ] Unresolved review threads and all other branch rules remain enforced; no admin bypass or direct merge.
- [ ] The current `main` `claude-review` rule is documented as an explicit blocker; this implementation neither bypasses it nor silently changes it.
- [ ] Existing native queue continuation still runs after an agent PR closes.
- [ ] A real ordinary PR to `develop` demonstrates automatic native Auto-merge end to end.

## 6. Out of scope

- Re-enabling or repairing the independent GLM Review workflow.
- Adding `claude-review` to the `develop` ruleset.
- Changing the `main` ruleset without a separate owner decision.
- Changing the CI test matrix or required check names.
- Bypassing branch rulesets, required checks, review-thread resolution, or Spec gates.
- Changing application deployment cadence or production infrastructure.
