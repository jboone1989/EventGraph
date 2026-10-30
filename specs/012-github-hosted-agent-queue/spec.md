# GitHub-hosted autonomous development queue

**Status:** Owner-approved direction; independent Spec review passed (0 blocking, 0 non-blocking)  
**Date:** 2026-10-30  
**Target repository:** `jboone1989/EventGraph`  
**Target development branch:** `develop`

## 1. Problem

Development work currently depends on a person repeatedly prompting an agent to continue. A persistent Claude Code session and a host timer do not provide a durable, verifiable task lifecycle. A second hand-built queue would duplicate GitHub's task, workflow, and history capabilities.

The development workflow must be driven by GitHub events and durable GitHub state. It must continue without a ChatGPT conversation remaining open and without code execution on cn-dev, VM13, VM09, or another user-managed host.

## 2. Owner-approved scope

The owner approved the direction in the 2026-10-30 conversation with **“做吧”**, after specifying:

- use GitHub-hosted execution rather than cn-dev;
- prefer existing GitHub capabilities instead of building a parallel scheduler;
- do not retain the previous Pi/systemd-timer/tmux scheduling approach.

This is a development-automation control plane only. It does not replace EventGraph's application runtime queue (PostgreSQL/pg-boss).

## 3. User-visible behavior

1. A maintainer marks an eligible GitHub Issue with the `agent-ready` label. The Issue must identify a previously merged and approved Spec by exact path and 40-character commit SHA, include approval evidence, and contain testable acceptance criteria.
2. GitHub Actions admits the Issue as immutable Work in the official GitHub Agentic Workflows (GH-AW) Work Queue. The Work Queue's Git-backed ledger is authoritative; no `tasks.json`, `runs.jsonl`, custom database, or host-side scheduler is introduced.
3. The GH-AW dispatcher requests one eligible Claim. The Work Queue, not the agent prompt, selects the next task according to its configured policy.
4. A GH-AW worker runs on a GitHub-hosted `ubuntu-latest` runner, checks out EventGraph `develop`, verifies the immutable approved Spec, researches existing code/upstream/official interfaces, implements the task, runs relevant tests, and proposes one PR targeting `develop`.
5. The worker has no direct GitHub write permissions. PR creation and queue completion use GH-AW's claim-scoped safe-output and Work Queue mechanisms. Every immutable Work carries a closed version-1 `effect_contract` and `resource_scope`: synthetic smoke Work uses `{"kind":"none"}`; code Work permits exactly one `create_pull_request` output scoped to the EventGraph repository. No other agent-authored write is authorized.
6. The existing Check/E2E/Docker and independent R01–R18 review remain mandatory. The PR is eligible for squash merge only when the exact current PR HEAD has every required check and an explicit successful independent review. No branch-protection bypass is allowed.
7. The dispatcher must not request another Claim while an open `agent-work` PR targets `develop`. Worker completion triggers a dispatcher check: if that PR exists, it waits; if no PR exists, the native Work Queue may retry the failed Work. A merged PR triggers the next dispatch. The PR merge path runs only after successful exact-SHA Check and independent review, uses a normal squash merge without `--admin`, then explicitly dispatches the next dispatcher with `workflow_dispatch` because GITHUB_TOKEN-created PR-close events do not reliably start follow-on workflows. Manual merges also resume through the merged-PR event. This keeps one implementation PR in flight and prevents later work from silently building on unmerged code.
8. Queue progression is event-driven: a GH-AW Producer accepts maintainer-labeled Issues, a GH-AW Dispatcher requests native Claims, and a GH-AW Worker executes them. Worker completion, Check/review completion, and PR merge events resume the appropriate workflow. The Dispatcher checks for an open `agent-work` PR before dispatching. Configure native Work Queue concurrency to one Claim per pool and a short bounded retry backoff; no systemd timer, Linux cron, scheduled polling loop, tmux session, or persistent agent process is used. A manual workflow-dispatch recovery entry point is allowed.
9. The model endpoint and key are configuration, not code: reuse the EventGraph repository's `GLM_API_KEY` secret referenced by the default-branch `main` workflow `.github/workflows/claude-pr-dispatch.yml` when it calls the central reusable reviewer; the existing successful hosted review run confirms that secret is readable. Use GLM-5.3 initially. Set `ANTHROPIC_BASE_URL` from `vars.GLM_BASE_URL` when configured, otherwise use `https://open.bigmodel.cn/api/anthropic`. Verify the same secret is readable by the GH-AW worker before enabling intake. Changing provider credentials or base URL must not require rewriting the scheduler or worker logic.

## 4. Platform and branch constraints

