# Spec-driven GitHub Projects and Native Work Queue Intake

**Status:** Owner-approved on 2026-11-03; implementation begins after this Spec is merged to `develop`.
**Date:** 2026-11-03
**Repository:** `jboone1989/EventGraph`
**Application / Producer branch:** `develop`
**GH-AW control-plane branch:** `main`
**Related Specs:** `012-github-hosted-agent-queue`, `013-projects-agent-workers`

## 1. Problem

EventGraph already has a GitHub Projects board (#2), an official GH-AW v1.0.1 native Work Queue, a GitHub-hosted GLM Worker, a native Dispatcher, and a successful-develop-check queue continuation path. However, a merged approved Spec does not automatically become visible task Issues or enter the native Work Queue. People still have to translate `tasks.md` into Issues and manually initiate work.

The missing capability is a deterministic bridge from an approved Spec to GitHub Issues and the existing native Work Queue. This is intake and projection, not a new planner or scheduler.

## 2. Architectural decisions

1. **A merged owner-approved Spec authorizes its declared tasks.** The merge of a same-repository Spec PR into `develop`, performed by `jboone1989`, is the authorization event for the tasks in that immutable Spec revision. Spec-generated task Issues do not require a second manual `agent-ready` label action. The existing `agent-ready` rule in Spec 013 remains applicable only to any separately approved manual-Issue intake; it must not gate or duplicate Spec-generated tasks.
2. **GitHub Issues are the task records.** Create exactly one Issue for each task in the approved `tasks.md`. Each Issue carries its Task ID, acceptance criteria, Spec path and immutable merge SHA. GitHub Projects is a view of those Issues, not another source of task truth.
3. **Reuse the existing EventGraph Project #2.** New task Issues receive the existing `agent-work` label. The Project's existing Auto-add rule is responsible for adding them to Todo. Do not create another Project, board, custom project synchronizer, or direct Project API writer.
4. **The official GH-AW native Work Queue remains the only execution scheduler.** Submit one native Work Graph per Spec using the pinned GH-AW v1.0.1 `gh aw work-queue submit-graph` command. Do not add a second queue, database, ledger, host process, timer, cron, polling loop, or LLM-based scheduler.
5. **Use the existing Worker and Dispatcher.** Each Work uses the default Worker profile from the installed native Queue Policy. The Producer must not hardcode Claude, GLM, Pi, a model ID, or a workflow name. Newly installed approved Worker profiles remain selectable through the native policy.
6. **Dependencies mean merged-and-verified work, not merely a finished Worker run.** A task with predecessors is gated on the predecessor Issue using the native Work Queue external dependency `{kind: "issue", condition: "completed"}`. The trusted develop Check continuation closes a task Issue with GitHub state reason `completed` only after the corresponding `agent-work` PR has merged and the exact develop SHA has passed the existing Check/E2E/publish path. A Worker finishing after it creates a PR does not satisfy the dependency.
7. **No extra model call is used for intake.** Parsing, validation, Issue creation, graph construction, idempotency, completion verification and dispatch remain deterministic GitHub Actions code.

This Spec supersedes the Spec-derived intake assumptions in Spec 013 §3.1 and its “no Project board” out-of-scope statement. It does not change the GH-AW Worker execution contract, the native queue protocol, the two-in-flight Policy, or the independent review and merge gates.

## 3. Canonical `tasks.md` contract

A Spec that is eligible for automatic intake MUST contain all three files under one directory:

```text
specs/<feature>/
  spec.md
  plan.md
  tasks.md
```

The Spec MUST explicitly state `Status: Owner-approved`. The task file MUST contain one `## Work Items` section and one or more task blocks in this exact shape:

```markdown
## Work Items

### T001 — Implement the model configuration API
**Scope:** Add the model configuration CRUD endpoints and persistence behavior.
**Depends on:** none
**Acceptance:**
- Create, read, update and delete model configurations.
- Validate required fields and reject duplicate identifiers.
- Add focused automated tests.

### T002 — Implement the model management list
**Scope:** Add the model CRUD list and a per-row test action.
**Depends on:** T001
**Acceptance:**
- Display existing models and support create, edit and delete.
- Provide a test action on each model row.
- Add focused automated tests.
```

Rules:

- Task IDs MUST be unique and match `T[0-9]{3}`.
- Every task MUST have a non-empty title, one non-empty Scope, a Depends on line, and at least one Acceptance bullet.
- Dependencies MUST be `none` or a comma-separated list of Task IDs in the same Spec.
- Every dependency MUST reference an existing task. Self-dependencies and cycles MUST be rejected.
- The graph MUST contain at most 256 tasks, matching the pinned native `submit-graph` limit. Larger work MUST be split across separately approved Specs.
- A malformed or ambiguous task file MUST fail closed before creating Issues or submitting Work. The Producer MUST NOT ask an LLM to repair or infer missing task data.

## 4. Intake trigger and immutable authorization

Extend the existing `resume_native_queue` job in `.github/workflows/check.yml`; do not create a competing dispatch workflow.

The Producer runs only from the existing successful `resume_native_queue` continuation when all of the following hold:

1. The current event is a `develop` push, not an arbitrary branch or an unvalidated manual dispatch.
2. Check, E2E and publish have succeeded for the exact current `develop` head, or the existing docs-only path has explicitly skipped E2E and publish.
3. `EVENTGRAPH_NATIVE_QUEUE_EVENTS_ENABLED == 'true'`.
4. The push SHA is still the current `develop` head.
5. The Producer scans the first-parent commit range after the commit that installed the Producer. Each candidate merge commit must resolve to exactly one merged, same-repository PR targeting `develop`; direct pushes, fork PRs and unrelated commits are ignored.
6. A Spec candidate must have been merged by `jboone1989`, must change `spec.md`, `plan.md` and `tasks.md` in exactly one `specs/<feature>/` directory, and the Spec at that candidate merge SHA must state `Owner-approved`.

The candidate PR merge commit SHA is that Spec revision's approved SHA. The Producer MUST record that exact SHA, not a moving branch name or the PR head branch. The successful current-head Check is the gate for the entire catch-up scan; scanning the first-parent range prevents a cancelled or superseded older push run from losing a merged Spec. The native queue's stable graph/node identities make reprocessing previously admitted Specs idempotent. A failed current Check, direct push without an associated qualifying PR, fork PR, non-owner Spec merge, missing Spec file, or ambiguous Spec directory MUST produce no Issue and no Work.

The Producer processes candidates in first-parent order. For a merged `agent-work` PR it verifies the task Issue provenance and closes the Issue with reason `completed` only after the current develop Check path succeeds. It submits any newly approved Spec graphs before the same trusted job's final Dispatcher step; no separate polling or timer is needed.

## 5. GitHub Issue creation and Project projection

For each task, create one Issue with:

- A readable title beginning with its Task ID.
- The Scope and Acceptance criteria copied from the approved task block.
- Its dependency Task IDs.
- The immutable Spec path and merge SHA.
- The Spec PR URL and original approved merge SHA.
- A stable machine-readable marker, for example:
  `<!-- eventgraph-spec-task:v1 spec_sha=<40-char-sha> spec_path=<path> task_id=T001 -->`.
- The existing `agent-work` label.

Idempotency is keyed by the exact `spec_sha + spec_path + task_id` marker. On retry, reuse the unique existing Issue. If multiple Issues match one marker, fail closed rather than choosing one. If Issue creation partially succeeds, a retry MUST reuse already-created Issues and finish the remaining work.

The Project #2 Auto-add rule adds each labelled Issue to Todo. The Producer MUST NOT create Project items directly or treat Project status as execution authorization.

## 6. Native Work Graph submission

After all task Issues exist, submit one complete native Work Graph atomically with the pinned GH-AW v1.0.1 CLI.

- `graph_id` is stable for the immutable Spec revision (for example, `spec-<spec_sha>`).
- Each task ID is its stable `node_key`.
- `work_id` is derived using the GH-AW v1.0.1 canonical Work identity algorithm from `graph_id` and `node_key`.
- Work routing fields (`pool`, `worker_profile`, `logical_contract`, `batch_trust_domain`) are read from the live installed Queue Policy; do not hardcode a model or Worker.
- Each Work payload includes `task`, `task_id`, `issue_number`, `issue_url`, `spec_path`, `spec_sha`, `scope`, and the ordered `acceptance_criteria`.
- Each Work declares the existing Spec 012 version-1 resource contract: exactly one repository-scoped `create_pull_request` safe output with `min: 1` and `max: 1`, and the canonical EventGraph repository resource scope (`github.com/jboone1989/EventGraph`, repository ID `1416699488`).
- A task with no predecessors has an empty `depends_on` list. Each declared predecessor becomes an external Issue dependency with `kind: "issue"`, `condition: "completed"`, and the predecessor Issue's immutable GitHub database ID, repository ID and Issue number. The Producer resolves these numeric identities through the GitHub API; the pinned native CLI validates the complete normalized resource at admission.
- Do not use Work-to-Work completion edges for code tasks: a Worker may finish its Claim after safely creating a PR, before that PR is reviewed and merged.

The graph identity makes repeated submissions of the same Spec revision idempotent. Do not submit a partial graph. If Issue creation or native admission fails, report the failure and do not dispatch.

## 7. PR completion and dependency release

The existing trusted `resume_native_queue` job MUST reconcile a merged `agent-work` PR before it dispatches the next Work:

1. Resolve the unique PR associated with the exact successful `develop` merge SHA.
2. Require a same-repository PR targeting `develop`, an `agent/*` head branch, the `agent-work` label, and a merged state.
3. Require exactly one task Issue reference in the PR body, plus matching Task ID and exact `Spec: specs/<feature>/spec.md@<40-char-sha>` provenance.
4. Verify the referenced Issue has the matching stable Spec/Task marker and is still open.
5. Close that Issue with GitHub state reason `completed`. Never close it merely because a Worker run completed or a PR was opened.
6. Only then run the existing native queue eligibility and open-PR serialization checks and invoke the existing Dispatcher.

The Worker PR body MUST include the Issue number and URL, Task ID, and exact Spec path/SHA. It MUST NOT use closing keywords such as `Closes #123`, because `develop` is not the repository default branch. GH-AW's generated safe-output provenance remains authoritative for Work and Worker-run identity; the Worker MUST NOT invent those markers.

An unmerged or closed-without-merge PR does not complete its Issue and does not release dependent tasks. A failed develop Check does not close the Issue. A manual Issue close with state reason `not_planned` does not satisfy a `completed` dependency.

## 8. Failure handling and safety

- The Producer is deterministic and makes no model calls.
- Validate the entire task document and dependency graph before the first Issue write.
- Use the existing `GH_AW_GITHUB_TOKEN` for the approved repository operations; do not broaden the workflow's `GITHUB_TOKEN` permissions.
- Do not change Queue Policy, concurrency, retry policy, worker profiles, ledger history or branch protections.
- Preserve the current one-open-`agent-work`-PR dispatch gate and exact-SHA Check/review/merge gates.
- If the native queue is paused, missing, malformed, or lacks an approved default Worker route, create no Work and do not attempt a fallback queue.
- If the Project label or Auto-add configuration is unavailable, fail visibly; do not silently create a second Project or bypass the configured view.
- Keep all execution on GitHub-hosted runners. No work executes on cn-dev, VM13 or VM09.

## 9. Acceptance criteria

- [ ] A merged owner-approved Spec with valid tasks creates exactly one Issue per task and adds `agent-work` to every Issue.
- [ ] The existing Project #2 Auto-add rule places those Issues in Todo without direct Project API writes.
- [ ] Re-running intake for the same Spec SHA creates no duplicate Issues or Work.
- [ ] Invalid task format, duplicate IDs, missing dependencies, cycles, more than 256 tasks, a non-owner merge, a fork PR, or a missing Spec file creates no Work.
- [ ] One native Work Graph is admitted atomically with stable graph/node/work identities and the exact Spec 012 effect/resource contract.
- [ ] Root tasks are eligible immediately; dependent tasks remain ineligible until each predecessor Issue is closed with state reason `completed`.
- [ ] The Work selects the installed default Worker profile rather than hardcoding a model or engine.
- [ ] A Worker PR carries its Issue, Task ID and immutable Spec reference and passes the existing exact-SHA Check, independent GLM review and GitHub-native auto-merge gates.
- [ ] The trusted develop continuation closes the corresponding Issue as `completed` only after the merged PR's exact develop SHA passes the existing Check/E2E/publish path.
- [ ] Closing the predecessor Issue makes the dependent Work eligible for the existing native Dispatcher; no polling, timer or second scheduler is introduced.
- [ ] The current queue ledger, concurrency Policy, worker configuration, Project #2 and branch protections remain intact.

## 10. Out of scope

- Creating a new GitHub Project or another task board.
- Replacing the native GH-AW Work Queue or implementing a custom scheduler.
- LLM task decomposition, task rewriting, model selection or dynamic Worker routing in the Producer.
- Changing the existing GLM/Pi Worker implementation or adding another model provider.
- Increasing queue concurrency, changing retry budgets, or altering current review/merge requirements.
- Migrating the existing Issue #176 checklist or unrelated historical tasks.
- Any production deployment or server-side execution.
