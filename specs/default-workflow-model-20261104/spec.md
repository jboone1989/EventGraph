# Default workflow model: one-click apply to all workflows

**Status:** Owner-approved (owner-delegated Spec Review of f4f1c371ddb313428ca69c1a6d4d2ab75f02f6f1)

## Purpose
The admin chooses the default chat model/routing policy once and presses **一键应用到全部流程**. This action **must also reset every advanced per-chat-workflow binding**; previously saved fixed models may not keep overriding the new default. Afterward, advanced settings are for deliberate exceptions only.

This replaces the earlier behavior where changing the default left all explicit stage bindings intact. Do not mistake an inherited display label for an actual reset of stored overrides.

## Resolution
1. One-click default apply atomically saves `models.default` and removes every known chat-stage `models.<stage>` override from existing `settings` and its `provider_workflow_models` reference. Include obsolete/inactive but known chat stages so old overrides cannot reappear later.
2. Default picker accepts (a) **"使用部署默认模型"** / empty selection (`models.default` deleted), (b) `auto`, (c) `auto:light`, `auto:medium` or `auto:heavy`, or (d) one valid registered chat-model UUID. Empty selection is a legitimate one-click reset: clear all stage overrides **and** the global default; each stage then uses its existing environment-specific override or site/deployment default, exactly as it did before a global setting was configured. Preserve this legacy fallback instead of inventing a required always-set default.
3. Nonempty global defaults are inherited by **all** chat workflows after reset. `auto` means the existing router assigns light/medium/heavy by each stage's complexity. `auto:light|medium|heavy` deliberately applies that selected **minimum tier** to every stage, not the stage-specific tier (higher tiers are eligible; downgrade below the configured tier is forbidden). A fixed model UUID applies to every compatible chat stage; reject a fixed chat model if it cannot satisfy any stage's declared image capability. Changes affect *new* work only; published items are not rerun.
4. Advanced chat stages accept the **same** four auto choices (`auto` plus all three tier choices), valid compatible chat-model UUIDs, and the clear/inherit choice. An advanced manual binding overrides the global default until another one-click default apply clears it. The selector's `auto` at stage scope uses the chosen stage's own complexity.
5. Graphiti **embedding** is a different model type with a fixed Neo4j vector dimension. Keep its current embedding binding, and explain this only exception in the UI; never replace it with a chat model or remove its credential.
6. No new tables/migration, duplicate router, scheduler, hidden provider checks, or paid fallback. Only free candidates are eligible for automatic routes; unknown/timeout outcomes are not silently replayed.

## User interface
- The default-model selector has **one clear apply-to-all action**, enabled even if the selected default is unchanged (because existing overrides might need clearing). A single click saves + resets, not an extra button per stage.
- Initial page load/refresh uses the existing admin route loader; while loading, the form is not interactive and cannot submit. A failed model-list/overview request shows the existing admin error state, **not** a saveable empty form; the operator can retry page load.
- If the model registry is empty, show the empty-state copy "暂无已注册的聊天模型；自动路由需等待配置可用免费模型". There are no fixed model choices, but the `auto` policies and "使用部署默认模型" remain available: the apply button is enabled when one of these valid selections exists, including the empty/deployment-default selection. Successful saving only means configuration was saved, **not** that a currently unavailable free model has responded.
- While saving or revalidating, disable the apply button. Unknown/deleted model IDs, incompatible fixed chat models (including missing vision support), or loading errors disable the action. A successful save refreshes the advanced rows; a failed save preserves all previous bindings and displays the returned error.
- After successful save and loader refresh, advanced chat rows display the default effective route and “继承默认”; none shows “单独指定” until explicitly changed again.
- Keep the advanced section collapsed initially. Clearly state that applying the default overwrites prior advanced chat bindings, while embedding remains separately configured.
- On a failed request, show an error and retain prior bindings; never claim success.

## Backend acceptance
- Use the existing audited, CSRF-protected Admin API with a dedicated bulk command. Check default model value and adapter before any change.
- All settings/reference changes and a single meaningful audit entry commit **in one transaction**. No partial updates on failure.
- Delete only known non-embedding workflow keys; preserve `models.graphitiEmbedding` (and its `provider_workflow_models` row), credentials, unrelated settings and model definitions.
- The bulk selection is explicitly **nullable** (deletes `models.default`, restoring existing per-stage environment/site fallback), or `auto`, `auto:light|medium|heavy`, or a valid registered compatible chat-model UUID. Advanced stages support the same auto policy choices plus inherit; unknown IDs, incompatible adapters/vision, and malformed values fail closed.
- Keep existing per-stage single-edit API and automatic routing logic unchanged; after commit invalidate the local model cache.

## Tests and release
- Browser test: choose default, apply; assert request uses the bulk endpoint and previously fixed advanced chat rows become inherited, including reapplying an unchanged default.
- Browser test: advanced manual override still saves, then another default apply resets it; embedding row/binding survives.
- Browser test: no registered chat models, initial loading, failed loader, failed save, disabled busy state; cleared default with cleared stage overrides uses existing environment/site fallback.
- Routing test: `auto` varies tier by stage; explicit global `auto:medium` applies medium minimum to every stage; registered fixed chat selection rejects incompatible vision/embedding.
- Server test: transactional reset, audit and failure rollback, no unknown or embedding bindings deleted, no paid fallback.
- PR targets `develop`; typecheck/UI tests, CI and independent review before merge. Only then promote through existing release flow.
