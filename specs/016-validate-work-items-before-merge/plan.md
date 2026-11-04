# Plan: pre-merge task validation and native Work Queue acceptance

## Existing implementation to reuse

- `scripts/ci/spec-task-producer.mjs`: canonical parser and dependency graph validation.
- `scripts/ci/spec-task-producer.test.mjs`: focused Node tests.
- `.github/workflows/check.yml`: existing Spec gate and Node test job.
- `resume_native_queue`: exact-SHA validated post-merge continuation.
- GitHub Projects #2, GH-AW v1.0.1 native Work Queue and default deployed Worker on `main`.

## Implementation

1. Add a minimal `--validate-tasks <file>` command to the existing Producer module or a thin CLI that imports `parseTasks`. Validate only; never call GitHub API or mutate Queue state. Add CLI tests including invalid formats.
2. Extend the existing `check` job to discover changed canonical `specs/<feature>/tasks.md` on PRs, then run the CLI for each changed task file. Use existing checkout credentials and GitHub event diff metadata; do not create a new separate workflow. Ensure checks work for new Spec files and do not block unrelated legacy Spec PRs.
3. Run Node tests, GH-AW compile checks where relevant, Check/Docker/E2E gates as currently configured.
4. Use the accepted Spec as a two-task live end-to-end check: verify task Issues and Project Todo auto-add, Work admission with native dependency, Agent PR creation, exact checks, merge and Issue completion. Record the real links; do not claim completion from synthetic unit tests alone.

## Constraints

- T001 and T002 are intentionally sequential so that the existing native external `issue completed` dependency is tested.
- Each task has its own focused PR, no direct push to develop.
- Implementation reuses present code; no extra orchestration service or additional platform resource.
