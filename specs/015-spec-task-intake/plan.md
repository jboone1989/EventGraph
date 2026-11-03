# Implementation plan: Spec-to-Projects and native Work Queue intake

**Status:** Owner-approved; implement after this Spec is merged to `develop`.
**Pinned implementation Spec:** `specs/015-spec-task-intake/spec.md` at the exact approved merge commit.

## 1. Existing repository evidence

Inspected EventGraph `develop`, `main`, and the pinned upstream GH-AW v1.0.1 source.

### EventGraph

- `.github/workflows/check.yml` already has a `resume_native_queue` job. It runs only after the exact `develop` SHA passes Check/E2E/publish (or the explicit docs-only skipped path), confirms that SHA is still the current `develop` head, checks for an open `agent-work` PR, reads native queue stats, and dispatches the existing native Dispatcher. Extend this path instead of adding a second dispatch workflow.
- `.github/workflows/eventgraph-native-pr-closed.yml` already handles queue continuation when an `agent-work` PR closes without merging and enables GitHub-native auto-merge for eligible Worker PRs. Preserve those behaviors.
- `.github/workflows/eventgraph-worker.md` is the main-branch GH-AW Worker source. It already requires an Issue number/URL, explicit task and acceptance criteria, and an exact approved Spec path/SHA; it creates at most one PR through the native safe output. Its current statement that there is no custom Producer must be updated in the main-only control-plane PR after this Spec is approved.
- `.github/workflows/eventgraph-dispatcher.md` already calls the native `work_queue_dispatch_next` exactly once. The Producer must never choose a Work ID or call a Worker workflow directly.
- `.github/workflows/aw.json` already has Work Queue concurrency two. This change does not alter it.
- `scripts/ci/check-spec.mjs` requires implementation PRs to cite an immutable Spec path/SHA already on their base branch. The implementation PR body must use the exact `Spec: specs/015-spec-task-intake/spec.md@<40-char-sha>` form.
- Project #2 already exists and its `agent-work` Auto-add rule is the intended Issue-to-Todo path. No Project creation or API synchronizer is needed.
- Spec 012 defines the exact code Work payload contract: version-1 `create_pull_request` output, min/max one, and EventGraph repository resource scope ID `1416699488`.

### Pinned GH-AW v1.0.1 upstream evidence

