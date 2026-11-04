# Repository-owned GLM review for EventGraph

Status: approved for implementation only after this Spec is merged into develop.
Owner direction: 2026-11-04 — each GitHub repository owns its own CI, review and deployment; no cross-repository review orchestration.

## Existing behavior
- EventGraph runs its own Check, Docker and E2E but forwards successful Check completions through `.github/workflows/claude-pr-dispatch.yml` to the reusable `livingruntime-remote` GLM reviewer.
- EventGraph's develop branch requires `check`, `docker`, `e2e`, `claude-review` success; main has separate release controls.
- `workflow_run` uses the **default branch's** trusted workflow definition; merging only to develop stages, but does not activate, the change.

## Required behavior
1. Put the full GLM reviewer workflow, checklist, and invocation in EventGraph, keeping the official `anthropics/claude-code-action` and current EventGraph `GLM_API_KEY`. Use a repository-local reusable workflow. Remove all calls to `livingruntime-remote` and its checklist from EventGraph's review path. Do not introduce a new central service, runner, worker, database or scheduler.
2. Only launch for successful PR-related Check completions, including validated exact-SHA `workflow_dispatch`, and verify the triggering Check ID, event type, successful conclusion, immutable head SHA and current in-repository open PR before the model receives secrets. Preserve independent read-only review, issue comment and `claude-review` commit status, including blocking findings and failure results.
3. Skip a repeated successful review **only when** the newest attributable `claude-review` status matches the exact (head SHA, live base ref, live base SHA) identity; failed/missing/unattributable review never counts as success. A changed base or head forces a fresh review. Preserve manual re-review when explicitly authorized; don't treat unverified status as a bypass.
4. Do not run PR-controlled code with privileged credentials. The privileged `workflow_run` definition and model prompt must come from trusted default-branch files, never from a candidate PR. Any checkout of an untrusted HEAD is for read-only diff inspection; the action must not execute scripts, hooks, PR-supplied tools, or arbitrary GitHub write tools.
5. Preserve existing required status contexts (`check`, `docker`, `e2e`, `claude-review`) and current branch rulesets. Do not alter production images, deployment jobs, or `main` release policy. Remove/retire only the cross-repository entrypoint after local reviewer is active.
6. Keep the normal feature -> develop -> main release flow. Since `workflow_run` definitions are loaded from default branch, activation must be part of an **explicit controlled main release** without inadvertent production deployment; before then report the change as staged, not live.

## Acceptance
- Successful Check on a real in-repo open PR invokes only EventGraph's local review workflow, emits a `claude-review` status and blocks merge on invalid/important findings.
- Cancelled, failed or push Check never invokes the model. A previous success for the same head+live base skips model calls. Base changes and previous failures require review.
- Review reads a committed EventGraph checklist; no runtime checkout, clone, or reusable-workflow reference to `livingruntime-remote`.
- Existing required CI checks and docs-only behavior work without new permissions or heavyweight runners.
- CI checks syntax and local workflow reference, and a real smoke run confirms the local review before deleting central ownership.
- No production deployment occurs as part of this migration.
