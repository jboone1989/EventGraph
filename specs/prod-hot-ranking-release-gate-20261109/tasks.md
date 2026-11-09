# Work items — production hot-ranking release gate

## Work Items

### T001 — Diagnose empty hot rankings and make production smoke evidence-aware

**Scope:** Fix the production release incident of 2026-11-09 in existing smoke and publication diagnostics only. Preserve the 48-hour/2-participant/1-editorial heat algorithm, public visibility, native release workflow, production data and secrets. Implement bounded read-only snapshot/eligible-candidate/freshness diagnostics and a fail-closed evidence-aware acceptance decision, with focused tests. No direct VM09 operations, new queue, migration, cron, synthetic news or broad application refactor.

**Depends on:** none

**Acceptance:**

- A verified, fresh, genuinely zero-candidate hot snapshot may produce a visible `expected sparse window` warning while timeline, site content and graph checks still pass; never silently pass an unknown or stale zero.
- API unavailable/malformed, ranking absent or stale, qualifying candidate present but public entry missing, missing/stale source evidence, empty timeline or knowledge graph each produce distinct hard failure evidence. Use read-only production-side queries and do not leak secrets or article content.
- Re-run all original non-hot production checks. Prove a post-checkout smoke failure can be reconciled idempotently with the already-verified image SHA/digest; no forced destructive rollback and no disabled automatic deployment.
- Add deterministic fixtures for populated success, genuine empty success with explicit warning, ranking absent/stale, eligible-but-hidden, invalid API and no recent source evidence. Keep existing independent code review, Check, Docker, E2E and native develop auto-merge.
- The task is code and tests only. Do not claim production is fixed until a later authorized main release passes smoke on the real VM09 environment; do not submit paid duplicate Work for the same Issue.
