# Multi-Engine GH-AW Workers

**Status:** Owner-approved on 2026-10-30 — Pi + existing GLM-5.3 is approved as the second GH-AW Worker; implementation starts after this Spec PR merges to develop  
**Date:** 2026-10-30  
**Repository:** `jboone1989/EventGraph`  
**Control-plane branch:** `main`  
**Development branch:** `develop`

## 1. Problem

The GH-AW Work Queue is now present in EventGraph, but its current deployment has one registered Worker profile (`eventgraph-worker`, Claude engine configured for GLM-5.3) and a pool concurrency of one.

The intended change is to add a second supported GitHub-hosted Agent Worker that executes the same immutable queue contract, while preserving the existing backlog, scheduler and delivery pipeline.

## 2. Architectural decisions

1. **Issue #176 remains the only human-maintained backlog.** Its unchecked tasks, approved Specs and acceptance criteria remain the source of human-authorized work. Do not create a second planning board or duplicate task tracker.
2. **The GH-AW native Work Queue remains the only execution scheduler.** Its Git-backed `work-queue.jsonl` ledger remains authoritative for Work, Claims, retries, dependencies, reservations and Results. No new queue, database, timer, host-side process or scheduling service is introduced.
3. **Agent Workers are GH-AW worker profiles using different supported engines.** A Work selects an approved `worker_profile`; the native scheduler still selects eligible Work and grants Claims. Every Worker receives the same immutable assignment contract and must return through the same claim-scoped delivery path.
4. **Keep the existing GLM Worker.** `eventgraph-worker` remains the default profile and continues to use the existing Claude engine with GLM-5.3. Existing accepted Work and its profile binding must not be rewritten.
5. **Add a Pi engine Worker.** Add `eventgraph-pi-worker` using GH-AW's documented `engine: pi` and native Work Queue worker role. Reuse the existing `GLM_API_KEY` and `GLM_BASE_URL` secrets/variables with `model: anthropic/glm-5.3`. It must use the same Spec validation, repository resource scope, one-PR safe output and independent review/merge gates as the GLM Worker. This adds a second Agent Harness over the existing GLM model service; it does not add a second model provider.
6. **Use Pi as a Worker engine, not as a scheduler.** GH-AW runs Pi inside the GitHub-hosted Worker workflow and exposes the native Work Queue and safe-output MCP tools. Do not create a separate Pi dispatcher or session manager. The Pi engine reference says threat detection defaults to Copilot regardless of Pi's model provider; therefore `eventgraph-pi-worker` must explicitly configure the detector as described in §3.3. This avoids an implicit Copilot dependency.

## 3. Worker routing and authorization

### 3.1 Intake labels

The existing owner-authorized `agent-ready` label remains the only admission trigger. Only an event authored by `jboone1989` may admit Work.

The intake script chooses the Worker profile from the Issue's labels at the time the owner adds `agent-ready`:

| Issue labels at admission | Selected profile |
|---|---|
| `agent-ready` with no Worker label | `eventgraph-worker` (GLM default) |
| `agent-ready` + `agent-worker:glm` | `eventgraph-worker` |
| `agent-ready` + `agent-worker:pi` | `eventgraph-pi-worker` |
| Both Worker labels | Reject as ambiguous; submit no Work |

Apply the Worker-selection label first and add `agent-ready` last. The first owner-authored `agent-ready` event fixes the Worker profile and submits Work under the stable request ID `issue-<number>`. If `agent-ready` arrives before a Worker-selection label, the Work intentionally defaults to GLM; adding a Worker label later or removing and re-adding `agent-ready` will not reroute it because the same request ID is deduplicated. To reroute after a misordered admission, cancel the original Work through the native `gh aw work-queue cancel-work` operator path. If it has a Claim, wait for verified worker quiescence and delivery settlement because cancellation alone does not stop the native run. Then close the original Issue as superseded and create a replacement Issue with a new Issue-derived request ID and the desired Worker label. Never submit a second Work for the same Issue.

A Worker-selection label without the owner-authored `agent-ready` event grants no authority. Duplicate label events must remain idempotent under the existing Issue-derived request ID.

### 3.2 Worker contract

Both Worker profiles must:

- Run on GitHub-hosted infrastructure only.
- Accept only their original authenticated `work_queue_assignment` Claims.
- Verify the exact immutable approved Spec path and SHA from the Work.
- Research and reuse current repository code, upstream implementation and official interfaces before implementation.
- Have no direct repository write permission in the model-facing agent job.
- Create at most one non-draft PR to `develop` through the existing claim-scoped `create-pull-request` safe output.
- Include the Issue URL, Spec path/SHA, Work ID and Worker run ID marker in the PR body.
- Finish only the original Claim and never merge, edit Issues, dispatch other workflows or write outside the Work's declared resource scope.

Develop PRs continue to use the existing central independent GLM review and exact-SHA Check/E2E/Docker gates. The current reusable reviewer only resolves PRs targeting `develop`, while this control-plane rollout must merge through `main`. Before opening any main PR, extend the existing reusable reviewer in `jboone1989/livingruntime-remote` to resolve and validate both `develop` and `main` PRs, and add `claude-review` to the EventGraph `main` ruleset alongside its existing `check` and `docker` requirements. Reuse the same GLM reviewer, checklist and exact-HEAD validation; do not create a second review pipeline. A main PR must not merge until its exact-head `claude-review`, `check` and `docker` statuses succeed. A Worker must not review its own PR as the independent approval.

The existing `eventgraph-worker-complete.yml` and `eventgraph-work-queue-guards.mjs` completion path must recognize both Worker workflow names (`EventGraph GH-AW Worker` and `EventGraph GH-AW Pi Worker`). Both Worker results must pass through the same marker verification, exact-SHA Check dispatch and queue continuation. Do not create a second completion pipeline.

