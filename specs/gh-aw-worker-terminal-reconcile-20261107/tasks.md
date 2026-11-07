# Work items — auto-reconcile terminal GH-AW Worker reservations

## Work Items

### T001 — Reconcile every verified terminal Worker without retrying failed Agents
**Scope:** Extend existing `.github/workflows/eventgraph-native-queue-events.yml` to reconcile verified terminal native Worker reservations on success/failure/cancelled/timed-out runs using the pinned official `gh aw work-queue reconcile --dispatch-id` command. Parse the actual native run title safely, make failure visible, and keep all existing dispatch, queue pause, PR serialization, Spec intake, and review behavior unchanged. Add focused deterministic contract tests. Do not create new schedulers or touch production/main.
**Depends on:** none
**Acceptance:**
- For genuine same-repository native Worker `workflow_dispatch` completed events (including failed/cancelled/timed_out), validate the workflow path and anchored exact `display_title` and call official `reconcile --dispatch-id` once before any dispatch gate; never guess or operate on a different ID.
- Reconcile confirmed-terminal evidence with official native semantics, remain idempotent on repeated events, record release/no-change/error truthfully; failures are visible and do not force-edit the ledger.
- On unsuccessful Worker outcome, never launch an additional paid Worker, re-run a Claim, mark it successful or duplicate a previously-created PR. Preserve success-only downstream dispatch plus existing one-open-`agent-work`-PR and paused/eligibility checks.
- Protect against foreign repo, wrong workflow, missing/ambiguous title, nonterminal run, missing `GH_AW_GITHUB_TOKEN`, disabled flag, and errors with deterministic tests and actionable diagnostics; do not change Queue Policy, concurrency, secrets, or PR merge gates.
- Validate workflow syntax/actionlint and existing Check; provide a scenario → implementation → observed tests/results matrix in the worker implementation PR. Document that develop merge alone does not activate the default-branch workflow; do not publish main or production.
