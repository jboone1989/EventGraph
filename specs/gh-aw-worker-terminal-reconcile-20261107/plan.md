# Implementation plan — native Worker terminal reconciliation

## Search Before Build (confirmed 2026-11-07)

- `.github/workflows/eventgraph-native-queue-events.yml` already receives `workflow_run: completed` for `EventGraph GH-AW Worker`, installs pinned `github/gh-aw/actions/setup-cli@... v1.0.1`, and checks `grants_paused` / `scheduling_eligible`. Its current `jobs.resume.if` filters out failed Workers. Reuse this job and the existing queue flag.
- Existing native Worker is `.github/workflows/eventgraph-worker.lock.yml` and runs on GitHub Actions, with native run title `gh-aw work-queue d_<64hex>_<attempt>` (runs 42371879422 / 42375898305); do not infer the dispatch from mutable PR text or random Issues.
- `scripts/ci/spec-task-producer.mjs` and `check.yml` already handle owner-approved Spec intake and merged Work completion. Do not change those for reservation cleanup.
- Official GitHub gh-aw Work Queue operator documentation documents `reconcile --dispatch-id ID` and native evidence/terminal reservation release: https://github.github.com/gh-aw/reference/work-queue/ . Verify exact flags against pinned v1.0.1 before editing.
- Owner executed that exact CLI on run #42369727567 and #42371879422: each published `Release`, reason `native_released_delivery_independent`. The second run created PR #492 even though `safe_outputs` ended in failure; preserve this independently validated PR.
- Existing `scripts/ci/gh-aw-local-worker.test.mjs`, `scripts/ci/check-docs.test.mjs`, and `scripts/ci/spec-review-gate.test.mjs` are likely test/reuse entrypoints. Confirm current version and add only focused event-contract tests.

## Delivery sequence

1. Independent Spec-review on a Draft PR; auto-approve/merge to develop using existing workflow, generating exactly one native T001 Work and Project Todo.
2. Worker reads immutable Spec SHA; minimally alters the existing queue continuation job: allow verified `status == completed` Worker completions regardless of conclusion (including unknown/new values); insert trusted dispatch-ID extraction and CLI reconciliation even when queue event dispatch is disabled or native grants are paused, before normal dispatch; gate normal dispatch on the existing queue-enable flag, native grants pause and success/develop event conditions so failed Worker never triggers paid retry. A clean pause is not an Actions failure, while a real reconcile error is.
3. Add focused deterministic fixtures for completed-success/failure/cancelled/timed_out/startup_failure/skipped/future-unrecognized conclusion, invalid title/path/foreign repo, repeated completion, open agent-work PR, disabled queue flag, native grants paused (both reconcile and clean-skip dispatch), and reconcile failure while paused. Validate official CLI command and shell quoting, workflow parsing/actionlint, existing tests, and independent review. Avoid new helper abstraction if a short safe inline step suffices.
4. Implementation PR references exact Issue/T001/Spec SHA; pass current Check, Docker/E2E as required and independent review before auto-squash to develop.
5. State explicitly the default-branch activation gate. Do not silently promote to main; only after normal authorized develop→main control-plane promotion and real completed Worker event can automatic reconciliation be called operational.

## No new infrastructure

No additional Actions workflow, cron, polling, daemon, queue ledger, custom retry, credentials, or second Agent. Preserve existing constraints and server deployment boundary.
