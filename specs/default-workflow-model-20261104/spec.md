# Default workflow model and optional per-stage overrides

## Purpose
The workflow-model binding page has one default model picker at the top. A collapsible advanced section lets administrators select an optional different model for each workflow stage.

## Resolution
1. Explicit stage binding `models.<stage>` wins.
2. Otherwise use `models.default` if set.
3. Otherwise use the existing environment/site model selection.

Clearing a stage binding inherits the global default; clearing the global default restores the deployment's existing defaults. The selected model is loaded by ID at runtime, so no credentials or provider URLs are copied into workflow bindings.

## Implementation constraints
Reuse `settings`, `provider_workflow_models`, `writeWorkflowModel`, model switching audit, current registered model list, and current cache invalidation. No new model table, credential copies, migration, or separate routing engine. Only new work uses newly selected models. Existing model runtime validation must still apply.

## Acceptance
- A newly created model appears in both selectors upon reload.
- Saving default model affects unbound stages.
- Saving an advanced stage setting overrides only that stage.
- Clearing an advanced setting restores inheritance.
- Explicit stage override remains intact when default changes.
- Saving and reloading preserves both choices.
- Workflow runtime tests and UI tests pass.
