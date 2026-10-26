# EventGraph: 24-hour operational freshness

Status: operator-approved requirement (2026-10-26).

- Delete pg-boss jobs created more than 24 hours ago if still created/retry/active.
- Mark articles discovered over 24 hours ago but still in new/failed processing states as skipped and clear retry/queue metadata; retain their stored content, publications, events, receipts and audit history.
- Prevent recovery sweep and bulk failure retry from reviving out-of-date news; manual editorial corrections are outside this automatic policy.
- Make the run/admin backlog reflect this 24-hour window. Preserve historical job_runs as audit.
- Run cleanup periodically without manual intervention and make repeat runs idempotent.
- Validate fresh pending tasks are retained and no stale backlog reappears.
