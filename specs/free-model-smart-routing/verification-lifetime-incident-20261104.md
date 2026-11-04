# Verification lifetime incident — 2026-11-04

Existing approved requirements: [free-first smart routing](spec.md), [workflow default overrides](../default-workflow-model-20261104/spec.md).

## Observed production failure
After retiring duplicate NVIDIA probes, registered-model test eligibility still expired after 24 hours. Two configured NVIDIA heavy chat models and Graphiti's embedding model were no longer eligible despite unchanged fingerprints and valid connections. With no heavy candidates, event grouping failed and news selection/daily/hot output stopped.

## Exact fix
Keep the latest successful model capability check valid until the saved model/connection configuration fingerprint changes or a later test fails. Remove the 24-hour cutoff from routing and the enable-routing gate. Preserve credential, endpoint, provider policy, disabled state, capabilities, free-only model selection and paid-request receipt safeguards. Do not restore scheduled probes or add a second registry.

## Acceptance
- Previously verified unchanged models remain routable beyond 24 hours.
- A failed test, disabled model, changed secret/configuration, or no capability check remains blocked.
- Existing test and CI pass; live acceptance requires selected editorial output and nonempty hot ranking, not merely HTTP 200.
