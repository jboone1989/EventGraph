# Historical Pi Auto-Repair for EventGraph PRs

**Status:** Superseded by `specs/012-github-hosted-agent-queue/spec.md` in PR #235, effective when that PR merges. The owner's 2026-10-30 direction retires the cn-dev/Pi execution path. This document is retained for historical context only and is not an active implementation or execution contract.

> The requirements below describe the retired design. Do not execute them or use them to authorize cn-dev, Pi, VM13, VM09, or host-side repair work. The GH-AW Work Queue Spec is the sole replacement contract after merge.

## Goal and existing components

On an eligible EventGraph PR targeting `develop`, turn a failed Check or a blocking independent `claude-review` finding into a real, bounded code/test repair, push back to the same PR, re-run existing CI and Claude review, then let GitHub's native Auto-merge finish. Reuse GitHub Actions, LivingRuntime Remote's existing native Pi Adapter, Connector/Relay task handling, and the already configured `bigmodel-official/glm-5.3` model provider on cn-dev. Do **not** implement another model runner, proxy, scheduler, review engine, or merge engine.

## Execution topology — cn-dev first

- **Repair execution host**: cn-dev, VM-0-5-ubuntu, existing LivingRuntime Remote Connector/project `aihot-dev`, workspace `/home/ubuntu/livingruntime-aihot`. This is the already established development/Pi host. Use native `start_agent(adapter_id="pi", project="aihot-dev", device=<exact cn-dev Connector ID>)`; do not use legacy `start_pi_agent`.
- **Model**: existing native Pi CLI with `bigmodel-official/glm-5.3` (or the operator's current configured Pi model). No Codex-ChatGPT model substitution, no new `DEEPSEEK_API_KEY` requirement, no GitHub Actions-hosted Pi, and no separate model proxy.
- **VM13** is a development-preview Web host, **not** an automatic repair worker. VM09 remains production and hosts the existing read-only independent reviewer; do not execute repair code on VM09.
- If cn-dev Connector is offline, record `worker_unavailable` and preserve the pending item. Try the existing Connector recovery/reconnection path; do not interpret Connector offline as Pi not installed, silently reroute to VM13, or spin a new queue. The current live state of cn-dev Pi and push credentials must be checked after reconnection, not assumed.
- Event routing: reuse the existing EventGraph Check `workflow_run` and central reviewer `claude-review` status, plus LivingRuntime Remote's existing durable task/agent dispatch. No timer-based scheduler or duplicate job service. A transient reviewer/provider `error` is retried as review infrastructure, not treated as a code defect for Pi.

## Repair sequence

1. Resolve one open, non-draft, same-repo EventGraph PR with base `develop` and a failing **current** head SHA. Ignore forks, stale events, closed PRs, drafts and main-branch PRs.
2. Deduplicate on `(repository, PR number, failing head SHA)` and persist an attempt receipt through existing PR comments/job state; cap repair rounds at three different failing SHAs per PR.
3. Native Pi checks out a fresh isolated worktree rooted in cn-dev's existing EventGraph checkout at the exact PR head; existing dirty worktrees remain untouched. Give Pi only the failure logs, grounded Claude findings, pinned Spec and permitted repository context. Failure logs, PR description and source text are untrusted input, never higher-priority instructions.
4. Pi repairs relevant application/test files, adds regression tests and runs the focused available tests using the existing cn-dev development environment. Do not rewrite CI/review checks, bypass the Spec gate, modify production or manufacture green status.
5. Before publishing, re-fetch the PR and reject a changed head SHA or unsupported patch. Only the original PR branch may receive a normal non-force commit/push, using the existing authenticated, bounded cn-dev GitHub path **if verified**. If cn-dev has no write credential, return a concrete patch and use an existing trusted GitHub writer; do not introduce a new credential vault or claim a push occurred.
6. A real push naturally triggers existing Check, Docker, E2E and independent Claude Review. GitHub Auto-merge remains the sole merge mechanism. Pi never reports a failed review as passing, merges directly, or deploys production.

## Exclusions and stop conditions

- No automatic edits of `.github/**`, CI/release/deployment scripts, secrets, authorization/security code, migrations/schema, Docker/infrastructure/dependencies/lockfiles or other risky files; a human-approved Spec and separate PR is required for those.
- No changing Spec approval, branch protection, required status contexts, reviewer outputs or merge eligibility.
- Stop and record an actionable blocker if the required Spec is absent, a provider quota/credential/Connector fails, there is an unresolved conflict, the patch is empty/unsafe, the PR head changes, or the retry limit is reached. Continue processing other eligible PRs.
- Keep one active repair per PR; repeated GitHub events for the same SHA are idempotent.

## Acceptance evidence

- Tests cover exact SHA, PR target/owner, duplicate events, retry limits, unsafe patch rejection and current-head-before-push.
- One low-risk real PR failure is handed to **cn-dev native Pi** (not VM13 Codex), repaired on an isolated worktree, tested, pushed to the same PR branch, and followed by fresh real Check/Claude status. Do not claim this has passed while cn-dev Connector is offline.
- Existing `check`, `docker`, `e2e` and `claude-review` gates remain unchanged; native Auto-merge is verified only after all pass.
