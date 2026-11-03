# VM13 preview: allow audited administrative writes to the existing production database

**Status:** Owner-approved (2026-11-03).
**Target:** `develop` only. No change to production release or main branch.

## Decision
The VM13 develop preview may write through its existing private PostgreSQL tunnel into the *same production database* used by VM09. The owner accepts that preview changes to providers, models, workflow bindings, notes, and other administrative records are real production changes, and does not want a separate development database or additional server resources.

## Requirements
1. Remove the preview's enforced PostgreSQL read-only session mode. Keep the already pinned production SSH tunnel and VM13 Web/API images; do not install a preview database or a worker.
2. Continue to suppress the preview API's heartbeat and worker-watchdog/background maintenance tasks. Unblocking ordinary admin POST/PATCH/DELETE must not silently start extra background schedulers.
3. The preview deployment must not migrate or seed production data, even on newer develop commits. Schema evolution remains in the separate production release process.
4. Prove writable access by an isolated SQL INSERT and readback in a transaction that **always rolls back**. Check that `/api/health` reports `dbReadOnly:false` and the deployed source SHA. A write probe must fail on insufficient privileges, read-only sessions, or wrong schema; it must not leave production records.
5. Keep existing authenticated admin access, CSRF and audit enforcement. Do not expose PostgreSQL publicly, loosen GitHub branch protections or auto-promote `develop` to `main`.
6. API keys encrypted through the preview must be decryptable by the actual production worker. Explicitly document that a shared `MODEL_CREDENTIAL_ENCRYPTION_KEY` is required on both VM13 API and VM09 production processes; do not claim cross-host compatibility from independently auto-generated local keys. Do not silently copy raw credentials to GitHub or commit them.
7. Update preview documentation and smoke checks to reflect real production-write side effects. Retain non-destructive public page and knowledge checks. No destructive production mutations are part of CD testing.

## Acceptance
- VM13 API reports `dbReadOnly:false` and a zero-residue transaction-level write/readback probe passes.
- Preview API does not run heartbeat/watchdog, migrations or seed.
- No new database, VM, worker, GitHub Actions scheduler or externally exposed DB port.
- Existing prod data stays in the same database; operators understand writes are immediate production writes.
- CI Check / docker / e2e pass, and live preview deploy + smoke is required before claiming it works on VM13.
