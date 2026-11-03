# Tasks: Spec-driven GitHub Projects and native Work Queue intake

**Status:** Owner-approved; implementation starts after this Spec is merged to `develop`.
**Spec:** `specs/015-spec-task-intake/spec.md`

## Work Items

### T001 — Implement the canonical task parser and graph validator
**Scope:** Add a deterministic parser for the approved `tasks.md` format, including dependency graph validation, stable task markers and focused unit tests.
**Depends on:** none
**Acceptance:**
- Parse Task ID, title, Scope, Depends on and Acceptance bullets without an LLM.
- Reject duplicate IDs, missing fields, unknown/self dependencies, cycles and graphs over 256 nodes.
- Produce a deterministic normalized task list and stable Spec/Task markers.
- Tests cover valid tasks, malformed documents and all graph rejection cases.

### T002 — Implement idempotent GitHub task Issue projection
**Scope:** Create or reuse one GitHub Issue per validated Spec task, using the stable Spec SHA/path/Task ID marker and the existing `agent-work` label.
**Depends on:** T001
**Acceptance:**
- Create Issues containing the immutable Spec path/SHA, Spec PR URL, Task ID, Scope, dependencies and Acceptance criteria.
- Reuse a unique Issue matching the marker on retry; reject multiple matches.
- Recover from partial Issue creation without duplicating already-created tasks.
- Apply `agent-work` and rely on Project #2 Auto-add; do not call Project APIs.

### T003 — Build and atomically submit the native GH-AW Work Graph
**Scope:** Read the installed Queue Policy, construct normalized Work nodes and submit the complete graph using pinned GH-AW v1.0.1 `submit-graph`.
**Depends on:** T002
**Acceptance:**
- Use stable graph ID, Task ID node keys and GH-AW canonical Work IDs.
- Derive pool, default Worker profile, logical contract and trust domain from the live Policy.
- Include the exact Spec 012 version-1 effect contract and EventGraph resource scope in each code Work payload.
- Resolve repository and predecessor Issue database IDs through GitHub API and represent dependencies with complete normalized Issue resources and condition `completed`.
- Reject missing/paused/incompatible queue state and never submit a partial graph.

### T004 — Integrate Spec intake into the existing successful-develop continuation
**Scope:** Extend the existing `resume_native_queue` job to catch up merged PRs after Producer installation, admit qualifying owner-merged Specs after exact-current-head Check/E2E/publish success, and then run the existing Dispatcher path.
**Depends on:** T003
**Acceptance:**
- Run only after the exact current `develop` head passes the existing native-queue-enabled Check path.
- Scan first-parent merge commits since Producer installation in chronological order; process each unique same-repository PR, admitting only owner-merged Specs with all three required files.
- Create Issues and submit Work before the existing queue dispatch step.
- Do not add a timer, polling loop, second dispatcher or alternate queue.
- Preserve existing exact-SHA, no-open-agent-PR and native queue stats gates.

### T005 — Close task Issues only after verified PR merge
**Scope:** Extend the trusted develop continuation to reconcile the unique merged `agent-work` PR, verify its Issue/Task/Spec provenance and close the Issue with reason `completed`.
**Depends on:** T004
**Acceptance:**
- Require same-repository `agent/*` PR to `develop`, merged state and `agent-work` label.
- Verify exactly one referenced Issue and matching Task ID, Spec path/SHA and stable Issue marker.
- Close only after exact develop Check/E2E/publish success; use state reason `completed`.
- Keep Issues open for unmerged PRs, failed checks, ambiguous markers or unrelated PRs.
- Tests prove a generic/not-planned Issue close cannot satisfy a completed dependency.

### T006 — Align the main-branch Worker contract with Spec-generated tasks
**Scope:** Mirror the exact approved Spec to `main`, update the GH-AW Worker prompt to consume the Producer's immutable Issue/Spec payload, and regenerate the compiled lock.
**Depends on:** T005
**Acceptance:**
- Remove the obsolete statement that no custom Producer exists.
- Require Issue number/URL, Task ID, acceptance criteria and exact Spec path/SHA from immutable Work payload.
- Preserve one-PR safe output, repository scope, no direct GitHub writes and the existing independent review/merge gates.
- Compile the Worker and lock with pinned GH-AW v1.0.1 strict mode; never hand-edit the lock.

### T007 — Verify the complete Spec-to-merge-to-dependent-task lifecycle
**Scope:** Run focused and end-to-end tests and document evidence for the new intake path without changing the native queue Policy or ledger.
**Depends on:** T006
**Acceptance:**
- Verify one approved two-task Spec creates exactly two Issues and both appear in Project #2 Todo.
- Verify one atomic Work Graph admission and that the second Work waits on the first Issue's completed state.
- Merge the first task PR through existing exact-SHA Check, independent GLM review and GitHub-native auto-merge.
- Verify the trusted continuation closes the first Issue with reason completed and only then makes the second Work eligible.
- Verify duplicate producer execution creates no duplicate Issues or Work and no queue history is reset.
