# GitHub Projects + Parallel Single-Profile Workers

**Status:** Owner-directed revision 2026-11-01 — supersedes the 2026-10-30 Pi dual-engine plan before its implementation; pending the normal `main` gates (Check / Docker / exact-head independent review)  
**Date:** 2026-11-01  
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
6. **ProjectOps uses GH-AW native Project tooling only.** A new ProjectOps workflow uses `tools.github` with toolsets `[default, projects]` and `safe-outputs.update-project` / `create-project`. It must read the real Project's fields and options before writing a status (Ready / In Progress / In Review / Done / Blocked); it never assumes field or option IDs. No hand-written GraphQL, no custom board API calls, no scraping. If the available token lacks Projects permission, the workflow explicitly skips or fails with a message naming the single required secret/permission, and never prints token values. ProjectOps failure must not block intake, dispatch, Worker execution or completion.
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
- Either configured automatically by ProjectOps when token permissions allow, or through accurate one-time UI steps delivered to the owner. Configuration must never be claimed complete without real evidence; if it requires owner UI action, say exactly that.

## 4. Dispatch gate (concurrency control)

- Inputs: active/queued Worker workflow runs and open `agent-work` PRs, each reduced to its unique Work identity via PR-body/run markers.
- `in-flight = |unique set|`. Behavior: `0` or `1` → dispatch one Claim; `2` → block (cap reached); `≥3` (possible only via races or manual runs) → fail closed, report, no dispatch.
- Any run or PR whose markers are missing, invalid or unmatchable makes in-flight unprovable → fail closed with a clear error rather than dispatching.
- One Claim maximum per gate run; the gate workflow keeps its serial concurrency group. The gate no longer blocks merely because *a* PR is open — two Works/PRs may be in flight simultaneously up to the cap.

## 5. Completion

- Triggers: existing Worker `workflow_run` completion, plus a new `pull_request` closed trigger (merged or not).
- The completion path matches the PR for the exact current `workflow_run.id` via the run-ID marker in PR bodies. It must not assume there is only one open `agent-work` PR; two PRs may be open at once, and Check dispatch targets only the matched PR.
- If the Worker run failed and produced no PR, the slot is released (Work settled per the queue contract) and the gate is triggered to backfill.
- After a PR merges or closes, the gate is triggered to backfill the freed slot.

## 6. Acceptance criteria

### Producer / labels

- [ ] `agent-work` is added to the Issue only after Work submit succeeds; re-running intake on an already-labeled Issue is idempotent (no error, no duplicate label); a Work submit failure leaves the Issue unlabeled.
- [ ] The Producer workflow declares `issues: write`; no other permission grows.

### ProjectOps

- [ ] Implemented as a GH-AW workflow using `tools.github` toolsets `[default, projects]` and `safe-outputs.update-project`/`create-project` only; no custom GraphQL.
- [ ] It reads the real Project fields/options before writing Ready / In Progress / In Review / Done / Blocked.
- [ ] With missing Projects permission it skips/fails explicitly, naming the single required secret/permission; it never outputs token values; all other pipelines still complete.
- [ ] Native Auto-add and closed/merged automations are either verified configured or accompanied by exact one-time owner UI steps; never falsely claimed done.

### Gate

- [ ] Boundary tests prove 0 → dispatch, 1 → dispatch (fills to 2), 2 → block, 3 → fail closed.
- [ ] Unique-set accounting: a Work with both a live run and an open PR counts once; two Worker runs mapping to two PRs count as two.
- [ ] Invalid/missing markers or PR↔run mismatch → fail closed, no dispatch.
- [ ] A second Work can dispatch while one `agent-work` PR is open (cap permitting); the gate itself stays serial and dispatches one Claim per run.

### Completion

- [ ] Exact `workflow_run.id` → PR matching works with two open `agent-work` PRs; Check dispatch targets only the matched PR.
- [ ] No matching PR for a successful run → fail closed with diagnostics.
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
- ProjectOps is a view layer: disabling it or removing its workflow breaks no execution path; `agent-work` labeling can stop without touching the queue.
- No queue ledger reset under any rollback.

## Decision history

- **2026-10-30** (v1, superseded): Pi + GLM dual-engine approved; implementation never started.
- **2026-10-31** (v1 amendment): Zhipu endpoint pinning for Dispatcher/Worker — still applies to the single retained Worker profile.
- **2026-11-01** (v2, this revision): Owner replaces the dual-engine plan — no Pi; one Claude/GLM-5.3 Worker profile with horizontal concurrency 2; GitHub Projects (native only) as the human visualization layer; unified `agent-work` label; precise per-run completion matching. The 2026-10-30 Pi decision is superseded, not silently deleted.
