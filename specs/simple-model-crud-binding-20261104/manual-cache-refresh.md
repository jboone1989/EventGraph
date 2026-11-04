# Runtime model cache and manual refresh

## Decision — 2026-11-04

- The existing three CRUD tables remain unchanged: provider connections, registered models and workflow bindings.
- Worker/model runtime first reads cached registered model and provider records. A cache miss reads the database. No periodic refresh, polling, notification, or automatic cross-host synchronization.
- Admin creates, edits, and deletes clear the cache in the **same API process after the successful transaction**; failed writes never invalidate.
- The **刷新模型** button on the admin Models page invokes an authenticated API route to clear that server process's runtime caches and revalidates the page data.
- Production worker and development API run in different processes. The button cannot clear a different process's memory; a worker restart clears its local cache. Do not claim cross-process invalidation without a mechanism.
- Cached rows must not include plaintext API keys. Existing credential encryption stays in place. No additional database tables or scheduled jobs.

## Acceptance

- Cache miss uses DB, subsequent load reads cache; explicit clear reloads DB data.
- Model/provider CRUD invalidates after success; transaction reads bypass caches.
- UI refresh calls backend and reloads models list.
- CI and browser checks.
