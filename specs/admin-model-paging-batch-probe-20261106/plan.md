# Implementation plan

## Search Before Build
- Current `develop` already has `RegisteredModelsAdmin` in `apps/web/app/features/admin/ProviderConnectionsAdmin.tsx`, using `DataTable`, `Input`, `Button`, `useAdminAction`, local `matching` search and a row-level `testModel`.
- `/admin/models` loader already returns the complete `ProviderManagement` list; no new query endpoint is needed for current volumes. `DataTable` accepts rows sliced by the page.
- `useAdminAction.run` supports `background:true`, `revalidate:false`, `quietError:true` and a per-model idempotency label. Existing independent-probe browser test proves overlapping individual requests work.
- `apps/web/tests/provider-management.test.ts` and `provider-tests-independent.test.ts` are the existing UI harnesses. Extend, rather than replace.
- Existing older Spec `specs/admin-simple-model-crud/spec.md` asked for pagination but excluded bulk tests. This new owner request explicitly replaces only that restriction.

## Delivery
- Keep changes focused on the existing models component and a targeted browser regression test.
- Add local page/search/billing-filter state and a bounded two-worker async test loop over a snapshot of the filtered list; retain the same row-level endpoint and results.
- Reuse existing `TestResult` and `testing`/result state. Count missing probes separately; keep paid confirmation before any requests.
- Verify focused browser tests, typecheck and web build in CI; no new endpoints, scripts, tables or deployment steps.