### 3.3 Pi + existing GLM provider

GH-AW's Pi engine supports the `anthropic/` provider through `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL`. Reuse the existing EventGraph `GLM_API_KEY` and `GLM_BASE_URL` values and select `anthropic/glm-5.3`; no Copilot entitlement or new provider key is required. This is a second Agent Harness using the same GLM model/backend, not a second model provider.

The Pi engine reference states that threat detection defaults to Copilot regardless of Pi's model provider. The Pi Worker must therefore explicitly use the object form of `safe-outputs.threat-detection.engine`, and must not rely on environment or model-alias inheritance from the Pi workflow. Configure the built-in Claude detector with an explicit GLM model ID and provider environment:

```yaml
safe-outputs:
  threat-detection:
    engine:
      id: claude
      model: glm-5.3
      env:
        ANTHROPIC_BASE_URL: ${{ vars.GLM_BASE_URL || 'https://open.bigmodel.cn/api/anthropic' }}
        ANTHROPIC_API_KEY: ${{ secrets.GLM_API_KEY }}
```

This is required because GH-AW does not inherit the main Pi engine's `env`, API target or custom model aliases when the detection engine differs. Validate both Pi inference and this separately configured GLM-backed detector with real GitHub-hosted no-write smoke Work before enabling ordinary development. If either fails, leave only the Pi profile disabled and retain the existing GLM Worker.

## 4. Parallel execution

The currently installed Work Queue Policy has a pool capacity of one. Do not change it while the existing smoke Work, Claims, reservations or delivery barriers remain unfinished.

After the existing smoke Work is settled and the queue is quiescent:

1. Set the default pool concurrency to two in `.github/workflows/aw.json`.
2. Apply the corresponding administrator-authorized native Policy epoch using the official GH-AW operator command.
3. Submit two independent **no-write** Works before dispatching either one. With no open `agent-work` PR, use the existing dispatch gate to dispatch them and verify that both Worker runs hold concurrent Claims, one per selected profile. These no-write Works create no PRs and therefore do not bypass or conflict with the dispatch gate.
4. Keep each profile's per-assignment Claim limit at one. Do not increase concurrency beyond two in this rollout.

Code Work remains serialized by the existing `eventgraph-dispatch-gate`, which refuses another dispatch while an `agent-work` PR to `develop` is open. This rollout does not attempt concurrent code PRs. Validate code delivery through the two profiles sequentially, allowing each PR to pass its normal independent review and merge before dispatching the next.

If the queue cannot be proven quiescent, retain concurrency one. A config-file edit alone does not change an already installed Policy.

## 5. Acceptance criteria

### Agent Workers

- [ ] Existing `eventgraph-worker` remains functional and remains the default profile.
- [ ] `eventgraph-pi-worker` is published with the official GH-AW Pi engine and accepts the same immutable Work Queue assignment contract.
- [ ] The Dispatcher allowlists both Worker workflows.
- [ ] The central GLM reviewer accepts exact-head PRs targeting `main` as well as `develop`; the EventGraph `main` ruleset requires `claude-review` alongside `check` and `docker`.

- [ ] The existing Worker Completion workflow accepts both Worker workflow names and routes both through the same verified PR/Check/queue-continuation path; focused tests cover both identities.
- [ ] Intake tests prove default-to-GLM routing, explicit GLM routing, Pi routing, owner-only admission, duplicate-event idempotency and rejection of ambiguous Worker labels.
- [ ] Both profiles compile with the pinned official GH-AW v1.0.1 CLI in strict mode; generated lock files are produced by the CLI and are never hand-edited.
- [ ] A real no-write Work succeeds on each enabled profile. Pi remains disabled if its hosted smoke test does not pass.
- [ ] At least one owner-authorized code Work through each enabled profile produces a PR with the correct Work/run marker and exact Spec reference.
- [ ] Develop PRs retain Check/E2E/Docker/GLM review; main PRs receive exact-head `claude-review`, Check and Docker, with `claude-review` required by the main ruleset.
- [ ] After quiescent Policy update, two independent no-write Work items are observed executing concurrently without duplicate Claims or cross-profile assignment, while no `agent-work` PR is open.

### Operational constraints

- [ ] No new queue, database, host timer, cron, tmux process, separate Pi dispatcher or self-hosted Worker is introduced.
- [ ] No code executes on cn-dev, VM13 or VM09 as part of Agent Worker execution.
- [ ] Existing Work Queue ledger history, active reservations and Claim bindings are preserved.
- [ ] Pi/GLM provider compatibility or queue quiescence is reported as a concrete blocker; it never becomes a false success.

## 6. Out of scope

- Replacing the GH-AW native Work Queue or changing its transaction protocol.
- Creating a GitHub Projects board or another task tracker; Issue #176 remains the only human-maintained backlog.
- Codex execution through ChatGPT subscription login is not part of this GitHub-hosted rollout; GH-AW's native Codex engine requires an OpenAI API key or Copilot inference.
- Adding Codex, Claude Cloud Agent or other engines in this first implementation. The Worker-profile boundary must allow future additions without changing the queue protocol.
- Migrating every checkbox in Issue #176 into a new Issue. Existing #176 remains the parent/backlog record; future independently assigned work should use its own Issue.
- Any application product feature, production release or VM09 change.

## 7. Rollback

- If Pi/GLM compatibility or the explicit detection configuration fails smoke validation, disable only the Pi route and retain the existing GLM Worker.
- If concurrent Policy update cannot be applied safely, keep the existing concurrency-one Policy. Do not reset or rewrite the queue ledger.
