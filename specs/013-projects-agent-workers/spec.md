# GitHub Projects + Parallel Single-Profile Workers

**Status:** Owner-approved v3 revision 2026-11-02 — native GitHub Projects replaces the failed paid ProjectOps status agent; all native Worker and queue rules otherwise remain unchanged.  
**Date:** 2026-11-02  
**Repository:** `jboone1989/EventGraph`  
**Control-plane branch:** `main`  
**Development branch:** `develop`

## 1. Problem

The GH-AW Work Queue is deployed with one registered Worker profile (`eventgraph-worker`, Claude engine on GLM-5.3), a pool concurrency of one, and a dispatch gate that serializes code Work behind at most one open `agent-work` PR. Humans have no visualization of queued, running, in-review and finished agent Work, and throughput is capped at one Work at a time.

The intended change is horizontal parallelism of up to two concurrent Works on the **same single Worker profile**, plus GitHub Projects (native features only) as the human-facing management view. No Pi Worker, no second engine, no custom board.

## 2. Architectural decisions

1. **GitHub Projects is the only human-facing project-management UI.** One EventGraph Project uses native Auto-add so Issues and PRs labeled `agent-work` join it automatically, and native closed/merged automations move items to Done. Do not build a custom Workboard, status synchronizer or second tracker.
2. **Issue is the source of truth for task facts** (owner authorization, acceptance criteria). **The GH-AW native Work Queue remains the sole execution authority** (Work/Claim/Result ledger, retries, reservations). The Project is a *view*: queue and Project may disagree temporarily without breaking execution, and nothing is ever authorized or dispatched from the Project.
3. **One Worker profile, horizontal concurrency.** `eventgraph-worker` is reused unchanged (Claude engine, GLM-5.3, pinned Zhipu endpoint, `work_queue_assignment`, one-PR safe output). Parallelism comes from two simultaneous Worker workflow *runs* on two independent Works — not from a second profile. Pool concurrency becomes 2; each Work still holds exactly one Claim and may produce at most one PR.
4. **No Pi.** The 2026-10-30 decision to add `eventgraph-pi-worker` is superseded and dropped. Do not add Pi, Copilot, Codex or any second engine in this rollout. The existing `agent-worker:*` intake routing labels are not introduced (single profile makes them moot).
5. **Unified `agent-work` label.** After the Producer successfully submits an owner-approved Work, it idempotently adds `agent-work` to the source Issue. Worker PRs also carry `agent-work`. The label drives native Project Auto-add for both records; it never grants admission or execution authority (admission remains the owner-authored `agent-ready` event; execution remains the queue's).
6. **GitHub-native Project automation replaces ProjectOps.** Project #2 (`https://github.com/users/jboone1989/projects/2`) is already created and linked to EventGraph, with native Auto-add for `agent-work` Issues/PRs and native closed/merged→Done workflows enabled. Retire the optional paid GH-AW ProjectOps workflow (source + compiled lock), all its dispatch calls, and its strict-compile references; do **not** replace it with a custom Action, script, API synchronizer, or LLM. Newly added items start at Todo. Exact queued/running/review distinctions remain authoritative only in the native GH-AW Work Queue and PR metadata, not Project Status. Existing Project items are retained. Its formerly required `EVENTGRAPH_PROJECTS_PAT` secret becomes unused and is retired after the workflow is removed; never expose its value.
7. **In-flight concurrency cap 2, counted without double counting.** Active and queued Worker workflow runs plus open `agent-work` PRs are unioned into one set keyed by unique Work identity (Work ID / Worker run ID markers). A Work that has both a live run and an open PR counts once. The dispatch gate dispatches at most one Claim per gate run and the gate itself stays serial (existing concurrency group), so two in-flight Works are reached through two separate gate invocations, never one gate run claiming twice.

## 3. Admission, label and Project flow

### 3.1 Producer (intake)

- Existing rules unchanged: owner-authored `agent-ready` admission, pinned approved-Spec SHA validation, Issue-derived request-id idempotency (`issue-<number>`), no duplicate Work for one Issue.
- New, ordered strictly after Work submit success: `gh issue edit <n> --add-label agent-work` (idempotent command; the Producer workflow gains `issues: write`). An Issue must never be labeled into the Project before its Work exists; a failed Work submit leaves the Issue unlabeled.

### 3.2 Worker PR contract

- The Worker prompt passes the original Issue number and URL into the assignment.
- The PR body must contain `Closes #<Issue number>`, the Work ID, and the Worker Run ID marker.
- At most one non-draft PR per Work (existing safe-output cap). The PR carries the `agent-work` label so native Auto-add joins it to the same Project.

### 3.3 One-time Project setup (native)

- One EventGraph Project with: native Auto-add for open Issues with label `agent-work`; native Auto-add for PRs with label `agent-work`; native automations setting Status to Done when an Issue closes or a PR merges/closes.
- Verified on 2026-11-01: the owner-created Project #2 and native Auto-add, Item closed, Pull request merged workflows are enabled; issues #276 and #277 already appear as Todo. Native Auto-add does not backfill old items. A PR merged into `develop` does not automatically close its Issue via `Closes #N` (the GitHub default-branch rule); do not claim issue Done until GitHub actually closes the Issue.

## 4. Dispatch gate (concurrency control)

- Inputs: active/queued Worker workflow runs and open `agent-work` PRs, each reduced to its unique Work identity via PR-body/run markers.
- `in-flight = |unique set|`. Behavior: `0` or `1` → dispatch one Claim; `2` → block (cap reached); `≥3` (possible only via races or manual runs) → fail closed, report, no dispatch.
- Any run or PR whose markers are missing, invalid or unmatchable makes in-flight unprovable → fail closed with a clear error rather than dispatching.
- One Claim maximum per gate run; the gate workflow keeps its serial concurrency group. The gate no longer blocks merely because *a* PR is open — two Works/PRs may be in flight simultaneously up to the cap.

## 5. Completion

- Triggers: existing Worker `workflow_run` completion, plus a new `pull_request` closed trigger (merged or not).
- The completion path matches the PR for the exact current `workflow_run.id` via the run-ID marker in PR bodies. It must not assume there is only one open `agent-work` PR; two PRs may be open at once, and Check dispatch targets only the matched PR (fail closed for the Check: an unmatched or ambiguous PR never receives one).
- A successful run with zero matching PRs continues the queue under a loud warning instead of failing the pipeline: no-write Works legitimately finish without a PR, and a code Work whose PR is missing surfaces through that warning plus queue state. A failed run with an open matching PR, or two PRs claiming one run, fails closed.
- If the Worker run failed and produced no PR, the slot is released (Work settled per the queue contract) and the gate is triggered to backfill.
- After a PR merges or closes, the gate is triggered to backfill the freed slot.

## 6. Acceptance criteria

### Producer / labels

- [ ] `agent-work` is added to the Issue only after Work submit succeeds; re-running intake on an already-labeled Issue is idempotent (no error, no duplicate label); a Work submit failure leaves the Issue unlabeled.
- [ ] The Producer workflow declares `issues: write`; no other permission grows.

### Native Projects (v3, replaces ProjectOps)

- [x] Project #2 is linked to `jboone1989/EventGraph`; native Auto-add and closed/merged→Done workflows are enabled and Issues #276/#277 already appear on the Project.
- [ ] Eliminate the failed paid GH-AW ProjectOps source/lock and all of its intake/completion dispatch and compiler/check references; prove no such workflow is invoked after this change.
- [ ] Preserve Producer's successful-submit-then-label ordering, Worker completion gate/Check behavior, existing Work Queue budget pause and all relevant focused tests.
- [ ] Use only native Project states (Todo on add, Done on actual close/merge); do not infer or write per-Work running/review statuses. Remove the now-unused `EVENTGRAPH_PROJECTS_PAT` repository secret after deactivation.

### Gate

- [ ] Boundary tests prove 0 → dispatch, 1 → dispatch (fills to 2), 2 → block, 3 → fail closed.
- [ ] Unique-set accounting: a Work with both a live run and an open PR counts once; two Worker runs mapping to two PRs count as two.
- [ ] Invalid/missing markers or PR↔run mismatch → fail closed, no dispatch.
- [ ] A second Work can dispatch while one `agent-work` PR is open (cap permitting); the gate itself stays serial and dispatches one Claim per run.

### Completion

- [ ] Exact `workflow_run.id` → PR matching works with two open `agent-work` PRs; Check dispatch targets only the matched PR.
- [ ] No matching PR for a successful run → no Check dispatched, loud warning, queue continuation (no-write Works finish without PRs); duplicate or failed-run matches still fail closed.
- [ ] Failed Worker run with no PR → slot released, gate triggered; PR merged/closed → gate triggered to backfill; `pull_request` closed trigger present and tested.

### Parallelism / Worker

- [ ] `aw.json` concurrency is 2 and the administrator-authorized native Policy epoch is applied while the queue is quiescent (baseline verified: last Work `ad843119` settled; no pending Work/Claim/reservation).
- [ ] Dispatcher stays serial, one Claim at a time; per-Work Claim limit remains one.
- [ ] Worker prompt/PR body carry Issue number/URL, `Closes #N`, Work ID, Worker Run ID; one PR per Work.

### Real end-to-end acceptance

- [ ] Two real owner-authorized Works — story-detail-dedup P-4 (empty-clue card still shown, unimplemented) and FR-011 ("new since last visit", unimplemented) — are each submitted once through the existing Producer; no duplicate Work IDs or PRs; no smoke Work stands in for acceptance.
- [ ] The two real Worker runs' time windows overlap, each producing an independent PR whose body markers match its own Work/Issue.
- [ ] Both Issues/PRs appear in the same Project with trackable status; if token/Project setup needs owner action, the exact single step is reported, not claimed done.

### Operational constraints (retained)

- [ ] Existing gates unchanged and required: Spec gate, exact-head independent GLM review, Check, Docker; normal squash-merge policy; GH-AW source/locks stay on `main`; the application Worker's Check still runs from the `develop` mirror; no wholesale develop→main merge.
- [ ] No new queue, database, host timer, self-hosted Worker or second engine; nothing executes on cn-dev, VM13 or VM09; no production/VM09 change.
- [ ] Existing Work Queue ledger history, Claim bindings and reservations preserved.

## 7. Out of scope

- Pi or any second Worker engine (dropped by this revision).
- Custom Project board, custom GraphQL, or mirroring queue internals into Project fields beyond the native Status automations.
- Replacing the GH-AW native Work Queue or its transaction protocol.
- Any application product feature beyond the two acceptance Works' own approved Specs (both already owner-merged on `develop`).
- GitHub Projects as an authorization or dispatch surface.

## 8. Rollback

- If parallel runs misbehave: revert `aw.json` to concurrency 1 and re-apply the Policy epoch; the serial gate boundary (cap 1) is the previously proven state.
- ProjectOps was an optional view-layer overlay and is now retired. Keep native `agent-work` labeling, Project #2 items, Auto-add and Done automations; the queue/ledger continues independently.
- No queue ledger reset under any rollback.

## Decision history

- **2026-10-30** (v1, superseded): Pi + GLM dual-engine approved; implementation never started.
- **2026-10-31** (v1 amendment): Zhipu endpoint pinning for Dispatcher/Worker — still applies to the single retained Worker profile.
- **2026-11-01** (v2, this revision): Owner replaces the dual-engine plan — no Pi; one Claude/GLM-5.3 Worker profile with horizontal concurrency 2; GitHub Projects (native only) as the human visualization layer; unified `agent-work` label; precise per-run completion matching. The 2026-10-30 Pi decision is superseded, not silently deleted.

- **2026-11-02** (v3, owner-approved in ChatGPT conversation): after [ProjectOps run #41325563981](https://github.com/jboone1989/EventGraph/actions/runs/41325563981) failed at 10.264106 AIC without applying any `update_project`, the owner explicitly approved removing per-run GLM ProjectOps and relying on native GitHub Projects automation. Preserve the two-stage Spec-first flow: merge this documented revision before applying the [implementation PR #285](https://github.com/jboone1989/EventGraph/pull/285). This is a replacement of v2 §2.6 / ProjectOps acceptance, not permission to resume the paid Worker queue.\n