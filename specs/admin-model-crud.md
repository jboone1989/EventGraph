# Admin model management: simple CRUD table

## Problem
The /admin/models screen combines provider connections, discovery, batch probes and workflow routing, making basic model management difficult.

## Scope
- Present exactly one searchable and paginated table of registered models.
- Each row offers **View**, **Edit**, **Test**, **Delete**. Show concise model identity, provider, adapter and enabled state.
- **Add model** opens a concise form for model ID, provider connection, model type, enabled state and optional notes.
- When no suitable connection exists, creation can configure its name, vendor, HTTPS base URL and API key inline, reusing the existing provider API.
- Keep advanced test request JSON available only as a collapsed optional section; prefill chat and embedding sample probes.
- Trigger only the selected model's existing test endpoint on an explicit click. Display success/error and latency without running mass tests.
- Reuse the existing backend contracts, encrypted credentials, validation, audit reasons, version checks and dependency checks.
- Eliminate the provider connections table, discovery, batch test controls and workflow routing tab from this page. No changes to the underlying workflow/runtime functionality.

## Acceptance
1. Desktop and mobile see one table and an Add model action, not multiple admin consoles.
2. Create/view/update/delete are wired to their existing API endpoints and the list refreshes.
3. The test action appears on every row. A configured probe can be run once for that model; an unconfigured probe produces actionable feedback, not a broad batch request.
4. Invalid API inputs and dependency conflicts show backend errors; credentials never appear in a returned page.
5. Existing model adapter-specific settings survive ordinary edits; changing adapter resets incompatible probe defaults and routing eligibility.
6. No server, production, database migration or routing state is changed by this UI-only implementation.
