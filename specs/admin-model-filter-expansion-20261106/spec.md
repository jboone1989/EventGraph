# Extend model-list filters (2026-11-06)

**Status:** Owner-approved

## Owner clarification
On 2026-11-06, after approving the pagination + one-click testing Spec in PR #450, the owner asked for more filters because the model registry is large. This is an **additive refinement** to the existing single-task implementation [Issue #451](https://github.com/jboone1989/EventGraph/issues/451), NOT a separate model console or second implementation PR.

## Requirements
1. On `/admin/models`, retain model ID/provider name keyword search, and add combinable dropdown filters for:
   - **Provider connection** (all / each actually registered connection, display human-friendly vendor and connection name);
   - **Billing** (all / free / paid);
   - **Adapter / use** (all / chat / embedding / other available registered adapters);
   - **Complexity** (all / light / medium / heavy);
   - **Enabled status** (all / enabled / disabled);
   - **Latest test result** (all / passed / failed / untested), based on latest in-page result if present, otherwise latest recorded check of the model's configured probe capability.
2. Search and filters combine by intersection. Changing any search/filter resets to page 1. The page shows **matched / total** model counts; `Clear filters` restores all models. Zero matches show an actionable empty state, not a blank grid.
3. Existing pagination applies **after filtering** (20/page), with accurate page count. Do not re-fetch or create new API endpoints for filtering: use existing `ProviderManagement` payload and local UI state.
4. `One-click test` targets **all currently filtered models**, across pages, not all models in the database when a filter is active. Display target total, passed/failed/skipped progress, rate limiting errors and paid-model confirmation from PR #450's primary Spec.
5. Keep per-row Edit, Test and Delete and the current backend probe endpoint. Do not auto-enable, change workflow bindings, refresh paid probes on page load, add provider integrations, or build a separate batch testing engine.

## Acceptance
- 30+ fixture models across at least two connections and 3 billing/adapter combinations exercise each dropdown, combined filters, clearing and pagination.
- Tests show test-status filtering prefers the live per-row outcome over stale recorded checks.
- Batch testing under an active filter sends requests only to matched models across all matched pages, with the existing two-request concurrency cap.
- 390px/mobile and desktop expose all filters without breaking pagination or row operations.
- No duplicate GH-AW task: implement these additive filters as part of existing T001 / Issue #451 once this Spec is approved and merged. Keep one implementation PR and reference both immutable approved Specs.
