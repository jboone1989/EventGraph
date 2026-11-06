# Admin model list pagination and one-click testing (2026-11-06)

**Status:** Owner-approved

## Owner request
After EventGraph production went live on 2026-11-06, the owner requested paginated model management and one-click testing instead of clicking Test on every model. This supersedes the older **no bulk probe** constraint of `specs/admin-simple-model-crud/spec.md` for this page. The old per-row Test action must remain available.

## User-visible requirements
1. On `/admin/models`, retain the existing searchable single CRUD table, with **20 models per page** and clear total, page position, previous/next controls. Searching resets to the first page. No API/model duplication; pagination can occur on the already loaded ProviderManagement list.
2. Provide **one-click test of the current filtered model list**, not just the current page. The operator sees the number of targeted models *before* starting and live progress (completed/total/passed/failed/skipped). Keep existing individual Test, Edit and Delete actions.
3. Reuse the existing authenticated `POST /api/admin/provider-models/:id/test` and saved `probeSpec`. Each model keeps its independent result and error/latency; one failed or rate-limited test must not stop the rest.
4. At most **two concurrent tests** in a batch, independent model IDs, no repeat dispatch for the same model while it is already testing. No new worker, schedule, queue, persistence table or bulk-test API.
5. A batch may consume external provider quota or money. If it contains a model marked `paid`, show the exact paid count and require confirmation before dispatch. The operator may filter by free/paid/all. Models without `probeSpec` are skipped with a clear reason, not reported as successful. Do not automatically change enabled/routeEnabled flags, capability settings or workflow bindings.
6. A completed batch leaves its per-row status visible, including across pagination and search changes. Page navigation remains functional during a batch; repeated batch launch is blocked until the current batch finishes. No silent auto-test on page load/sync.

## Acceptance
- Searching and free/paid filtering yield stable 20-row pages, correct counters and navigation on mobile and desktop.
- One click starts every testable row in the filtered list across page boundaries, with a maximum of two concurrent model requests; failures and 429s don't abort unrelated tests.
- Paid-model confirmation rejects with **zero** requests when canceled; free-only batch needs no paid confirmation.
- Individual row tests still work independently. Missing probe, network error and model-specific result are visible. Tests do not mutate routing or model configuration.
- Add focused UI regression tests reusing existing Playwright mock API. Typecheck and web build/CI must pass before merge to `develop`.
- No production release is implied by PR merge; existing production deployment process stays unchanged.
