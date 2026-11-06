# Use time-ordered UUIDv7 for new provider connections and models

**Status:** Draft
**Owner decision:** 2026-11-06: Do not generate random UUIDv4 for new model identities; prefer a time-ordered UUID version (UUIDv7).
**Target:** develop; amendment to specs/model-instance-identity-routing-20261106/spec.md approved in PR #456. Implement in the existing PR #457, not a duplicate implementation PR.

## Research First

- Current `provider_connections.id` and `registered_models.id` are PostgreSQL UUID primary keys; routing uses `registered_models.id`, allowing same model names on distinct connections. Keep this internal identity.
- Existing `connections.ts`, `import.ts`, `free-provider-sync.ts`, and `openrouter-free-sync.ts` generate random UUIDv4 for new provider/model records.
- RFC 9562 §5.7 defines UUIDv7 with a 48-bit millisecond Unix timestamp prefix for time-orderability, retaining random uniqueness. New Node.js 24 versions expose `node:crypto.randomUUIDv7` (available since v24.16.0); current repository engine floor is `>=24.11`. Pin the engine floor to v24.16 or newer if using this built-in, and check Docker/CI runtime.
- Database UUID columns accept v4 and v7 without schema change. Existing references/receipts/workflow bindings must not change.

## Contract

1. New `provider_connections.id` and `registered_models.id` use Node's native cryptographically random RFC 9562 UUIDv7 generator from all runtime creation and sync/import paths; no v4 fallback for new record identities. Keep UUID columns and UUID-only API/reference contracts.
2. Leave existing v4 rows and references untouched; never rewrite IDs. A model UUIDv7 is its own identity, not an alias for the upstream model ID.
3. Document minimum Node version and ensure normal CI/runtime support. No new dependency, custom UUID generator, database table, scheduled backfill, or mass migration.
4. UUIDv7 is time-sortable **approximately**, not a strictly increasing counter across workers; do not imply sorting by ID replaces authoritative createdAt/updatedAt.
5. Protect model/connection CRUD, fixed workflow bindings, duplicate upstream names across connections, and route fallback from PR #457.

## Acceptance

- Newly created connections and models, manual imports and both free provider syncs create UUID version 7, with correct variant.
- Existing v4 identifiers remain readable and editable; same upstream model is independently identified on distinct connections.
- Targeted regression tests for v7 identity and v4 compatibility; typecheck, regular GitHub Check/Docker/E2E and independent code review before merge.
