# EventGraph: 24-hour operational freshness

Status: operator-approved requirement (2026-10-26).

- Delete pg-boss jobs created more than 24 hours ago if still created/retry/active.
- Mark articles with no new material for 24 hours (later of first discovery and current revision update), still in new/failed processing states, as skipped and clear retry/queue metadata; retain their stored content, publications, events, receipts and audit history. A genuine source revision gets a fresh bounded 24-hour processing window.
- Prevent recovery sweep, receipt release and bulk failure retry from reviving out-of-date news. Manual pipeline reruns of expired news must return a clear error before changing state; editing published content is outside this policy.
- Make the run/admin backlog reflect this 24-hour window. Preserve historical job_runs as audit.
- Run cleanup periodically without manual intervention and make repeat runs idempotent.
- Validate fresh pending tasks are retained and no stale backlog reappears.
