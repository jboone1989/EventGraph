# 011 · PR CI event scope and review dispatch deduplication

- **Owner direction / evidence**: 2026-10-29 EventGraph [Issue #176](https://github.com/jboone1989/EventGraph/issues/176), T15; the motivation was repeated cancelled checks for #175 and #207 in the inspected Actions window. This document is a **draft until its own PR has been reviewed and approved**; the implementation must pin the accepted Spec revision.
- **Goal**: prevent editing PR metadata and repeat successful checks on the same SHA from generating expensive CI work and redundant central-review dispatch, without weakening Spec-first, independently required reviews, or branch protection.
- **Depends on**: existing `specs/010-ci-change-scope/spec.md` and its docs-only fast path; reuse `scripts/ci/check-spec.mjs` without relaxing its rules.

## Required behavior

1. The existing `Check` workflow continues to run full required `check`, `e2e`, and `docker` checks for code/workflow changes on `opened`, `synchronize`, `reopened`, `ready_for_review`, and **`edited` events that change the PR base branch** (`github.event.changes.base`), as well as existing branch push/dispatch events. The existing docs-only fast path remains unchanged. PR branch update cancellations stay scoped to that PR, not other PRs.
2. Editing **only** a PR title/body (`pull_request.edited` without `changes.base`) must not cancel a running full Check or start its heavy `check`, `e2e`, or `docker` jobs. Instead it runs an independent, lightweight **PR metadata / Spec gate** workflow. This workflow also runs for the four regular PR lifecycle events so its required check exists on every current PR head.
3. The lightweight job runs the existing trusted base-branch Spec gate on the current PR head and latest target branch (including checking the actual current PR description, not a stale event body); no custom Spec implementation or broad dependency installation. The metadata check must be **required** in active repository branch rulesets for PRs targeting `develop` and `main` before removing `edited` from the heavy Check trigger. The existing required checks and independent Claude review stay required; do not fake their results or change their names.
4. A successful `Check` on a PR's exact current SHA may dispatch to central review once, but completed or already-recorded central review for that same SHA is not redispatched merely because another successful Check run occurred. Use the existing central review `claude-review` commit status as the durable indicator, and retain the downstream reviewer's own per-PR-SHA idempotency. Manual owner-authorized re-review remains possible through the existing dedicated path.
5. A base-branch retarget must reclassify the effective diff using the **new base** and run all required heavy checks if that range includes executable changes, even when the PR head SHA did not move. A previous docs-only skipped result must not authorize a merge after retarget. Rapid successive `synchronize` pushes cancel superseded runs for the **same** PR, never a different PR; no global serialization and no new runner pools, databases, bots, or CI framework. Coalescing agent commits before push belongs to the agent's own implementation and is not attempted through arbitrary CI sleeps.

## Acceptance

- AC-1: A title/body-only `edited` event starts the lightweight Spec gate only, and neither runs Docker/E2E nor cancels an in-progress `Check` for the same PR.
- AC-2: `opened/synchronize/reopened/ready_for_review` trigger the unchanged full Check and the new metadata gate; docs-only PRs keep the established selective behavior.
- AC-3: Changing a valid Spec reference in a PR body to invalid fails the **required** metadata check before merge; restore the valid body and the gate passes.
- AC-4: A repeated successful Check for an already-reviewed exact SHA causes no redundant central dispatch. A genuinely new SHA with no review status still dispatches, subject to pre-existing PR/HEAD and fork/draft checks.
- AC-5: Different PRs can run full CI concurrently; no workflow- or repository-wide concurrency bottleneck is introduced.
- AC-6: Branch protection still requires existing checks plus the new metadata gate. No merge bypass, production change, or workflow path-filter semantics introduced.
- AC-7: Retargeting a previously docs-only PR to a base where its effective diff contains code triggers fresh `check`, `e2e`, and `docker` for that new base before merging; old skipped results are not accepted.

## Validation

- Reuse the existing Spec-gate tests; add focused tests for any new logic.
- Verify metadata-only edits, base-branch retargets, and synchronize events on test PRs, including a deliberate invalid Spec body edit and a docs-only → executable retarget.
- Verify a repeated successful run for the same reviewed SHA vs a new SHA.
- Update `docs/ci-cd.md` in the implementation PR to describe the metadata gate and review dispatch deduplication; update `.agents/CONSTRAINTS.md` if the named required checks change.
- Independent review required before merging the implementation PR.
