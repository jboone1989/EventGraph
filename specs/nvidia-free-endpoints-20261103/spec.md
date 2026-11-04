# NVIDIA free-endpoint catalogue correction and independent model tests

## Owner decision · 2026-11-03

The previously imported 81 historical NVIDIA catalogue entries were wrong for a free-API model list: only a small verified subset has NVIDIA Free Endpoint entitlement. Correct the imported data and fix model tests that block other rows or conceal the failure reason. This replaces the 81-entry assumption of the earlier bootstrap; it does not authorize changing production main or running background models.

## Required behavior

1. Retain only the currently curated, NVIDIA-official **Free Endpoint** IDs from `VERIFIED_FREE_TRIAL_ENDPOINTS` in new bootstraps (15 at approval, not a guarantee that a given key or API can call each endpoint). The full historical 81-item file remains research material, not the UI's free-model catalogue; partner-only, downloadable-only, unconfigured and unverified IDs must not be imported as free models.
2. On the writable VM13 preview deployment, reconcile the earlier one-time 81-model bootstrap exactly once, deleting its non-entitled, unedited `seed-catalogue` records only from the original bootstrap connection. Do not remove operator-edited models, extra manually created models, records referenced by workflow bindings or aliases, existing provider credentials, or verified retained-model configuration. Report removed/retained/skipped totals, write an audit entry, and retain a reconciliation marker. No new server, migration, worker, or main release.
3. Model test actions operate independently per model. Running a test for one model must not disable tests, editing or deletion controls for other rows. Each row displays its own in-progress state, result and error. Concurrent API calls must have distinct request identity and not overwrite another row's result.
4. Preserve the real diagnostic category of failed model tests: HTTP status for upstream rejections, unsupported/free-endpoint policy, missing credential, budget, network/DNS/TLS/timeout, or invalid response. Do not expose plaintext credentials, upstream response bodies, or secret URLs.
5. Tests are opt-in and model routing remains disabled until the model is genuinely eligible and verified; no automatic sweep of all free endpoints or silent workflow binding. A Free Endpoint label is **not** proof of successful account entitlement.

## Evidence / gates

- Ground Free Endpoint candidates in NVIDIA's official catalog: https://build.nvidia.com/models and prototype entitlement https://docs.api.nvidia.com/nim/docs/product.
- Regression checks: initial import count 15 not 81; idempotent correction of historical bootstrap while preserving manual records; different models test concurrently with per-row results; actionable provider failure classification and no credential leakage.
- Normal spec-first `feature → develop` PR workflow; merge only after required checks, then publish/deploy/verify VM13, leaving main and production workers unchanged.
