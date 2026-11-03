# Admin workflow → model bindings

## Approved scope (2026-11-03)
Keep the existing `/admin/models` page as a single CRUD + per-model Test list. Add a separate, simple model-binding page under admin navigation.

## Requirements
1. `/admin/model-bindings` displays each registered editorial/module AI workflow stage in one table: stage, current model, source (admin/environment/default), and a model picker with a Save action.
2. Populate choices from the current backend registry on every page load (not a static frontend list), including newly added models immediately on navigating or refreshing this page. Include existing built-in presets/default as well as registered models. Display the provider name to disambiguate models.
3. Show every newly registered chat model as a candidate, even before it has passed tests, but visibly flag non-routable models and prevent accidental binding to them. Do not offer embedding-only or other non-chat adapters for text workflows; honor vision requirements.
4. Reuse existing audited workflow-switch API, permissions, CSRF, model reference validation, and database binding. Provide an explicit unbind/inherit option and show a clear success or error. Applying a switch affects only subsequent work.
5. Expose a compact "allow workflow routing" switch within the existing model edit dialog. Preserve secure default (off) on creation. Operator tests the model on the model page, then enables routing. Backend's existing verification/dependency checks remain authoritative.
6. Keep this lightweight: no bulk testing, discovery, extra routing engines, new DB migrations, or credentials in model choice output. Include a link back to model CRUD, and a refresh control for newly added models or another tab's edits.
7. Add UI coverage proving a newly registered model appears in workflow choices, is marked unavailable before verification, and can be bound after verification and routing opt-in; test unbinding, binding payloads, and error handling.

## Acceptance
- Desktop and mobile expose the independent binding page in admin navigation; CRUD remains a separate page.
- A new model appears without frontend configuration changes, after page navigation or refresh. Non-ready selections do not silently disrupt live work.
- Per-stage changes persist via existing API; admin fallback/source visible; no production deploy from this feature.
- Existing browser tests and CI checks pass before merge into `develop`.
