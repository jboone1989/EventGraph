# Universal PR auto-merge after independent review

**Status:** Owner-approved direction, 2026-11-03  
**Repository:** `jboone1989/EventGraph`  
**Control-plane branch:** `main`  
**Development branch:** `develop`

## 1. Goal

Every eligible same-repository, non-draft PR targeting `develop` or `main` should be merged automatically after the existing independent GLM review and all target-branch-required CI checks succeed. A human must not need to click Merge or enable Auto-merge on each PR.

Use GitHub's native Auto-merge as the merge mechanism. Do not introduce a custom merge queue, scheduler, bot service, host process, timer, or parallel review pipeline.

## 2. Existing capabilities to reuse

- Repository-level GitHub Auto-merge is already enabled (`allow_auto_merge=true`).
- The default-branch `.github/workflows/claude-pr-dispatch.yml` already dispatches the existing central GLM reviewer after a successful exact-SHA `Check`.
- The central reviewer writes the `claude-review` commit status and binds its description to the exact target branch and base SHA.
- GitHub rulesets remain authoritative for required checks and mergeability. Existing `check`, `docker`, and `e2e` requirements must not be weakened.
- Main already requires `claude-review`. The active develop ruleset currently omits it and is named `develop / CI (Claude review paused)`; add `claude-review` as a required status check before treating independent review as a branch-protection requirement.

## 3. Required behavior

1. Cover every same-repository, open, non-draft PR targeting `develop` or `main`. Do not require an `agent-work` label, an `agent/*` branch name, or a special workflow variable.
2. Preserve the existing central GLM reviewer and exact-SHA preflight. The auto-merge job runs only after that reusable reviewer has completed successfully, or when preflight proves that a successful review already exists for the exact current tuple `(head SHA, base ref, live base SHA)`.
3. Before enabling Auto-merge, revalidate:
   - the original `Check` run completed successfully for the exact PR head SHA;
   - the PR remains open, non-draft, same-repository, and targets `develop` or `main`;
   - the PR head SHA has not changed;
   - the target branch still points to the base SHA used by the review;
   - the latest attributable `claude-review` status is `success`, created by `github-actions[bot]`, and its description starts with `base=<base ref>@<live base SHA>;`.
4. If the review reports blocking findings, fails, is missing, is pending, is unattributable, or belongs to an older head/base, do not enable Auto-merge. A subsequent code push or target-base advancement must trigger a fresh Check and independent review.
5. After successful review and exact-state validation, invoke GitHub native Auto-merge using the repository's normal squash merge method. Do not use administrative bypass or merge around required checks. GitHub waits for every remaining required status check and branch rule.
6. Failed or cancelled checks, unresolved review threads, stale reviews, draft PRs, fork PRs, and unsupported target branches remain unmerged. When a blocker is fixed and the new exact head passes the normal pipeline, the workflow resumes automatically.
7. Keep the workflow idempotent: repeated Check completions for the same successful `(head SHA, base ref, base SHA)` must not create duplicate review work or duplicate merge attempts.
8. Preserve weekly release policy through the existing PR target branch and main ruleset. This change automates the merge of a PR only after its normal target-branch gates; it does not create a new production deployment path.

## 4. Implementation boundary

Extend the existing default-branch `.github/workflows/claude-pr-dispatch.yml` with one trusted job after `official-glm-review`. Reuse the outputs of `review_preflight` and the existing reusable review result; verify the exact `claude-review` status and live PR/base again before calling `gh pr merge --auto --squash`.

Do not add a second reviewer or replace the reusable workflow with fire-and-forget dispatch. Do not put the auto-merge job in the model-facing agent workflow. Keep write permissions job-scoped to the native merge job.

The develop-only `eventgraph-native-pr-closed.yml` currently has a special-case auto-merge job restricted to `agent/*` + `agent-work` and a feature flag. Retire that duplicate path once the universal default-branch path is active; retain its unrelated native queue continuation behavior.

## 5. Acceptance criteria

- [ ] A normal PR to `develop` automatically receives the existing GLM review after its successful Check.
- [ ] A normal PR to `main` automatically receives the same existing GLM review.
- [ ] An exact-head GLM review success automatically enables native squash Auto-merge without a human click.
- [ ] A PR with all CI checks green but no successful exact-head `claude-review` does not auto-merge.
- [ ] A blocking GLM finding or failed required check prevents merge.
- [ ] A new head SHA or advanced base SHA invalidates the previous review and requires a fresh review.
- [ ] All existing required checks, Spec gates, thread-resolution rules, and no-bypass branch rules remain in force.
- [ ] The develop ruleset requires `claude-review` alongside its existing required CI checks.
- [ ] Existing queue continuation still runs after an agent PR closes; no duplicate queue or merge scheduler is introduced.
- [ ] A real PR to develop and a real PR to main demonstrate automatic review-gated merge end to end.

## 6. Out of scope

- Changing the central review model, provider, checklist, or review policy.
- Changing the CI test matrix or required check names.
- Automatically merging PRs that have not received a successful independent review.
- Bypassing branch rulesets, required checks, review-thread resolution, or Spec gates.
- Changing application deployment cadence or production infrastructure.
