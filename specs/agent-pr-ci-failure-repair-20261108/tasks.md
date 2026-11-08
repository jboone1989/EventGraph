# Work items — restore original Agent PR on failing CI

## T001 — GH-AW native same-PR CI repair and queue continuation

**Priority:** Blocker
**Depends on:** none
**Spec:** specs/agent-pr-ci-failure-repair-20261108/spec.md

### Scope

Implement bounded, safe, event-driven repair of a failed current-head `agent-work` PR through official GH-AW `push-to-pull-request-branch`. Preserve original PR/Issue/Spec and existing independent checks. Avoid adding a second queue or agent-runner infrastructure.

### Observable acceptance

1. #501 current Typecheck TS2559 failure is detected from GitHub's exact run/job logs without manual code edits, repaired on #501's existing branch by GH-AW, and new HEAD receives genuine check/docker/e2e/review.
2. A green current-head check auto-merges #501 to `develop`; verified development release/VM13 follows.
3. Once #501 releases its serialization slot, the *existing native queue* admits/dispatches the next eligible approved tasks (#477 and #490) without a timer or operator manually choosing a Work.
4. Explicitly cover the complete Check workflow's failed required Jobs: `check`-only, Docker-only (`check` green), E2E-only (`check` green), and an actionable `claude-review` finding; each has the same PR/HEAD-scoped recovery path. Runner/registry/provider/quota or unstructured reviewer failures report an actionable infrastructure/manual-takeover blocker, **without** pretending a code fix can solve them.
5. Repeated events and stale SHA are ignored; two failed repair rounds stop visibly; attempts never modify dangerous/protected paths or bypass review rules.
6. #482 Draft remains unmerged until it stops deleting historical articles, regardless of unrelated CI success.
7. Official compiler-generated lock files match sources, focused regression tests pass, existing full CI and independent code review pass.

### Non-goals

No secondary PR to implement #501, no manual coordinator edit to its business tests; no changes to main/production, migrations, credentials, review required checks or Work Queue ledger.
