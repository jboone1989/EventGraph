# Implementation plan: GitHub Projects + Parallel Single-Profile Workers

**Status:** Owner-approved v3 2026-11-02; ProjectOps retirement is implemented only after this revised Spec merges to `main`.

## 1. Verified repository findings

- GH-AW control plane lives on EventGraph `main`; `develop` is the application development branch and remains intentionally divergent. Do not merge `develop` wholesale into `main`; the application Worker's Check still runs from the `develop` mirror.
- Producer: `.github/workflows/eventgraph-producer.yml` + `scripts/ci/eventgraph-work-intake.mjs` — already validates owner-authored `agent-ready`, pinned approved-Spec SHA and Issue-derived request-id idempotency; currently adds no Issue label; lacks `issues: write`.
- Dispatch gate: `.github/workflows/eventgraph-dispatch-gate.yml` + `scripts/ci/eventgraph-dispatch-gate.mjs` + `scripts/ci/eventgraph-work-queue-guards.mjs` — currently refuses to dispatch while any `agent-work` PR is open (cap effectively one in-flight code Work).
- Completion: `.github/workflows/eventgraph-worker-complete.yml` + `scripts/ci/eventgraph-worker-complete.mjs` — assumes at most one open `agent-work` PR.
- Worker: `.github/workflows/eventgraph-worker.md` (Claude engine, `glm-5.3`, pinned Zhipu endpoint, work-queue assignment, single `create-pull-request` safe output) and `.github/workflows/eventgraph-dispatcher.md`; `.github/workflows/aw.json` sets Work Queue concurrency to 1.
- Queue baseline verified 2026-11-01: no pending Work/Claim/reservation; last Work `ad843119` has Result + Release. The pool may safely move to concurrency 2.
- GH-AW pinned CLI is v1.0.1; compile is strict and generated lock files are produced by the CLI, never hand-edited (`.github/workflows/check.yml`).
- Official GitHub Projects Auto-add/closed/merged automations are native Project settings (UI or GraphQL admin); GH-AW v1.0.1 exposes Project tooling through `tools.github` toolsets and `safe-outputs.update-project`/`create-project`. `GH_AW_GITHUB_TOKEN` is the queue token; nothing proves it carries Projects scope.

## 2. Chosen minimal design

- **Human view:** one EventGraph Project + native Auto-add on the `agent-work` label + native Done automations. No custom board, GH-AW/GLM ProjectOps, or queue→Project status synchronizer.
- **Execution:** unchanged native Work Queue; the only scheduler change is pool concurrency 1 → 2 (config + administrator-authorized Policy epoch).
- **Admission:** Producer labels the Issue `agent-work` only after successful Work submit (idempotent `gh issue edit`), so Auto-add picks up exactly the Issues that actually entered the queue.
- **Concurrency control:** gate computes a unique Work-identity set from active/queued Worker runs ∪ open `agent-work` PRs (deduped by Work ID / Worker run ID markers), allows one Claim when `|set| < 2`, fails closed on unprovable state, stays serial itself.
- **Completion:** exact `workflow_run.id` → PR marker matching (no single-PR assumption), per-PR Check dispatch, slot release/backfill on failed-run-no-PR and on PR close/merge (new `pull_request` closed trigger).
- **Native Projects only (v3):** verified owner Project #2, Auto-add `agent-work` Issues/PRs, initial Todo and closed/merged→Done automations; GH-AW ledger/PRs remain the only source for execution and review detail. ProjectOps run #41325563981 failed without any updates after 10.264106 AIC; delete its GH-AW source/lock, its dispatch call sites and compiler/check references; retire `EVENTGRAPH_PROJECTS_PAT` only after removal.

## 3. Implementation sequence

