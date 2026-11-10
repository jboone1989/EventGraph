# Default workflow model: one-click apply to all workflows

**Status:** Draft

## Purpose
The admin chooses the default chat model/routing policy once and presses **一键应用到全部流程**. This action **must also reset every advanced per-chat-workflow binding**; previously saved fixed models may not keep overriding the new default. Afterward, advanced settings are for deliberate exceptions only.

This replaces the earlier behavior where changing the default left all explicit stage bindings intact. Do not mistake an inherited display label for an actual reset of stored overrides.

## Resolution
1. One-click default apply atomically saves `models.default` and removes every known chat-stage `models.<stage>` override from existing `settings` and its `provider_workflow_models` reference. Include obsolete/inactive but known chat stages so old overrides cannot reappear later.
2. All chat stages resolve the chosen default automatically, including the complexity-aware `auto` policy (stage-specific light/medium/heavy selection). Changes apply to *new* work without re-running published content.
3. An advanced stage may subsequently be manually bound to a model UUID, `auto:light|medium|heavy`, or reset to inherit the default. Another one-click apply deliberately clears those manual exceptions too.
4. Graphiti **embedding** is a different model type with a fixed Neo4j vector dimension. Keep its current embedding binding, and explain this only exception in the UI; never replace it with a chat model or remove its credential.
5. No new tables/migration, duplicate router, scheduler, hidden provider checks, or paid fallback. Only free candidates are eligible for automatic routes; unknown/timeout outcomes are not silently replayed.

## User interface
- The default-model selector has **one clear apply-to-all action**, enabled even if the selected default is unchanged (because existing overrides might need clearing). A single click saves + resets, not an extra button per stage.
- After successful save and loader refresh, advanced chat rows display the default effective route and “继承默认”; none shows “单独指定” until explicitly changed again.
- Keep the advanced section collapsed initially. Clearly state that applying the default overwrites prior advanced chat bindings, while embedding remains separately configured.
- On a failed request, show an error and retain prior bindings; never claim success.

## Backend acceptance
- Use the existing audited, CSRF-protected Admin API with a dedicated bulk command. Check default model value and adapter before any change.
- All settings/reference changes and a single meaningful audit entry commit **in one transaction**. No partial updates on failure.
- Delete only known non-embedding workflow keys; preserve `models.graphitiEmbedding` (and its `provider_workflow_models` row), credentials, unrelated settings and model definitions.
- A selected `auto`, `auto:light|medium|heavy`, or valid registered chat model is permitted; unknown model IDs, invalid adapters, or malformed values fail closed.
- Keep existing per-stage single-edit API and automatic routing logic unchanged; after commit invalidate the local model cache.

## Tests and release
- Browser test: choose default, apply; assert request uses the bulk endpoint and previously fixed advanced chat rows become inherited, including reapplying an unchanged default.
- Browser test: advanced manual override still saves, then another default apply resets it; embedding row/binding survives.
- Server test: transactional reset, audit and failure rollback, no unknown or embedding bindings deleted, no paid fallback.
- PR targets `develop`; typecheck/UI tests, CI and independent review before merge. Only then promote through existing release flow.