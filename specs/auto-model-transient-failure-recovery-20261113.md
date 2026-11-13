# Spec: Auto-model transient failure recovery (2026-11-13)

## Incident and evidence

On 2026-11-13 UTC, EventGraph's production automatic routing excluded five medium/heavy text model instances by 00:06 UTC. Article processing then reported `no_available_model` while 55 editorial articles remained `new` and `content.sweep` kept running. All five excluded instances subsequently passed the existing live capability probe. A single rate limit, request-too-large response, schema mismatch, or output length error is not proof that a model is unusable for the entire UTC day.

## Required behavior

1. Keep the existing same-attempt `excluded` set in `chatJson(auto:...)`: each failing model UUID is tried at most once in a single logical task; preserve receipt accounting.
2. Replace the UTC-day global failure exclusion with a **bounded, persisted cross-worker cooldown**. An active record has an explicit `until` timestamp, checked at selection time. Expired records do not affect selection.
3. Existing `routing.failed:*` records without `until` (written by the old release) must cease to block routing on rollout; do not need a new table, migration, cron, or manual cleanup.
4. HTTP 429 -> 5-minute cooldown; HTTP 413 -> 1-minute cooldown (request shape needs correction, not a day ban); HTTP 5xx -> 2 minutes; HTTP 401/403/404/410 -> 30 minutes pending credential/model configuration; schema/output and other failures -> 1 minute. These are retry throttles, **not evidence of permanent unavailability**.
5. Maintain text/vision capability, enabled switches, per-connection credentials, and minimum complexity tier. Do **not** silently enable paid models or lower quality tiers. Configured paid models already participate in the candidate pool.
6. Existing `content.sweep` and article retry scheduling recover work once matching models are eligible; `BudgetExceededError` remains non-terminal for articles.
7. An explicit "Refresh Models" action continues to clear all persisted failed-route state and in-process caching.

## Acceptance

- A temporary 429 cannot exclude a model for the entire UTC day.
- A 413, unusable JSON, or output-token limit failure does not permanently poison the model for unrelated articles.
- Previously written failure rows without a timestamp are ignored.
- Expired rows are ignored; valid, not-yet-expired rows remain excluded across workers.
- Independent model UUIDs on different connections remain independent.
- Existing automatic routing tier, fallback and same-task exclusion tests remain green.
- A deployed fix must be verified on the production queue separately; a passing short capability probe alone does not validate full structured news analysis.

## Non-goals

- Changing model credentials, spending limits, paid-tier opt-in, or per-model prompt defaults.
- Refactoring the independent `/admin/runs` slow query / Web SSR timeout in this PR.