- `gh aw work-queue submit-graph --file <path>` atomically admits 1–256 complete normalized Work nodes: [work_command.go](https://github.com/github/gh-aw/blob/0627fdb/pkg/cli/work_command.go).
- Work identity is derived from canonical `graph_id` and `node_key`; normalized Work includes `depends_on`, routing fields, payload and enqueue time: [work_queue_graph.cjs](https://github.com/github/gh-aw/blob/0627fdb/actions/setup/js/work_queue_graph.cjs).
- GH-AW v1.0.1 accepts normalized external resources with repository and resource database IDs; the Producer resolves those IDs from GitHub REST before submission, and the native CLI/replayer validates them: [work_queue_graph.cjs](https://github.com/github/gh-aw/blob/0627fdb/actions/setup/js/work_queue_graph.cjs), [types.go](https://github.com/github/gh-aw/blob/0627fdb/pkg/workqueue/types.go), and [dependencies.go](https://github.com/github/gh-aw/blob/0627fdb/pkg/workqueue/dependencies.go).
- Issue dependency condition `completed` is satisfied only when the Issue is closed with GitHub state reason `completed`; a generic close or `not_planned` does not satisfy it: [dependencies.go](https://github.com/github/gh-aw/blob/0627fdb/pkg/workqueue/dependencies.go).
- GH-AW documents Issues as external dependency nodes, not queue storage: [Work Queue operations](https://github.com/github/gh-aw/blob/0627fdb/docs/src/content/docs/patterns/workqueue-ops.md).

## 2. Minimal design

### Deterministic Producer

Add `scripts/ci/spec-task-producer.mjs` and focused Node tests. Keep parsing, dependency validation, stable marker generation, idempotent Issue lookup/creation and normalized Work Graph construction in small pure functions with an injectable GitHub API client. Use Node built-ins only; add no package dependency and make no model call.

The producer scans first-parent merge commits after its own installation commit and reads each candidate Spec file from that exact historical merge SHA using `git show`. It validates the complete task graph before writing any Issue. It creates/reuses Issues using the stable `spec_sha + spec_path + task_id` marker and adds the existing `agent-work` label. It then reads the live GH-AW Queue Policy, builds normalized Work nodes using the installed default profile and submits the entire graph with the pinned CLI.

### Existing Check continuation

Extend `resume_native_queue` in `.github/workflows/check.yml`:

1. Check out the exact SHA and install Node 24.
2. On a successful current-head `develop` push, scan first-parent merge commits since the Producer installation commit in chronological order. For each commit, resolve its unique merged same-repository PR; admit only qualifying owner-merged Spec PRs.
3. Resolve repository and Issue database IDs through the GitHub API before constructing normalized external Issue dependencies. The native CLI validates the complete resource identities.
4. For each merged `agent-work` PR in the scanned range, validate the task Issue marker and close the Issue with reason `completed`.
5. Retain the existing exact-current-head, no-open-agent-PR, native-queue-stats and one-dispatch checks.

Do not make the Producer run on arbitrary `workflow_dispatch` calls. Do not duplicate the Dispatcher or add scheduled triggers.

### Worker prompt and main branch

The Worker source and generated lock live on `main`, while the Producer and Check implementation live on `develop`. After the approved Spec is merged to `develop`, mirror the exact Spec files to `main` in a docs-only PR. Then update the main-branch Worker Markdown to document the deterministic Producer payload and task Issue provenance, remove the obsolete “no custom Producer” sentence, and regenerate its lock using pinned GH-AW v1.0.1 strict compilation. Do not promote `develop` wholesale to `main`.

## 3. Data and identity contracts

- Task marker: `<!-- eventgraph-spec-task:v1 spec_sha=<sha> spec_path=<path> task_id=<id> -->`.
- Graph ID: `spec-<40-char-spec-sha>`.
- Node key: the exact Task ID.
- Work ID: GH-AW v1.0.1 canonical identity digest for graph ID and node key.
- External dependency: `{kind:"issue", resource:{kind:"issue",host:"github.com",repository:"jboone1989/EventGraph",number:"<issue-number>"}, condition:"completed"}`; the native admission resolver supplies immutable GitHub repository/resource IDs.
- Work payload: `task`, `task_id`, `issue_number`, `issue_url`, `spec_path`, `spec_sha`, `scope`, `acceptance_criteria`, the exact Spec 012 `effect_contract` and `resource_scope`.
- Worker routing: derive the default Worker profile, logical contract and trust domain from the live installed Policy. Never hardcode GLM or Pi.
- Completion: only the trusted post-merge Check continuation closes the matching Issue with reason `completed`.

## 4. Test strategy

- Parser unit tests: valid tasks, missing fields, duplicate IDs, malformed dependencies, unknown dependencies, self-dependencies, cycles, empty acceptance criteria and the 256-node limit.
- Producer tests with a fake GitHub API: qualifying owner merge, fork/non-owner rejection, exact Spec SHA, missing files, stable Issue markers, reuse after partial creation, duplicate marker fail-closed, label application and Work Graph idempotency.
- Work Graph tests: deterministic graph/node/work IDs, policy-derived Worker routing, exact version-1 effect/resource contracts, external Issue dependency shape and atomic graph limit.
- Completion tests: exact merged PR association, one matching Issue, exact Task/Spec marker, completed close reason; reject wrong base, fork, non-agent PR, multiple Issues, stale Spec, unmerged PR and failed Check.
- Run the existing CI, docs-only validation, exact-SHA checks and focused Node tests. Keep current native queue and dispatch gate behavior unchanged.
- End-to-end acceptance: after rollout, use one small approved Spec with a two-task dependency chain. Verify Issue creation and Project #2 Todo auto-add, one graph admission, first task PR/review/merge, Issue state reason `completed`, and only then the dependent task becoming dispatchable.

## 5. Branch and PR sequence

1. Merge this docs-only Spec PR to `develop` after its checks and review. Record its exact merge SHA.
2. Create one develop implementation PR pinned to that SHA. It contains the Producer, tests, task Issue completion helper, and the minimal `check.yml` integration.
3. Create a docs-only Spec mirror PR to `main` containing the exact approved Spec files; do not merge application code or promote `develop` wholesale.
4. Create a main-only Worker prompt/lock PR pinned to the mirrored Spec SHA. Compile with the official GH-AW v1.0.1 CLI in strict mode; never hand-edit generated locks.
5. Enable normal intake only after both branch PRs have merged and the exact-head checks/review pass. Preserve the existing native queue ledger and Policy.
