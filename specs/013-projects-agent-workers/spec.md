# GitHub Projects and Multi-Engine GH-AW Workers

**Status:** Draft — owner approval required before implementation  
**Date:** 2026-10-30  
**Repository:** `jboone1989/EventGraph`  
**Control-plane branch:** `main`  
**Development branch:** `develop`

## 1. Problem

The GH-AW Work Queue is now present in EventGraph, but its current deployment has one registered Worker profile (`eventgraph-worker`, Claude engine configured for GLM-5.3) and a pool concurrency of one. There is no GitHub Projects board serving as the human-facing planning view.

The intended system needs both:

- A visible place to plan, prioritize and follow EventGraph work.
- More than one GitHub-hosted Agent Worker that can execute the same queue contract.

These are complementary responsibilities. They must not become competing task stores or schedulers.

## 2. Architectural decisions

1. **GitHub Projects is the planning and visibility surface.** It contains Issues and Pull Requests and presents their status. It is not a queue backend or a second scheduler.
2. **GitHub Issues remain the canonical task records.** Task requirements, approved Spec references and acceptance criteria live in Issues. Existing Issue #176 remains the current parent/backlog record for its existing checklist; this rollout does not create duplicate Issues for every checkbox.
3. **The GH-AW native Work Queue remains the only execution scheduler.** Its Git-backed `work-queue.jsonl` ledger remains authoritative for Work, Claims, retries, dependencies, reservations and Results. No new queue, database, timer, host-side process or scheduling service is introduced.
4. **Agent Workers are GH-AW worker profiles using different supported engines.** A Work selects an approved `worker_profile`; the native scheduler still selects eligible Work and grants Claims. Every Worker receives the same immutable assignment contract and must return through the same claim-scoped delivery path.
5. **Keep the existing GLM Worker.** `eventgraph-worker` remains the default profile and continues to use the existing Claude engine with GLM-5.3. Existing accepted Work and its profile binding must not be rewritten.
6. **Add a Pi engine Worker.** Add `eventgraph-pi-worker` using GH-AW's documented `engine: pi` and native Work Queue worker role. Reuse the existing `GLM_API_KEY` and `GLM_BASE_URL` secrets/variables with `model: anthropic/glm-5.3`. It must use the same Spec validation, repository resource scope, one-PR safe output and independent review/merge gates as the GLM Worker. This adds a second Agent Harness over the existing GLM model service; it does not add a second model provider.
7. **Use Pi as a Worker engine, not as a scheduler.** GH-AW runs Pi inside the GitHub-hosted Worker workflow and exposes the native Work Queue and safe-output MCP tools. Do not create a separate Pi dispatcher or session manager. The Pi engine reference says threat detection defaults to Copilot regardless of Pi's model provider; therefore `eventgraph-pi-worker` must explicitly configure `safe-outputs.threat-detection.engine` as the built-in `claude` engine with the same GLM-5.3 Anthropic-compatible endpoint and key. This avoids an implicit Copilot dependency.
8. **Use native GitHub Project automations.** Configure the Project's built-in Auto-add workflow and built-in status workflows. Do not build ProjectOps or a custom Project synchronizer for simple, rule-based transitions. Existing matching items must be bulk-added once because GitHub's Auto-add workflow only adds items when they are created or updated after the workflow is enabled.
9. **Do not let Project status replace queue state.** Project Status is for human planning. The Work Queue ledger remains the source of truth for execution state. Project labels expose priority and Worker selection; they do not grant queue authority.

## 3. GitHub Project requirements

Create one user-owned GitHub Project:

- **Title:** `EventGraph Delivery`
- **Owner:** `jboone1989`
- **Initial items:** Issue #176 and all currently open EventGraph Issues and Pull Requests.
- **Views:** a Board grouped by Status, and a Table view showing Title, Status, Assignees, Labels, Repository and linked Pull Requests.
- **Status:** use GitHub's built-in Status field and its standard Todo, In Progress and Done values. Do not add a parallel status field or custom status database.
- **Labels:** use repository labels to expose routing and priority in the Project:
  - `priority:P0`, `priority:P1`, `priority:P2`, `priority:P3`
  - `agent-ready`
  - `agent-worker:glm`
  - `agent-worker:copilot`
  - `blocked`

Configure the built-in Project workflows:

1. Auto-add new open Issues and Pull Requests from `jboone1989/EventGraph` using the `is:open` filter.
2. Set the Status to Done when an Issue or Pull Request is closed.
3. Set the Status to Done when a Pull Request is merged.
4. Set newly added items to Todo. Use `agent-ready` and `blocked` labels to distinguish ready and blocked work without expanding the Status field.

The one-time bulk import of existing open items is separate from Auto-add. Do not create a custom API integration or PAT-backed ProjectOps workflow for this initial use case.

## 4. Worker routing and authorization

### 4.1 Intake labels

The existing owner-authorized `agent-ready` label remains the only admission trigger. Only an event authored by `jboone1989` may admit Work.

The intake script chooses the Worker profile from the Issue's labels at the time the owner adds `agent-ready`:

| Issue labels at admission | Selected profile |
|---|---|
| `agent-ready` with no Worker label | `eventgraph-worker` (GLM default) |
| `agent-ready` + `agent-worker:glm` | `eventgraph-worker` |
| `agent-ready` + `agent-worker:copilot` | `eventgraph-copilot-worker` |
| Both Worker labels | Reject as ambiguous; submit no Work |

Apply the Worker-selection label first and add `agent-ready` last. This ensures the owner-authorized admission event sees the intended route. Changing labels after admission does not mutate the immutable Work or its selected Worker profile.

