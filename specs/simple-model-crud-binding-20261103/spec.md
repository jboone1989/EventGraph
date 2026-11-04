# Simple model and workflow binding CRUD

## Owner decision — 2026-11-03

The feature is a normal relational CRUD, not a separate model catalogue, presets, automatic refresh, or orchestration system.

- `registered_models` is the **only** inventory of selectable models, with foreign key to `provider_connections` (existing provider credentials CRUD).
- `provider_workflow_models` is the workflow → registered model relation. Workflow stages are defined by the app; choices come directly from current `registered_models`, no static preset list.
- The binding page queries the DB on navigation. No poll, focus/visibility refresh, secondary cache, sync task or manual refresh button.
- Binding Save/Unbind is simple assignment CRUD. Saving a valid chat model is allowed even before its separate connection/model test; execution checks and API errors still apply at runtime. Only model type and required vision capability are validated for a given workflow stage.
- Deleting a model must remove its workflow bindings in the **same transaction**, then delete the model (existing check and alias foreign keys cascade as defined); opening binding afterwards must not show it. The runtime falls back to the existing deployment default for now-unbound stages. Do not orphan `settings` legacy compatibility entries.
- Preserve existing UUIDs, API keys, model records and active bindings. Do not migrate or create any table, change main or production workers, or call external APIs.
- Existing `settings` write bridge may be retained strictly for backward-compatible runtime resolution; it is not another inventory and must be kept in the same transaction. No new architecture.

## Verification

- Backend: create model → binding picker contains it; save/change/clear binding; delete bound model → related binding/settings removed; non-chat/vision-incompatible type rejected.
- Browser: new model in picker when navigating to page, delete removed on return, no preset candidates and no manual refresh.
- Existing model/provider CRUD, worker defaults and audit tests remain green.
- Required PR checks, squash merge to develop, VM13 deployment and browser acceptance.
