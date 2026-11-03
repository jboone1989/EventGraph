# Unified workflow model binding choices

## Owner correction (2026-11-03)

The administration Model CRUD list and workflow binding dropdown currently disagree: the binding dropdown appends code-defined legacy presets marked always ready, while CRUD shows the actual normalized `registered_models`. Users expect one model inventory.

## Scope
1. Only rows in the same normalized `registered_models` inventory as `/admin/models` are offered as explicit choices under `/admin/model-bindings`; preserve every row, including disabled, non-chat, and untested, but clearly disable choices not eligible for that workflow and show the reason (model disabled, route disabled, missing/upstream credential, expired verification, adapter mismatch, vision requirement).
2. Do not offer `MODELS`/site-code presets as separately selectable candidates. Preserve old preset/environment/default settings and display active inherited/legacy values accurately, with a safe `继承环境／系统默认` option. Do not silently rewrite existing settings, migrate tables or activate any model.
3. Server-side explicit binding must validate the normalized model row is currently route-eligible for the stage's capability (and vision if needed); protect against stale or manipulated web choices. A currently bound model can become unavailable, but the page must display it and permit reverting to inherit/default.
4. Preserve audit, CSRF, authenticated routes, the same DB registry and provider credentials. Do not touch main, production workers, or run actual model calls. New models appear after refresh without frontend hardcoding.
5. Add browser and backend checks for matching inventory, disabled options and reasons, preserved legacy-current presentation, and rejecting unroutable forged binding requests.

## Verification
- Typecheck, relevant backend tests, browser smoke, docker and E2E pass before squash merge to develop.
- VM13 deploy and online browser acceptance must pass, with no database or model registry mutation.

## Owner clarification · 2026-11-03 (automatic freshness)

"New models appear after refresh" does not meet the owner's intent. The registry is the sole source of truth. After creating, editing, or deleting a model in Model CRUD, the binding page must pick up the updated DB list on navigation, tab/window focus and in a bounded visible-page refresh (15 seconds). No stale preset cache and no manual "刷新模型" button. Retain unsaved user selections only while the corresponding model still exists; if removed, discard the stale unsaved selection. Never reset an existing saved binding automatically.
