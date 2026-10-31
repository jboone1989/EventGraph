# Tasks: GitHub Projects + Parallel Single-Profile Workers

**Status:** Owner-directed revision 2026-11-01; implementation starts after the Spec PR merges to `main`.

## A. Spec approval

- [ ] Merge the Spec PR to `main` after its exact-HEAD Check, Docker and independent review pass.
- [ ] Record the merged Spec commit SHA for the implementation PR.

## B. Producer labeling

- [ ] Add `issues: write` to `eventgraph-producer.yml` (no other permission growth).
- [ ] After successful Work submit, run idempotent `gh issue edit <n> --add-label agent-work` in `eventgraph-work-intake.mjs`.
- [ ] Prove ordering: no label before submit success; submit failure leaves the Issue unlabeled; duplicate intake runs stay idempotent (no error, no duplicate label).

## C. Parallelism

- [ ] Set `.github/workflows/aw.json` Work Queue concurrency to 2.
- [ ] Keep the Dispatcher serial (one Claim at a time); per-Work Claim limit stays one.
- [ ] Apply the official administrator-authorized Policy epoch while the queue is quiescent; record the operator evidence in the implementation PR.

## D. Dispatch gate rework

- [ ] Build the unique Work-identity set from active/queued Worker workflow runs ∪ open `agent-work` PRs, deduped by Work ID / Worker run ID markers (a Work with run + PR counts once).
- [ ] Boundaries: `|set|` 0 or 1 → dispatch one Claim; 2 → block; ≥3 → fail closed with report.
- [ ] Fail closed on missing/invalid markers or unmatchable PR↔run identity.
- [ ] Keep the gate workflow serial; at most one Claim per gate run; no longer blocks merely because an `agent-work` PR is open.
- [ ] Focused tests: 0/1/2/3 boundaries; two runs ↔ two PRs; run+PR same Work counted once; invalid marker fail-closed.

## E. Completion rework

- [ ] Match the PR for the exact current `workflow_run.id` via PR-body run-ID markers; never assume a single open `agent-work` PR.
- [ ] Verify run success + markers; dispatch exact-SHA Check only for the matched PR.
- [ ] Add the `pull_request` closed trigger (merged and unmerged); after merge/close, trigger the gate to backfill.
- [ ] Failed Worker run with no PR → settle/release the slot and trigger the gate.
- [ ] Focused tests: two open PRs matched by run ID; no matching PR → fail closed; closed-PR trigger; failed-run path.

## F. Worker prompt / PR body

- [ ] Pass the original Issue number and URL into the Worker assignment.
- [ ] Require PR body to contain `Closes #<Issue number>` + Work ID + Worker Run ID marker; one PR per Work.

## G. ProjectOps workflow

- [ ] Add `.github/workflows/eventgraph-project-ops.md` using `tools.github` toolsets `[default, projects]` and `safe-outputs.update-project`/`create-project`; no custom GraphQL, no custom board.
- [ ] Read real Project fields/options before writing Ready / In Progress / In Review / Done / Blocked.
- [ ] Probe Projects permission safely from GitHub-hosted Actions; on missing scope, skip/fail explicitly naming the single required secret/permission; never output token values; other pipelines unaffected.
- [ ] Native Auto-add (Issues + PRs with `agent-work`) and closed/merged→Done automations: configured automatically when possible, otherwise deliver exact one-time owner UI steps; never claim configured without evidence.

## H. Tests, compile, locks

- [ ] Focused node tests for every changed script (label idempotency, boundaries, run↔PR matching, fail-closed paths).
- [ ] Strict pinned GH-AW v1.0.1 compile for all affected sources; regenerate lock files with the CLI only; never hand-edit locks.
- [ ] Update `.github/workflows/check.yml` compile inputs for any new GH-AW source.

## I. Implementation PR

- [ ] Open the implementation PR to `main` referencing the merged Spec SHA.
- [ ] Merge only after exact-head Check / Docker / independent GLM review; normal squash merge.

## J. Real end-to-end acceptance

- [ ] Submit one real Work each for story-detail-dedup P-4 and FR-011 through the existing Producer; no duplicate Work IDs/PRs; no smoke-Work substitutes.
- [ ] Verify the two real Worker runs overlap in time and produce two independent PRs with correctly matched `Closes #N` + Work ID + Worker Run ID markers.
- [ ] Verify both Issues/PRs join the same EventGraph Project with trackable status; report the exact single owner step if token/Project setup is pending — never claim done without evidence.
- [ ] Record run URLs, PR numbers, queue Results and Project evidence in the tracking Issue.
