# Persist successful model verification across time (2026-11-04)

## Incident
Production continues collecting news but has published no new selected articles since November 2. Model routing currently rejects any successful capability check older than 24 hours, regardless of whether the registered model, provider connection, or encrypted credential changed. The optional retest worker is disabled by default, so fixed/default and automatic free-model workflows can stop without an actual provider failure. This spec removes that artificial outage mechanism; it does not claim it explains every article still blocked in production.

## Required behavior
- A successful verified (or previously accepted legacy) capability check remains eligible after 24 hours **while its configuration fingerprint matches**. A future-dated check is never eligible.
- Changes to the model configuration, connection endpoint, credential, capability, disabled state or route-enabled state must still invalidate/block routing exactly as before.
- New models and changed configurations still require a successful explicit capability test before routing is enabled. A failed check must never authorize calls.
- Preserve optional, explicitly enabled retesting, model CRUD, current default/workflow selection, budgets, receipt identities, and policy restrictions. Do not turn on automatic paid testing, change production keys, or alter knowledge/history data.
- Existing failed articles must be recovered using the existing bounded admin requeue **after** confirming a valid model path; do not automatically replay unknown receipts or force an unbounded paid burst.

## Acceptance
- A matching successful capability check from 25+ hours ago still routes.
- No successful check, failed check, changed fingerprint, disabled model/connection or future-dated check does not route.
- Existing provider connection tests and production CI pass.
- Production verification requires fresh evidence of nonzero successfully analyzed/selected articles and shrinking failure backlog, not merely a successful deploy.