1. Spec PR (this document set) to `main`; merge only after normal gates (Check / Docker / exact-head independent review).
2. Producer: add `issues: write`; after successful Work submit run idempotent `gh issue edit <n> --add-label agent-work`; focused tests (idempotency, no-label-before-submit, submit-failure path).
3. Parallelism: `.github/workflows/aw.json` → `concurrency: 2`; Dispatcher stays serial; apply the official administrator-authorized Policy epoch while the queue is quiescent (operator step, recorded in the PR).
4. Gate rework: unique-identity set across Worker runs + open `agent-work` PRs; boundary behavior 0/1/2/3; fail-closed on invalid markers; one Claim per gate run; focused tests for 0/1/2/3 boundaries, run↔PR dedup (two runs ↔ two PRs), unmatchable-marker fail-closed.
5. Completion rework: exact `workflow_run.id` marker matching with two open PRs; `pull_request` closed trigger; per-PR Check dispatch; failed-run-no-PR → settle + trigger gate; PR merged/closed → trigger gate; focused tests including no-matching-PR fail-closed.
6. Worker prompt/PR body: pass original Issue number/URL; require `Closes #N` + Work ID + Worker Run ID in the PR body; keep one-PR-per-Work.
7. Native Projects v3: retain already configured Project #2 and GitHub's Auto-add, Item closed and Pull request merged rules. Remove `.github/workflows/eventgraph-project-ops.md` and generated `.lock.yml`, `dispatchProjectOps`, caller invocations and compile/CI references. Do not replace with another model, script, job or GraphQL synchronizer. Preserve `agent-work` labeling. Cleanup unused `EVENTGRAPH_PROJECTS_PAT` secret after retirement.
8. Tests + GH-AW compile: focused node tests for all changed scripts; strict pinned-v1.0.1 compile regenerates all affected lock files via the CLI (never hand-edited); update `check.yml` compile inputs if new GH-AW sources were added.
9. Implementation PR to `main` referencing the merged Spec SHA; merge only after exact-head Check / Docker / independent GLM review; normal squash merge.
10. Real E2E acceptance (§4).

## 4. Real end-to-end acceptance

- Submit one real Work each for story-detail-dedup P-4 (empty-clue card) and FR-011 (new since last visit) through the existing Producer; both Specs are owner-merged on `develop`; never reuse Work IDs and never fake acceptance with smoke Works.
- Verify the two real Worker runs overlap in time and produce two independent PRs whose body markers (`Closes #N`, Work ID, Worker Run ID) each match their own Work/Issue.
- Verify both Issues and PRs land in the same EventGraph Project with trackable status; if token/Project setup requires owner action, report the exact single step — never claim it done without evidence.

## 5. Branch and delivery constraints

- Spec PR and implementation PR both target `main` (control plane lives there). Existing branch protection, Check, Docker, exact-head independent GLM review and squash-merge rules remain.
- Do not touch production VM09; no Worker or test code executes on cn-dev, VM13 or VM09; no deploy.
- Keep the existing Work Queue ledger untouched except through the official Policy epoch command.

## 6. Rejected alternatives

| Alternative | Decision |
|---|---|
| Pi second engine (v1 plan) | Superseded by owner decision 2026-11-01; single profile + horizontal concurrency instead. |
| Custom Project board / hand-written GraphQL | Rejected; native Auto-add + Done automations cover the reduced Project view. |
| Mirror full queue state into Project fields | Rejected; Project is a view, the Work Queue ledger is the only execution authority. |
| Gate dispatching multiple Claims per run | Rejected; gate stays serial, one Claim per invocation — parallelism comes from the pool and repeated gate runs. |
| Assume `GH_AW_GITHUB_TOKEN` has Projects scope | Rejected; probe safely and fail/skip explicitly with the single required permission named. |
| Merge `develop` into `main` to ship control-plane changes | Rejected; branches are intentionally divergent; isolated `main` PRs only. |

## 7. Owner-approved v3 change (2026-11-02)

- **Source:** owner confirmation in the ChatGPT EventGraph ProjectOps conversation following the failed [run #41325563981](https://github.com/jboone1989/EventGraph/actions/runs/41325563981) (assistant transcription; not a GitHub-authored owner approval). The v3 decision is to remove paid ProjectOps and use the existing native GitHub Project workflows.
- **Sequence:** this document/Spec PR merges first; then implementation [#285](https://github.com/jboone1989/EventGraph/pull/285) updates to the new approved SHA and passes fresh CI/review before normal merge.
- **Non-goals:** queue grant changes, paid Worker retries, production deployment, manual mass status edits, and any custom Project synchronizer.\n