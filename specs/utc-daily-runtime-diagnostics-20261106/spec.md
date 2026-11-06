# UTC daily runtime diagnostics — 2026-11-06

## Requirement
All temporary operational counters and diagnostic rows on the admin Runs and Overview pages use the calendar day beginning at 00:00 UTC, never a rolling 24-hour window. Yesterday's failures must not remain labeled as today's latest failure.

## Scope
- Filter task runs, failed pg-boss jobs, grouping waits, model routing attempts, provider receipt summaries/issues, delivery issues, external ingest reports, and new-news pipeline statistics to the current UTC day.
- Reset visible values immediately at the UTC date boundary even if the midnight worker is delayed.
- Reuse the existing UTC ops.expire-stale-work schedule to prune old completed job-run records and failed pg-boss job records; daily retention is fallback.
- Preserve durable paid-request receipt/attempt records, billing evidence, idempotency, audit logs, and ongoing queue work. Live process and source health are real-time statuses rather than historical daily counters.
- Update user-facing labels so there are no misleading “last 24 hours” descriptions.

## Validation
- UTC cutoff respects midnight independent of deployment timezone.
- Yesterday's errors, receipt issues, and model-routing calls do not appear today; today's entries still appear.
- Midnight cleanup does not delete paid request receipts or in-flight job runs.