- Use GH-AW v1.0.1, pinned, and its native Work Queue; do not hand-implement queue storage, fairness, Claims, retry state, or task dependency state.
- All agent and framework jobs use GitHub-hosted runners. No self-hosted runner or SSH hop is part of the development execution path.
- EventGraph's GitHub default branch is currently `main`, while normal development targets `develop`. GH-AW requires worker workflow sources and compiled locks to be registered on the repository default branch. Therefore the worker workflow definition must be present on `main`, but its code checkout and PR base must remain `develop`. Promote only the approved automation workflow/configuration files to `main`; do not merge unrelated `develop` application commits, change the default branch, or release application code as a side effect.
- GH-AW source Markdown and generated `.lock.yml` files must be compiled by the pinned official CLI and committed together. Generated lock files must never be hand-authored.
- The GitHub Actions token does not automatically trigger follow-on workflows for most events it creates. Where safe-output PR creation uses that token, explicitly dispatch the existing Check workflow for the exact PR SHA through the supported `workflow_dispatch` event; do not assume a `pull_request` event will fire. GitHub loads the `workflow_run` listener from the repository default branch, `main`; the `main` version of EventGraph `.github/workflows/claude-pr-dispatch.yml` already forwards every completed Check run to the central reusable reviewer and passes the EventGraph `GLM_API_KEY` secret. Its `workflow_run.pull_requests` entry may be empty for a `workflow_dispatch` Check, but the central reusable reviewer already resolves an open same-repository PR by exact checked SHA when `pr_number` is empty. Update `jboone1989/livingruntime-remote/.github/workflows/eventgraph-glm-review.yml` so its successful-Check preflight accepts both `pull_request` and `workflow_dispatch` events; retain exact-SHA PR resolution and the live-HEAD staleness guard. Do not rely on the older `develop` copy of `claude-pr-dispatch.yml` as the active `workflow_run` listener. Extend both default-branch `main` and development-branch `develop` copies of EventGraph `.github/workflows/check.yml` so a dispatched Check for an `agent/*` code PR branch runs the real Docker integration, while preserving the existing `chore/aihot-upstream-*` behavior. The E2E job already runs for non-docs `workflow_dispatch` checks. Documentation-only PRs may keep the existing heavy-test skip behavior.
- Keep the existing Spec gate. Every code-producing Work must carry an immutable Spec path/SHA and approval evidence; the worker must verify that the Spec is already on `develop` and unchanged before editing code.

## 5. Acceptance criteria

### A. Queue and dispatch

- [ ] GH-AW source and lock files compile with pinned GH-AW v1.0.1 in strict mode.
- [ ] The first accepted submission initializes the native Work Queue and its Policy on the dedicated `work-queue` branch.
- [ ] A synthetic no-write Work is admitted, receives exactly one Claim, runs on a GitHub-hosted runner, finishes, and obtains a verified Result.
- [ ] The dispatcher cannot choose a specific Work or worker; it requests a bounded pool prefix and the native scheduler selects it.
- [ ] `.github/workflows/aw.json` sets native Work Queue concurrency to one Claim per pool; duplicate Issue events do not create duplicate Work.
- [ ] Every Work has a closed version-1 `effect_contract` and immutable `resource_scope`; code Work permits exactly one repository-scoped `create_pull_request`, while synthetic smoke Work permits no resource effects.
- [ ] A second synthetic Work is dispatched automatically after the first Work's lifecycle completes, without a user prompt or external timer.

### B. Real development delivery

- [ ] An owner-approved Issue with a valid pinned Spec is admitted automatically.
- [ ] The worker runs only on GitHub-hosted infrastructure and checks out `develop`; no user-managed host is contacted.
- [ ] The worker creates one PR to `develop` with the exact Spec path/SHA and approval evidence in its body.
- [ ] The PR's exact HEAD receives Check, E2E, Docker, and independent R01–R18 review. A stale Check or review cannot authorize a newer SHA.
- [ ] For a worker-created PR using `GITHUB_TOKEN`, a successful `workflow_dispatch` Check automatically triggers the central independent reviewer after exact open-PR/live-SHA validation; the resulting review is recorded against that exact PR SHA without a manual prompt.
- [ ] The same dispatched Check runs the real Docker integration for code PRs; the job cannot be silently skipped merely because the event is `workflow_dispatch`.
- [ ] A passing PR is squash-merged by the default-branch merge workflow only after exact-SHA Check and independent review success, without bypassing branch protection; a failing or blocked PR stops queue progression and preserves evidence.
- [ ] The dispatcher never launches another Worker while an `agent-work` PR to `develop` is open; successful merge automatically resumes the queue.
- [ ] After merge, the next queued Work starts automatically from the new `develop` HEAD.

### C. Operational behavior

- [ ] No `tasks.json`, `runs.jsonl`, host-side queue, timer, cron, tmux, or long-running agent is required.
- [ ] Queue state, claims, attempts, delivery and result can be inspected through the official GH-AW operator CLI and GitHub Actions history.
- [ ] The implementation verifies that GLM credentials are configured and readable by an EventGraph-hosted workflow before the hosted smoke test; missing credentials block intake.
- [ ] Missing credentials, unsupported API compatibility, queue protocol errors, failed checks, or failed review are visible as failures/blocked work; they are never reported as completed.
- [ ] A real hosted smoke test is required before enabling the development intake label for normal work.

## 6. Out of scope

- EventGraph product features, its PostgreSQL/pg-boss runtime queue, production deployment, and application architecture.
- Reusing Pi, the old Pi auto-repair flow, VM09/VM13/cn-dev execution, systemd timers, cron, or tmux.
- Changing EventGraph's default branch or merging unrelated `develop` work to `main`.
- Weakening Spec, Check, E2E, Docker, R01–R18 review, or branch-protection gates.

## 7. Research basis

The implementation plan must record the exact pinned GH-AW release, Work Queue deployment and effect-contract requirements, the official hosted-runner execution constraints, the existing EventGraph Spec gate and CI workflow, and the existing reusable hosted GLM reviewer in `jboone1989/livingruntime-remote`. It must also record the Work Queue documentation's explicit statement that model tests and fixtures do not prove a live hosted Result; the hosted smoke test above is therefore a release gate, not an optional demo.
