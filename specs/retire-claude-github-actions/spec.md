# Retire Claude Code from EventGraph GitHub automation

Status: Approved by repository owner in chat on 2026-11-04.

## Goal
GitHub Actions must not invoke Claude Code for code development, PR review, proposal review, orchestration, or queue dispatch.

## Scope
- Remove the EventGraph Claude Code Action PR review and its Check-triggered dispatcher.
- Retire GH-AW Worker and Dispatcher workflows currently using `engine: claude`, their compiled lock workflows and their auto-dispatch entrypoints, without substituting another paid AI engine.
- Remove the central GitHub Actions Claude review dispatch dependency; it is retired separately in `jboone1989/livingruntime-remote`.
- Remove the redundant CI reviewer preflight and queued native agent re-entry logic that invokes the Claude-based Worker/Dispatcher.
- Preserve ordinary deterministic CI, typechecks, tests, Docker, E2E, deployment, and existing Spec gate.
- Update required branch checks to exclude `claude-review`, leaving `check`, `docker`, and `e2e` as applicable.
- Do not remove unrelated optional local development tools or database/application model providers.

## Acceptance
1. No enabled GitHub workflow in EventGraph (or the former central reviewer) invokes `anthropics/claude-code-action`, a Claude CLI runner, or GH-AW `engine: claude`.
2. A PR can pass its required checks without any `claude-review` status.
3. No scheduled or automatic workflow dispatches the retired Claude-based Worker.
4. Standard CI and deployment still function; no production application deployment is needed for this CI-only change.
