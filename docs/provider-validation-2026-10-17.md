# Provider management validation — 2026-10-17

Branch: `feat/provider-connections`, based on `8290a3a`.

Implemented schema 0106–0110, transactional migration/completion manifest, connection and model CRUD, encrypted credentials, discover/select/import, capability tests, normalized chat/embedding dispatch, workflow bindings, and the new management page. NVIDIA policy remains mandatory on protected hosts. Old registry mutation/probe/bulk entrypoints reject writes after migration completion.

## Passing checks

- Repository typecheck and production web build.
- 18 focused database/runtime/HTTP tests; 15 affected tests rerun after adding deleted-reference handling, followed by a 9-test API/runtime rerun including the literal `models:import` route.
- 16 production web/browser checks covering provider creation, inline field errors, phone-size manual model creation, existing private admin loading and cache behavior. Browser dependencies were extracted under `/tmp/chromelibs`; no product dependency or browser security setting was changed.
- 64 standalone checks covering SSRF literals and connect-time DNS rebinding, protected redirects, migration safety, registry adapters and stage selection.
- `git diff --check`.

## Development database copy

SSH target: `ubuntu@43.142.127.40`. Read-only snapshot taken with `pg_dump` from `aihot-db-1` / `aihot`. Restored into the separate `eventgraph_provider_connections_copy_test` database; code ran in an isolated validation container with model calls, collection and pushes disabled. No new version was deployed and no migration was applied to the existing business database.

Result: 81 source models, 81 normalized models; original workflow overrides: 0. Two synthetic overrides were added only to the copy to exercise reference conversion; both FK bindings and settings pointed to the expected model UUIDs. Exact model IDs, endpoint overrides, model timeouts and enabled/route flags matched the snapshot. A second migration created 0 models and rewrote 0 references. The existing source still held 81 models afterward. The copy database and validation container were removed.

Local migration tests additionally cover: shared connections with separate model timeouts; migration-only legacy evidence for previously routed models; originally disabled models receiving no legacy authority; transaction failure on swapped references; deletion followed by rerun not resurrecting models; old aliases/presets refusing to fall back to deleted source configurations.

## Broader suite limitations

The broad database run completed with 844/873 passing and 29 failures. It is not a green release gate. Failures include missing local `pg_dump`, site/sample expectations, logging checks and pre-existing architecture/alert failures. The baseline checkout independently reproduces the two alert failures and the same four architecture checks. The new private route was added to the architecture test's private-route set; the recheck reports only the original analytics/knowledge/market route violations, original ownership/unused-column issues and original missing environment-template entries.

The first broad standalone/web runs overlapped the web build and lacked browser shared libraries, so those results are not evidence of a complete pass. After the build and local library setup, the targeted 16 web checks and 64 standalone checks passed. Full WebKit coverage and all unrelated suite failures remain unresolved.

Peer review is pending. Deployment and migration of the existing business database have not been performed.
