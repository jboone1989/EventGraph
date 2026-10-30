# Tasks: GitHub Projects and Multi-Engine GH-AW Workers

**Status:** Draft; do not start implementation until the Spec is approved and merged.

## A. Owner approval and Project setup

- [ ] Review and approve `spec.md`; merge the Spec PR to `develop`.
- [ ] Create a personal GitHub Project named **EventGraph Delivery** under `jboone1989`.
- [ ] Create a Board view grouped by Status and a Table view exposing Status, Assignees, Labels, Repository and linked PRs.
- [ ] Bulk-add Issue #176 and all existing open EventGraph Issues/PRs. Auto-add does not backfill existing items.
- [ ] Enable the built-in Auto-add workflow for repository `jboone1989/EventGraph` with filter `is:open`.
- [ ] Verify the built-in workflows set closed Issues/PRs and merged PRs to Done.
- [ ] Keep priority and Worker selection visible through repository labels; do not create custom fields or an API synchronizer unless later evidence requires them.

## B. Spec promotion

- [ ] Mirror the exact approved Spec files to `main` in a docs-only PR.
- [ ] Record the exact main Spec commit SHA for the control-plane implementation PR.
- [ ] Do not merge `develop` wholesale into `main`.

## C. Add the Copilot Worker profile

- [ ] Add `.github/workflows/eventgraph-copilot-worker.md` with GH-AW `engine: copilot`.
- [ ] Require the native `work_queue_assignment` and original Claim handle.
- [ ] Reuse the existing immutable Spec, repository resource-scope and one-PR safe-output contract.
- [ ] Preserve read-only model-job permissions; repository writes remain in GH-AW safe outputs.
- [ ] Include the same exact Work ID/Worker run ID marker in the PR body.
- [ ] Configure only the documented Copilot authentication mode available to this account.
- [ ] Compile and publish the generated lock file using pinned GH-AW v1.0.1; never hand-edit the lock.

## D. Route Work to a Worker profile

- [ ] Update the Dispatcher allowlist to include `eventgraph-worker` and `eventgraph-copilot-worker`.
- [ ] Update `eventgraph-work-intake.mjs` to select the profile from `agent-worker:glm` / `agent-worker:copilot` labels.
- [ ] Preserve owner-only `agent-ready` admission and stable Issue-derived idempotency.
- [ ] Reject both Worker labels being present; verify that Worker labels alone cannot submit Work.
- [ ] Add focused standalone tests for default GLM, explicit GLM, Copilot, ambiguous labels, unauthorized actor, duplicate events and invalid Spec.
- [ ] Compile all changed GH-AW sources and locks together in strict mode.

## E. Hosted validation and parallelism

- [ ] Run a real no-write Work through the GLM Worker and inspect the native queue Result.
- [ ] Run a real no-write Work through the Copilot Worker; if authentication or entitlement fails, disable the Copilot route and retain GLM.
- [ ] Confirm current queue Work, Claims, reservations and delivery barriers are settled before Policy change.
- [ ] Set `aw.json` concurrency to two and apply the official administrator-authorized Policy epoch update only while the queue is quiescent.
- [ ] Submit two independent authorized Work items and verify two simultaneous Claims with the correct Worker profile on each.
- [ ] Run one low-risk owner-authorized code Work through each enabled profile.
- [ ] Verify exact PR markers, pinned Spec, current-head Check/Docker/E2E, independent GLM review, normal squash merge and post-merge queue continuation.
- [ ] Confirm no Agent Worker code executes on cn-dev, VM13 or VM09 and no Pi/timer/host dispatcher is used.

## F. Final acceptance

- [ ] Verify the Project Auto-add workflow adds a newly created open Issue and PR after activation.
- [ ] Verify a merged PR is marked Done by the Project's built-in workflow.
- [ ] Verify Projects is only the planning view and the native GH-AW ledger remains the sole execution authority.
- [ ] Record the exact Project URL, approved Spec SHA, PRs, commits, workflow runs and queue Result evidence in Issue #176.
