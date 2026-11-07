# GH-AW Worker 终态自动对账，防止队列容量被永久占用

**Status:** Draft
**Target:** develop
**Delivery:** Existing independent Spec Review → automatic owner-delegated approval → merge develop → deterministic Producer → Project #2 Todo → native GH-AW Worker implementation PR. The effective workflow lives on the default branch; promote through existing develop→main process separately, without publishing application runtime.

## 1. User problem, evidence, and outcome

2026-11-07, the owner had to manually execute `gh aw work-queue --repo jboone1989/EventGraph reconcile --dispatch-id ... --json` for two terminal failed native Worker runs:
- Issue #477, run 42369727567, dispatch `d_15c036ba0a724fd613e172bf38b89d44d15b1e312db59537ee37ddafdbe5163f_1`.
- Issue #488, run 42371879422, dispatch `d_8f38f2cc00d64e2997e6c510a4a1d495cab906fced0d511a1e1e291737a03823_1`.

Both returned `native_released_delivery_independent` with a published `Release`, even though their Actions conclusion was `failure`. Before these releases, unfinished Work for #490 and #491 had been admitted but did not receive native Claims; after release, the native Dispatcher and a new Worker launched. These are observed correlations, not proof every failure has the same cause.

In `.github/workflows/eventgraph-native-queue-events.yml`, the existing `workflow_run: completed` trigger includes `EventGraph GH-AW Worker`, but `jobs.resume.if` requires `workflow_run.conclusion == 'success'`. A terminal failed/cancelled/timed-out Worker is therefore skipped, and no CLI release reconciliation occurs. The existing event-driven continuation deliberately does **not** relaunch paid Agents following a failed Worker.

**User outcome:** the owner no longer has to diagnose and manually release native GH-AW Worker capacity after a terminal run; pending approved Work is not stuck behind a stale terminal reservation. Preserve correct Work/PR delivery status and all current review/security boundaries.

## 2. Authoritative flow and product rules

1. Extend the existing `.github/workflows/eventgraph-native-queue-events.yml` only. A same-repository native Worker `workflow_run` with `event == workflow_dispatch`, exact `path == .github/workflows/eventgraph-worker.lock.yml`, and `status == completed` must execute the pinned official `gh aw work-queue --repo jboone1989/EventGraph reconcile --dispatch-id <native dispatch id> --json` even when the worker conclusion is failure, cancelled, timed_out or success. Continue to honor the existing queue-enable configuration for normal dispatch; do not create a new workflow, cron, polling service, lock table or queue.
2. Extract the exact dispatch ID from the native run's **actual** `display_title` (`gh-aw work-queue d_<64-hex>_<attempt>`, evidenced by run 42371879422 and 42375898305). Validate the anchored format and trusted workflow identity before executing CLI; if missing/ambiguous, fail visibly with run URL/ID and a diagnostic instead of inventing an ID, examining arbitrary user text, or reconciling a different run.
3. Treat `reconcile` as the **only** authority for release. It uses verified terminal GitHub evidence and native queue compare-and-set, not a forced unlock. A known terminal run may be safely reconciled again by the existing CLI; repeated event/retry must not create a duplicate PR or run. Capture the CLI reason and whether a Release was published. An unknown/nonterminal run must not release.
4. Reconciliation must run **before** any eligible-work dispatch logic. Failed/cancelled Worker results must **not** directly dispatch or retry a paid Worker, repeat safe-output writes, or mark Issue/Claim/PR as delivered. A successful Worker may continue through the pre-existing single-open-`agent-work`-PR gate and `grants_paused` / `scheduling_eligible` checks. Preserve current develop Check-triggered Spec task admission and PR lifecycle.
5. If CLI authentication, evidence, or queue reconciliation fails, the step must fail visibly and leave the native reservation untouched. Include exact run/dispatch in the logs and a documented official manual recovery command. Do not auto-clear/cancel/force-rewrite the ledger or retry a Work with already-created PR.
6. If `EVENTGRAPH_NATIVE_QUEUE_EVENTS_ENABLED` is disabled, no Worker dispatch is permitted; document how an operator handles terminal reservations during intentional pauses without silently re-enabling a queue. A successful manual `reconcile` does not by itself authorize a new Worker dispatch.
7. Reuse existing `GH_AW_GITHUB_TOKEN`, pinned `github/gh-aw/actions/setup-cli`, and the same serialized continuation job. No new secrets, broader `GITHUB_TOKEN` permissions, new Worker route, queue policy, job scheduler, or database migration.
8. This is a control-plane workflow change, not an EventGraph application feature. It changes no production deployment or `main` directly. Since `workflow_run` is evaluated on the repository default branch, merging the implementation to `develop` **alone** does not establish that the fix is active; the existing approved develop→main promotion must include this YAML before the real failure-case event can prove automatic recovery.

## 3. Observable experience and states

- Normal successful Worker → native terminal evidence is reconciled → existing PR merge/CI gates determine if and when more Work dispatches; never declare a feature done just from Worker success.
- Worker fails **after creating a PR** (as #488) → release verified terminal reservation; preserve the real PR and its review status; do not create another PR for the same Claim.
- Worker fails **before creating a PR** (as #477) → release reservation; native Work/Claim failure remains truthful; no automatic paid retry on this failed-run event.
- Unexpected title/path, missing permission, malformed evidence or CLI failure → show an actionable red Actions job with exact native run and remediation; do not fake release.
- Queue paused/feature flag disabled → no new dispatch, regardless of release outcome.

## 4. Given / When / Then acceptance

1. **Given** a verified same-repo completed Worker failure with a valid dispatch title, **when** the `workflow_run` continuation fires, **then** the official CLI reconcile is invoked for exactly that dispatch ID, publishes a Release only if native evidence permits it, and leaves no verified terminal reservation occupying a slot.
2. **Given** a cancelled/timed-out Worker, **when** terminal evidence is available, **then** reconciliation is still attempted; neither path launches a new Worker or retries the failed Claim from the failure event.
3. **Given** a successful Worker, **when** continuation processes it, **then** reconciliation occurs before the original one-PR serialization and eligibility/dispatch checks; there is no second dispatch if an agent-work PR is open.
4. **Given** a non-Worker event, a fork/untrusted repo, an invalid/missing `display_title`, or a nonterminal run, **when** evaluated, **then** it cannot release an unrelated reservation. Trusted malformed Worker completion fails closed with clear diagnostics.
5. **Given** duplicate continuation or a safe-output failure after PR creation, **when** reconciliation repeats, **then** it remains idempotent and does not duplicate a PR or falsely mark the work successful.
6. **Given** an API/token/reconcile error or paused queue, **when** the workflow runs, **then** failure is visible and dispatch is inhibited; the official exact-dispatch manual recovery path is documented, with no custom fallback or ledger manipulation.
7. **Given** changed workflow code, **when** existing Check/actionlint/focused deterministic tests run, **then** failure/success/cancelled, invalid title, duplicate event and paused/disabled cases are covered, and the worker PR includes scenario → code → test PASS/FAIL/UNVERIFIED. A successful green test on develop is *not* presented as verified default-branch runtime behavior.

## 5. Boundaries

Maintain one native Queue, existing EventGraph Dispatcher/Worker and Project #2, concurrency, immutable Work Claim contracts, current `develop` Spec-first workflow, independent checks/review, and develop→main release separation. Never bypass approved review/branch protection, force-complete a Claim, auto-retry a failed paid Agent, touch VM09, or create an application deploy.
