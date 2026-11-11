# GitHub-native EventGraph pipeline refactor

Status: owner-approved on 2026-11-04 ("把工作流彻底重构"). Implementation requires this Spec to be merged first, then pinned by immutable commit SHA.

## Current evidence

- The 802-line `.github/workflows/check.yml` mixes PR tests, Docker/E2E, develop GHCR publication, VM13 preview, main production promotion, and native GH-AW queue admission.
- Standalone Claude/GLM reviewer workflow dispatch was invoked hundreds of times via `workflow_run: Check`, with actual OpenRouter Haiku calls and independent second-pass checks. Default `main` removed this reviewer in PR #382 but `develop` retained the obsolete YAML.
- Active develop ruleset 25775731 now requires `check`, `docker`, `e2e`, **not** `claude-review`.
- Keep GH-AW's compiled Dispatcher and Worker workflows, `engine: claude` runtime, existing secrets, and the native Work Queue. It is not the discarded standalone paid PR reviewer.
- No cn-dev, Pi, external queue, custom controller, cron retries, GitHub branch-rule bypass, or unapproved production deployment.

## Required behavior

1. **One CI entrypoint**: `Check` validates PRs targeting `develop`/`main` and push events on `develop`, plus intentional immutable-SHA manual dispatch for GitHub-created agent PRs. Retain exact status check names `check`, `docker`, `e2e`, approved-Spec gate, docs-only fast path, and actual tests. Drop metadata-only `pull_request.edited` from the expensive pipeline; PR-base retarget must still be checked by other documented events or an explicit validated dispatch. Do not accidentally mark required checks green by bypassing executable tests. Per-PR synchronization cancels superseded work only for its own PR.
2. **No paid standalone review**: remove `claude-pr-dispatch.yml` and `eventgraph-glm-review.yml` from `develop`; never invoke `anthropics/claude-code-action` for standalone PR review. Remove obsolete `claude-review` prerequisites from native auto-merge and keep GitHub's actual branch protection authoritative. GitHub auto-merge must remain subject to all currently required real checks.
3. **Separate release pipeline(s)**: move `publish`, `promote`, `deploy_production`, `deploy_vm13_preview`, `e2e_vm13_preview` and queue release-admission steps out of `Check`. For develop, publish only after **successful Check on its exact SHA**, not arbitrary `workflow_run` or PR completion, and skip docs-only or superseded releases. For main, consume only the pinned immutable develop digest, validate runtime equivalence and existing passing check/e2e/publish evidence, and keep production deployment gated by `EVENTGRAPH_PROD_AUTO_DEPLOY`. Do not rebuild a separate production image.
4. **Native GH-AW ownership**: keep official Work Queue, Worker and Dispatcher; preserve their compiled lock source and engine. Queue continuation happens on intentional lifecycle events, without self-triggering loops or a second scheduler. Do not change model provider, worker autonomy, or run a GH-AW smoke check on every unrelated push.
5. **Eliminate obsolete entrypoints**: retire one-shot acceptance workflows whose only purpose was an already deployed migration, remove obsolete fixed-branch compile triggers, and keep upstream AIHOT sync on its explicit schedule/manual dispatch only. Remove stale comments that instruct expensive review or obsolete central forwarding. Retain branch hygiene for merged branches.
6. **Traceability / budget**: every paid GH-AW run remains attributable through native GH-AW usage artifacts. No paid review on a Check completion. No automatic retries solely because a review verdict is missing, no model call for PR metadata edits, and no false status spoofing.
7. **Staged delivery**: stage on `develop` as implementation PR after this Spec merge; run `check`, `docker`, `e2e` then merge normally. Promote to `main` only after an explicit reviewed release, without deploying to production as part of refactor approval.

## Acceptance criteria

- AC1: Exactly one PR-testing `Check` workflow with existing required job contexts; no standalone paid reviewer file on either branch after promotion.
- AC2: PR metadata edit alone does not spawn a heavy Check and/or Haiku call; code synchronization still tests.
- AC3: A develop release starts only after successful same-SHA Check, skips docs-only commits and obsolete executable SHAs, and deploys VM13 only behind existing enablement.
- AC4: Main governance-only push does not deploy; real main promotion validates pinned digest and production toggle before any SSH side effect.
- AC5: GH-AW Dispatcher/Worker, task intake, usage evidence and strict lock compilation remain operational; no extra runtime model calls are introduced by changing CI.
- AC6: Auto-merge never requires the retired `claude-review` status, never bypasses branch protection, and preserves real required checks.
- AC7: Tests and GitHub Actions YAML parsing pass, no unnecessary queue relay or CI retry loop, and flow documented in `docs/ci-cd.md`.
