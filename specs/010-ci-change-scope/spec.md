# 010 · CI: selective checks by change scope

- **Approval source**: owner session instruction of 2026-10-28 (EventGraph #176 round): implement minimal selective CI/CD by PR change scope so documentation-only Markdown PRs stop running the full web/backend/Chromium/E2E/Docker pipeline and stop publishing images plus VM13/Worker deployments after merging. The instruction fixes the guard rails this spec writes down: GitHub required-check semantics (check/docker/e2e/claude-review) are never bypassed; documentation PRs still run the real Spec gate, a basic docs validation and the independent Claude review; no fake success and no workflow-level path filtering that leaves required checks pending; documentation-only pushes to `develop` publish nothing because they change no artifacts; code CD on `develop`, the `main` production flow and any workflow/CI-script change always run the full pipeline; prefer GitHub's native job-skip mechanism and existing repo scripts over new frameworks; branch protection is not modified. This spec is the written form of that approval; it is a draft until its PR is reviewed.
- **Replaces**: nothing. It narrows when the existing 008 pipeline's expensive steps run; it changes no deployment topology, target host or credential.

## User-visible behavior

1. A **documentation-only** change set — every changed file matches the same documentation classification `scripts/ci/check-spec.mjs` already uses for its documentation-only fast path (prose under `docs/`, `specs/`, `.specify/`, `.agents/`, `.claude/`, plus root `AGENTS|CLAUDE|README|CONTRIBUTING` Markdown) — gets a light but real pipeline:
   - The Spec gate and its self-tests run unchanged (still the base branch's copy of the gate).
   - A docs validation checks relative links and heading anchors in the changed Markdown files (no network calls).
   - The heavy `check` steps (install, migration safety, typecheck, web build, web/backend tests, site smoke), the `e2e` job and the `docker` job are skipped through job/step-level `if:` conditions. GitHub records each skipped job as success for branch protection, so the required `check`, `e2e` and `docker` checks stay satisfied without any branch-protection change; workflow-level `paths` filtering is explicitly not used because it leaves required checks pending.
   - The Claude review dispatch is unchanged: it fires whenever the Check run succeeds, so documentation PRs still receive the independent Claude review.
2. Every other change set — application code, `industry/`, CI scripts, workflows, `Dockerfile`, dependency or data files — runs the full pipeline exactly as today. Failing or ambiguous scope detection, and an empty diff, fail closed to the full pipeline.
3. Scope detection runs the **base branch's copy** of the detector when one exists (the same trust model as the Spec gate), so a candidate PR cannot weaken the classifier that decides what may skip. A documentation-only PR cannot have modified the detector, the docs validator or the workflows, because such files are not documentation.
4. A documentation-only push to `develop` does not build a new image or trigger a new VM13/Worker deployment: its own `publish` is skipped explicitly, and both deployments skip through the existing `needs` chain. **A pending earlier code release must not be suppressed by this documentation-only push.** The publish job and both development deploy jobs treat source commit A as the current deploy candidate when every intervening change from A to the latest `develop` HEAD is documentation-only, using the same fail-closed change classifier; they skip A when a later executable change exists. Source commit A stays the immutable image/release SHA, even when HEAD is docs-only B. A failed/incomplete ancestry check must never authorize publishing or deploying an obsolete image. **Push workflow concurrency must be grouped by immutable commit SHA rather than the shared `develop` ref**: GitHub Actions retains only one running plus one pending run per concurrency group, so code B could otherwise be replaced by docs-only C before it executes. PR workflows retain their PR-specific cancel-on-update grouping; code B's own Check/CD run must remain queued even when docs C arrives. Code pushes to `develop` keep the automatic CD of spec 008 and the `main` promotion/production branch protection is unchanged; a docs-only commit is not itself a release source.

## Out of scope

- Branch protection or required-check list changes (job names `check`, `e2e`, `docker` are unchanged and keep their meaning).
- Third-party path-filter actions, a new CI engine, per-directory build matrices, or caching changes.
- Validating external `http(s)` links (CI stays offline) or absolute site routes.
- Docs validation for files the change set did not touch.

## Acceptance criteria

| # | Criterion | Evidence |
| --- | --- | --- |
| AC-1 | A documentation-only change set classifies `docs_only=true`; any workflow, CI-script, code, dependency or `industry/` change classifies `false`; empty or unreadable ranges fail closed to `false` | `scripts/ci/scope-changes.test.mjs` plus a run against real merged PR ranges in both classes |
| AC-2 | The classification reuses the Spec gate's documentation-only file rules (single classification, kept in sync) | shared rule comment + tests for both prose governance paths and root Markdown |
| AC-3 | Scope detection uses the base branch's detector copy when present; the candidate PR's copy only on first installation | workflow step mirroring the Spec-gate base-copy pattern; test not needed beyond review of the identical pattern |
| AC-4 | Documentation-only PRs: Spec gate + docs validation run and succeed; heavy `check` steps, `e2e`, `docker` report skipped; Check run succeeds so the Claude dispatch still fires | real GitHub run on a documentation-only test PR after merge; `scripts/ci/check-docs.test.mjs` for the validator |
| AC-5 | Documentation-only push to `develop`: `publish`, `deploy_vm13_preview`, `deploy_dev_worker`, `e2e_vm13_preview` all skip; no new GHCR digest appears | real develop run after merging a documentation-only PR |
| AC-6 | Code PRs and code pushes run full CI, without skipped required app tests | a real code PR and subsequent develop push; latest SHA Check/Docker/E2E/Claude and VM13/Worker verification |
| AC-7 | Race: code commit A followed by docs-only B before A publishes does **not** lose the deploy: A still publishes/deploys; A followed by any later code commit C is superseded | real CI run or deterministic workflow simulation with A→B and A→C (also A→B→C) plus A code running → B code queued → C docs pushed; verify B's run is not replaced and B builds/deploys, check both publish and the two independently gated deployment jobs |

> 2026-11-02 注记：开发环境退役，`deploy_dev_worker` 作业已删除；AC-5/AC-7 中涉及该作业的部分随之失效，`publish`、`deploy_vm13_preview` 与 `e2e_vm13_preview` 行为不变。

## Validation

- Unit: `node --test scripts/ci/check-spec.test.mjs scripts/ci/scope-changes.test.mjs scripts/ci/check-docs.test.mjs` runs in CI for every PR, documentation-only included.
- Real data: the classifier runs against the squashed ranges of merged PRs from both classes (for example #181 documentation-only vs #189 code) and prints the expected classification.
- Live gates: after the implementation PR merges, one documentation-only PR and one code PR verify AC-4/AC-5/AC-6 on GitHub; verify the per-SHA push concurrency and AC-7 sequence before treating the spec as delivered.
