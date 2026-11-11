# Admin model management — simple CRUD list

## User-approved change (2026-11-03)
The owner wants /admin/models to have a model CRUD list and a Test action on every model row, rather than the current multi-panel provider/routing console.

## Requirements
1. Show a single searchable, paginated table of models, with identity, connection, type and enabled state.
2. Every row has **View, Edit, Test, Delete**. An explicit test click invokes only that model's existing test endpoint, never a bulk test.
3. Add model opens a concise form; existing provider connections are selectable. If none is suitable, create the connection inline without showing a separate provider-management table.
4. Preserve current model fields not edited in the compact form, with a collapsed optional per-model test specification for custom probes. Default standard chat/embedding sample probes during creation.
5. Reuse existing authenticated API, encrypted secret handling, per-model test receipts, backend validation, audit logging, optimistic versions and deletion dependency checks.
6. On failed or unsupported testing, give actionable feedback without inventing success. Reflect the latest returned test status and latency.
7. Remove provider list, discovery, bulk probe controls and workflow-routing tab **from this page only**; do not remove API, database tables, or runtime routing functionality.

## Acceptance
- 390 px mobile and desktop both expose the one-list workflow.
- A new model can be created with an existing provider or a newly defined provider; edit/view/delete refresh data without leaking API keys.
- A model can be individually tested and its result is visible; a model without a probe displays a clear next action.
- Existing API errors and model dependencies are displayed.
- UI tests cover CRUD and test button behavior. Typecheck/build checks pass.
- Implementation targets develop only; deployment is a separate verified CD outcome.
