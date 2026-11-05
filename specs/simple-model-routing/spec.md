# Simple free-first model routing

## Scope
- Reuse registered_models.complexity (light/medium/heavy); add one explicit free/paid classification, editable through existing model CRUD. For imported model IDs, use the first NN b parameter count for initial tier (<120B light, 120B standard, >120B heavy), with a manual override.
- For auto routes, select enabled chat models with matching declared capability and sufficient complexity from the same database table. Actual requests, not periodic probes, determine availability. Keep the most recent successful free model per tier and capability in worker memory until an explicit rejection or config change.
- On an unambiguous HTTP rejection (429/502/503/504), try another candidate once per logical request; never resubmit timeouts or unknown receipts. Persisted articles and existing fixed workflow bindings must remain unchanged.
- Prefer free models. Paid models must never be used without an explicitly configured paid fallback and operator approval; do not enable any paid fallback in the production settings during this change.
- Leave provider/model/workflow CRUD intact. No new scheduler, health-check job, per-day hard limit, or second registry.

## Acceptance
- Admin can view/edit free/paid and light/standard/heavy.
- Default auto selects only free models and reuses the last successful model.
- 429/503 tries next free candidate; all-free-exhausted waits, not a permanent article failure.
- Existing model settings and fixed assignments continue to work; no new paid calls occur automatically.
- Typecheck, targeted routing tests, existing CI and E2E pass before deploying. Main and production unchanged.
