# Work Items — repair run-count consistency and fixed-model routing safety

## Work Items

### T001 — Prevent disabled models from breaking workflow bindings
**Scope:** In existing provider registry, admin model bindings, and model/connection update paths, enforce a shared model routing eligibility check at fixed-binding save time; prevent silent disable of in-use models/connections; display and repair legacy invalid bindings via existing UI. Preserve UUID identity and fixed vs automatic route behavior. Do not add tables or rerouting rules.
**Depends on:** none
**Acceptance:**
- For a disabled model, disabled routing switch, disabled connection, missing credential, or incompatible model type/capability, saving a fixed binding is rejected by the server with a precise error, while a currently routable model saves normally.
- Disabling a bound model/connection must identify affected workflow references and require rebind rather than silently strand tasks; rebind first allows deliberate disabling. Existing invalid bindings stay visible with reason and can be changed.
- Binding UI does not offer unusable models as selectable *new* choices; legacy selection is shown without deception and remains repairable. Preserve multiple same-name model UUIDs/connection identities, never change settings to automatic or paid routing without explicit choice.
- All existing `group`/`groupReview` and fallback/budget/receipt semantics remain unchanged; no fabricated recovery, no new queue or migration. Relevant backend unit/API tests verify disabled, route-off, change-to-disabled, stale state, UUID identity and valid rebind, with explicit PASS/FAIL.
- Given a previously failed `events.group` job caused by a disabled fixed model, after the administrator rebinds `group`/`groupReview` to an eligible model, verify the **existing** safe article/job requeue path (do not build a new retry API, duplicate #477, or replay a detached model receipt) preserves the original article/grouping context and performs the real configured model call when permitted. Assert that queued/running/completed/failed states and a new error are reported truthfully; a missing or unsafe parent task/unknown receipt must never show a false successful retry. Record end-to-end or integration-test evidence explicitly as PASS/FAIL/UNVERIFIED, and if an existing recovery defect is found within this scope, make the smallest reuse-first fix or surface the blocker in the implementation PR.
- Existing `Select`, `Button`, feedback and errors reused, with browser evidence including invalid binding state, long model names, and 390px reachability. Worker PR includes each scenario → code location → actual tests/results and relevant Check/Docker/E2E/independent review evidence.

### T002 — Align run-navigation badge with failed flow detail counts
**Scope:** Reuse the authoritative UTC-day all-flow execution-unit status definition for `/admin/runs` sidebar and dashboard, without splitting the count into separate SQL definitions. Keep existing pagination/filtering/requeue and #477 batch operations untouched; update badge label/accessibility and refresh synchronization.
**Depends on:** none
**Acceptance:**
- Given 7 unfinished articles but 59 failed flow execution units, after a common refreshed snapshot the sidebar `运行与积压` badge and page `处理失败` total are **59** and the all-kind failed detail has 59 rows; the UI clearly identifies these as execution units, not 59 articles.
- Pending/processing/failed states are exclusive per execution unit, and a recovered/completed item no longer counts as current failed state after refresh; no double count from a completed parent job or obsolete receipt. Unknown/pending receipts retain current safety semantics.
- Switching local kind filter never changes the global badge; UTC day rollover, zero failures, 20/21 rows and refreshed sidebar vs page are covered by deterministic tests with no new polling service or DB table.
- Existing `DataTable`, pagination and recovery actions are reused and not overwritten, including any completed #477 changes; 1530px and 390px browser checks prove badge/total labels and accessible operation placement; no claim of UI verification without actual test.
- Implement as one focused worker PR targeting develop, pinned to the approved Spec SHA with scenario → code → test/CI evidence. No main/production modification and no duplicate custom state/queue.
