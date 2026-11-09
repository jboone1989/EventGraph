# Implementation plan — `/admin/runs` consistency + fixed-model binding correctness

## Prior evidence (Search Before Build)

1. Navigation: `packages/backend/src/admin/navigation.ts` → `navCounts()`; `apps/web/app/routes/admin/layout.tsx` → loader/`NavCount()`. Current count uses distinct unfinished **articles**, whereas `apps/web/app/routes/admin/runs.tsx` uses `AdminRuns.flowItems` filtered by status. Backend aggregated rows come from `packages/backend/src/admin/runs.ts` → `allFlowItemsOverview()`.
2. Model state: `packages/backend/src/providers/registry/connections.ts` → `routingState()`, `loadModel()`, `listRegisteredModels()`, `writeWorkflowModel()`, and `workflowDependencies()`; `runtime.ts` → `registeredRuntime()`; `admin/models.ts` → `switchModel()` and `modelBindingsOverview()`; `editorial/models.ts` → `validChoice()`, `modelFor()`; UI `apps/web/app/routes/admin/model-bindings.tsx`.
3. Group pipeline: `packages/backend/src/events/group.ts` calls `modelFor('group')`/`groupReview`, reports failures into `grouping_error`; `apps/web/app/routes/admin/runs.tsx` already supports safe article/job requeue and 20s refresh. #477 owns batch/Graphiti/long-ID table work. Do not duplicate.
4. Existing UI: `apps/web/app/features/admin/ui.tsx` contains `AdminPage`, `Badge`, `DataTable`, `Select`, `Button` and `Pager`; use before considering third-party packages. Existing tests: `apps/web/tests/runs-focus.test.ts`, `apps/web/tests/model-bindings.test.ts`, `tests/admin-ops.test.ts`, `tests/model-binding-inventory.test.ts`, `tests/provider-connections.test.ts`, and `tests/admin-live-pipeline.test.ts`.
5. Quality contract: PR #487 / `specs/reuse-first-admin-components-20261107/spec.md`, Issue #488. Check whether #488 was implemented before claiming the new review standards actually enforced; do not invent a second review layer.

## Implementation sequence

### A — Bindings cannot quietly become unusable

- Make the existing model-binding backend (including `writeWorkflowModel` or its callers as appropriate) apply the same capability-aware `routingState` guard as runtime when committing a specific fixed model. Use existing transaction and dependency relationships; no new model state table or migration.
- Enumerate and reuse the current model/connection update and dependency code paths. On disabling a bound model/connection, respond with a clear existing-style validation error that names affected workflow bindings. Preserve edits that are safe; do not silently change a user's fixed choice, its credentials, or paid/free policy. The current invalid historical selection must remain visible for repair.
- Extend `AdminModelBindings.choices` (if necessary) with verified availability/reason fields directly from `RegisteredModel.routing`; render invalid choices disabled *for new selection* yet keep current invalid selection legible. Shared UI controls, loading/success/error patterns only.
- Ensure `modelFor` and admin binding state convey the same fixed/auto semantics and do not silently accept an existing disabled model as a new valid choice. Existing group failure reporting remains intact until the user corrects config; no runtime retry surprises.
- Focused backend tests for fixed text binding on enabled/disabled/route-disabled connection, missing credential, incompatible capability, stale model config, two same-name distinct UUIDs and legitimate rebind-first disable; browser test for invalid existing selection and 390px form behavior.

### B — One definition for sidebar and page failure counts

- Identify the smallest shared server-side implementation yielding the exact current-day failed `AdminFlowItem` count used in `runsOverview` without a second divergent SQL definition or heavy unbounded query. Reuse actual active flow aggregation and typing, and expose an explicit all-kind failure count.
- Keep page state/filters and #477 retry behavior intact; the sidebar badge changes to count failed flow **units**, not all unfinished articles. Make metadata accessible and legible. Align after user action and current 20s refresh (reuse existing mechanisms; no new global polling service).
- Test 7 unique unfinished articles + 59 failed units, job/receipt overlap, successful recovery to pending/processing, UTC midnight, zero values, kind filter, stale navigation fetch, and 20 vs 21 rows. At 1530/390 widths test badge and page text/behavior.

## Review and release evidence

- Spec-only PR must be independently reviewed and automatically approved/merged first; must include *only* `spec.md`, `plan.md`, `tasks.md` as Draft.
- Existing deterministic Producer turns two Work Items into `agent-work` Issues via Project #2 and original GH-AW queue; code PRs refer to the immutable merge SHA. Keep two small implementation PRs under the one-open-PR serialization rule.
- For each Work Item, require acceptance → changed code → tests + actual result (PASS/FAIL/UNVERIFIED) and explicit reuse choice. Check/typecheck/unit/Playwright at relevant viewport, Docker/E2E and independent review must be evidenced. PR merge to develop is not proof of VM13 or production deployment; do not promote to main.
