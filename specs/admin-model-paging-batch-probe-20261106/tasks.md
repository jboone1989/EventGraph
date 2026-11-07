# Implementation tasks

## Work Items

### T001 — Paginated model table and one-click filtered batch test
**Scope:** Update the existing `RegisteredModelsAdmin` UI to paginate search and billing-filter results (20/page); add bounded one-click test of all filtered models using the existing individual test endpoint, with paid-cost confirmation and progress, and add focused Playwright regressions.
**Depends on:** none
**Acceptance:**
- The table shows at most 20 rows per page with accurate total/current page, search reset and free/paid/all filter.
- One-click testing reaches models on later pages, dispatches at most two concurrent probes and reports pass/fail/skipped without aborting after HTTP 429.
- Canceling a paid confirmation sends zero probes; free-only testing runs without confirmation, and unknown probe specifications are skipped clearly.
- Per-row results and Edit/Test/Delete remain independently usable; no auto-routing/enable changes and no new batch backend API.
- Focused browser test, typecheck and web build results are recorded in implementation PR, with approved immutable Spec reference.
