# Tasks: Multi-Engine GH-AW Workers

**Status:** Owner-approved; implementation starts after this Spec PR merges to develop.

## A. Owner approval

- [ ] Merge the owner-approved Spec PR to `develop` after its exact-HEAD Check and independent GLM review pass.

## B. Extend the existing main-branch review gate

- [ ] Create a small tracked task in `jboone1989/livingruntime-remote` with acceptance criteria, following that repository's Spec/Issue policy.
- [ ] Update the existing reusable `eventgraph-glm-review.yml` to resolve and validate exact-head PRs targeting both `develop` and `main`; retain the same GLM prompt, checklist, schema and independent verification.
- [ ] Add `claude-review` to the EventGraph `main` ruleset alongside `check` and `docker`; do not remove or weaken existing rules.
- [ ] Verify a docs-only PR targeting `main` receives `claude-review=success` on its exact HEAD.

## C. Spec promotion

- [ ] Mirror the exact approved Spec files to `main` in a docs-only PR.
- [ ] Record the exact main Spec commit SHA for the control-plane implementation PR.
- [ ] Do not merge `develop` wholesale into `main`.

## D. Add the Pi Worker profile

- [ ] Add `.github/workflows/eventgraph-worker-pi.md` with GH-AW `engine: pi` and `model: anthropic/glm-5.3`.
- [ ] Require the native `work_queue_assignment` and original Claim handle.
- [ ] Reuse the existing immutable Spec, repository resource-scope and one-PR safe-output contract.
- [ ] Preserve read-only model-job permissions; repository writes remain in GH-AW safe outputs.
- [ ] Include the same exact Work ID/Worker run ID marker in the PR body.
- [ ] Reuse `GLM_API_KEY` and `GLM_BASE_URL` from the existing Worker; retain the existing `models.providers.anthropic.models.glm-5.3` metadata and do not add Copilot or OpenAI API credentials.
- [ ] Configure `safe-outputs.threat-detection.engine` as an object with `id: claude`, `model: glm-5.3`, and explicit `env.ANTHROPIC_BASE_URL` / `env.ANTHROPIC_API_KEY` values; do not rely on Pi's default Copilot detector or cross-engine environment/model-alias inheritance.
- [ ] Compile and publish the generated lock file using pinned GH-AW v1.0.1; never hand-edit the lock.

## E. Route Work to both Worker profiles

- [ ] Update the Dispatcher allowlist to include `eventgraph-worker` and `eventgraph-worker-pi`.
- [ ] Update `eventgraph-work-intake.mjs` to select the profile from `agent-worker:glm` / `agent-worker:pi` labels.
- [ ] Preserve owner-only `agent-ready` admission and stable Issue-derived idempotency.
- [ ] Reject both Worker labels being present; verify that Worker labels alone cannot submit Work.
- [ ] Extend `eventgraph-worker-complete.yml` and `eventgraph-work-queue-guards.mjs` to recognize `EventGraph GH-AW Pi Worker` alongside the existing GLM Worker and reuse the same exact-SHA Check/queue-continuation path.
- [ ] Add focused tests proving both Worker run identities are accepted and unrelated workflow runs are rejected.
- [ ] Add focused intake tests for default GLM, explicit GLM, Pi, ambiguous labels, unauthorized actor, duplicate events, invalid Spec and misordered labels; prove a late Pi label cannot reroute an already-admitted GLM Work with the same Issue request ID.
- [ ] Update `.github/workflows/check.yml` to compile `eventgraph-worker-pi` alongside the existing Worker and Dispatcher with pinned v1.0.1 strict mode; verify the generated lock is committed.

## F. Hosted validation and parallelism

- [ ] Settle the two existing no-write smoke Works and verify the native queue has no unfinished Work, Claims, reservations or delivery barriers.
- [ ] Run a real no-write Work through the GLM Worker and inspect the native queue Result.
- [ ] Run a real no-write Work through the Pi Worker, including its explicit GLM-backed Claude threat-detection job; if either Pi path fails, disable only the Pi route and retain GLM.
- [ ] Only after queue quiescence, set `aw.json` concurrency to two and apply the official administrator-authorized Policy epoch update.
- [ ] Submit two independent no-write Work items before dispatching either, with no open `agent-work` PR, and verify simultaneous Claims with the correct Worker profile on each.
- [ ] Verify code Work remains serialized by the existing dispatch gate; run one low-risk code Work through each enabled profile sequentially, allowing each PR to pass exact-SHA Check/Docker/E2E, independent GLM review and normal squash merge before dispatching the next.
- [ ] Confirm no Agent Worker code executes on cn-dev, VM13 or VM09 and no separate Pi/timer/host dispatcher is used.

## G. Final acceptance

- [ ] Verify Issue #176 remains the only human-maintained backlog and the native GH-AW ledger remains the sole execution authority.
- [ ] Verify both enabled Worker profiles can receive and finish Claims through the same completion pipeline.
- [ ] Record the exact approved Spec SHA, implementation PRs, commits, workflow runs and queue Result evidence in Issue #176.
