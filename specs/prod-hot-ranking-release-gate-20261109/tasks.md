# Work items — production hot-ranking release gate

## Work Items

### T001 — Diagnose empty hot rankings and make production smoke evidence-aware

**Scope:** Fix the production release incident of 2026-11-09 in existing smoke and publication diagnostics only. Preserve the 48-hour/2-participant/1-editorial heat algorithm, public visibility, native release workflow, production data and secrets. Implement bounded read-only snapshot/eligible-candidate/freshness diagnostics and a fail-closed evidence-aware acceptance decision, with focused tests. No direct VM09 operations, new queue, migration, cron, synthetic news or broad application refactor.

**Depends on:** none

**Acceptance:**

- Only a ranking with `computed_at` UTC age 0–15 minutes (3 x existing 5-minute `hot.rank` cron), exact matching `HOT_RULE_VERSION`, `evidence.candidates=0`, stored/public entries zero, current and at-snapshot backend `heatRows` eligible counts zero, and no lag from `behindSources(await sourceClocks(), nowMs, true)` (per-source grace `max(3*interval_minutes,90min)`) may produce the visible `expected sparse window` warning. Timeline/site/graph checks still must pass; never silently pass unknown, version-mismatched or stale data.
- API unavailable/malformed, ranking absent/stale, unknown `rule_version`, missing/mismatched candidate counts, qualifying candidate with empty public output, lagging source clock, empty timeline or graph each produce distinct hard failures. Reuse the deployed backend TypeScript heat query/rule functions for a bounded **read-only** aggregate JSON diagnostic, consumed (not duplicated) by Python smoke; do not write DB, duplicate heat SQL, leak source IDs, secrets or article text.
- Re-run all original non-hot production checks. Prove a post-checkout smoke failure can be reconciled idempotently with the already-verified image SHA/digest; no forced destructive rollback and no disabled automatic deployment.
- Add deterministic fixtures for populated success, genuine empty success with explicit warning, ranking absent/stale, eligible-but-hidden, invalid API and no recent source evidence. Keep existing independent code review, Check, Docker, E2E and native develop auto-merge.
- The task is code and tests only: VM13 is the existing develop Web/API preview that must pass its standard online acceptance first; VM09 is production, and only the reviewed `release-main.yml` may deploy there. Do not claim recovery until a later authorized main release passes the live smoke; do not dispatch duplicate paid Work for the same Issue.