A Worker-selection label without the owner-authored `agent-ready` event grants no authority. Duplicate label events must remain idempotent under the existing Issue-derived request ID.

### 4.2 Worker contract

Both Worker profiles must:

- Run on GitHub-hosted infrastructure only.
- Accept only their original authenticated `work_queue_assignment` Claims.
- Verify the exact immutable approved Spec path and SHA from the Work.
- Research and reuse current repository code, upstream implementation and official interfaces before implementation.
- Have no direct repository write permission in the model-facing agent job.
- Create at most one non-draft PR to `develop` through the existing claim-scoped `create-pull-request` safe output.
- Include the Issue URL, Spec path/SHA, Work ID and Worker run ID marker in the PR body.
- Finish only the original Claim and never merge, edit Issues, dispatch other workflows or write outside the Work's declared resource scope.

The existing central independent GLM review, exact-SHA Check/E2E/Docker gates, branch protection and normal squash merge remain unchanged. A Worker must not review its own PR as the independent approval.

### 4.3 Pi + existing GLM provider

GH-AW's Pi engine supports the `anthropic/` provider through `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL`. Reuse the existing EventGraph `GLM_API_KEY` and `GLM_BASE_URL` values and select `anthropic/glm-5.3`; no Copilot entitlement or new provider key is required. This is a second Agent Harness using the same GLM model/backend, not a second model provider.

The Pi engine reference states that threat detection defaults to Copilot regardless of Pi's model provider. The Pi Worker must therefore explicitly set `safe-outputs.threat-detection.engine` to the built-in `claude` engine, with the same GLM-5.3 Anthropic-compatible endpoint and key. Do not leave the default implicit. Validate both Pi inference and the explicit GLM-backed detection engine with real GitHub-hosted no-write smoke Work before enabling ordinary development. If either fails, leave only the Pi profile disabled and retain the existing GLM Worker.

## 5. Parallel execution

The currently installed Work Queue Policy has a pool capacity of one. Do not change it while the existing smoke Work, Claims, reservations or delivery barriers remain unfinished.

After the existing smoke Work is settled and the queue is quiescent:

1. Set the default pool concurrency to two in `.github/workflows/aw.json`.
2. Apply the corresponding administrator-authorized native Policy epoch using the official GH-AW operator command.
3. Verify that two independent Claims can run concurrently and that each is routed to its selected Worker profile.
4. Keep each profile's per-assignment Claim limit at one. Do not increase concurrency beyond two in this rollout.

If the queue cannot be proven quiescent, retain concurrency one. A config-file edit alone does not change an already installed Policy.

## 6. Acceptance criteria

### GitHub Projects

- [ ] One user-owned `EventGraph Delivery` Project exists.
- [ ] Issue #176 and the existing open EventGraph Issues/PRs are present exactly once.
- [ ] The Board and Table views expose Status and Labels.
- [ ] The built-in Auto-add workflow adds newly created or updated open EventGraph Issues and PRs after activation.
- [ ] Closing an Issue/PR and merging a PR update its Project Status to Done through GitHub's built-in workflows.
- [ ] No custom Project database, ProjectOps workflow, project-specific token or second task tracker is introduced.

### Agent Workers

- [ ] Existing `eventgraph-worker` remains functional and remains the default profile.
- [ ] `eventgraph-copilot-worker` is published with the official GH-AW Copilot engine and accepts the same immutable Work Queue assignment contract.
- [ ] The Dispatcher allowlists both Worker workflows.
- [ ] Intake tests prove default-to-GLM routing, explicit GLM routing, Pi routing, owner-only admission, duplicate-event idempotency and rejection of ambiguous Worker labels.
- [ ] Both profiles compile with the pinned official GH-AW v1.0.1 CLI in strict mode; generated lock files are produced by the CLI and are never hand-edited.
- [ ] A real no-write Work succeeds on each enabled profile. Pi remains disabled if its hosted smoke test does not pass.
- [ ] At least one owner-authorized code Work through each enabled profile produces a PR with the correct Work/run marker and exact Spec reference.
- [ ] The existing Check, E2E, Docker, independent GLM review, branch-protection and merge gates remain intact.
- [ ] After quiescent Policy update, two independent Work items are observed executing concurrently without duplicate Claims or cross-profile assignment.

### Operational constraints

- [ ] No new queue, database, host timer, cron, tmux process, separate Pi dispatcher or self-hosted Worker is introduced.
- [ ] No code executes on cn-dev, VM13 or VM09 as part of Agent Worker execution.
- [ ] Existing Work Queue ledger history, active reservations and Claim bindings are preserved.
- [ ] Missing Pi/GLM provider compatibility, Project setup or queue quiescence is reported as a concrete blocker; it never becomes a false success.

## 7. Out of scope

- Replacing the GH-AW native Work Queue or changing its transaction protocol.
- A custom ProjectOps agent, Project GraphQL client or custom Project status database.
- Copilot Cloud Agent asynchronous session delegation via `assign-to-agent` or `create-agent-session`.
- Adding Codex, Claude Cloud Agent or other engines in this first implementation. The Worker-profile boundary must allow future additions without changing the queue protocol.
- Migrating every checkbox in Issue #176 into a new Issue. Existing #176 remains the parent/backlog record; future independently assigned work should use its own Issue.
- Any application product feature, production release or VM09 change.

## 8. Rollback

- If Project setup is unavailable, continue using the existing Issues and GH-AW queue; Project is not a runtime dependency.
- If Pi/GLM compatibility or the explicit detection configuration fails smoke validation, disable only the Pi route and retain the existing GLM Worker.
- If concurrent Policy update cannot be applied safely, keep the existing concurrency-one Policy. Do not reset or rewrite the queue ledger.
