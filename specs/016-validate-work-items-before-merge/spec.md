# Validate Spec work items before merge

**Status:** Owner-approved
**Date:** 2026-11-03
**Goal:** Prove the full Spec → GitHub Projects Todo → native GH-AW Agent → PR → CI → merge dependency chain with a practical, production-neutral improvement to the Spec review workflow.
**Target:** develop, GitHub-hosted CI only
**Related:** specs/015-spec-task-intake/spec.md

## Problem

Approved Specs now generate task Issues and an immutable native Work Graph, but malformed `tasks.md` is discovered only after the Spec has already merged into `develop`. This interrupts the successful-develop continuation and makes the underlying problem harder to fix. The existing canonical parser in `scripts/ci/spec-task-producer.mjs` already validates the Work Items contract; reuse that same parser before merging a Spec.

## Requirements

1. Expose a deterministic, offline validation CLI for canonical `tasks.md` files. It MUST call the existing `parseTasks` implementation and report invalid files with a nonzero exit code. Do not add a second parser, LLM inference, or a new dependency.
2. Wire pre-merge validation into the existing GitHub Check workflow. Validate changed `tasks.md` files on PRs targeting `develop`; do not validate unrelated legacy Specs lacking a task file. Use the existing repository checkout and Node environment. Reject a malformed Work Items graph before merge.
3. A valid `tasks.md` retains the exact current GH-AW admission behavior after owner approval. Do not relax Spec 015 owner-approval checks, Work Queue limits, Issue provenance, dependency semantics or branch protections.
4. Prove the native task dependency: T002 must not be dispatched until T001's implementation PR has merged and its task Issue is closed as `completed` by the trusted post-merge Check continuation.
5. No additional Work Queue engine, timer, cron, database, server, worker runner, or model call for task parsing. No production deployment.

## Acceptance

- Valid task documents exit zero and report the number of parsed Work Items.
- Invalid task documents (missing Scope, unknown dependency, duplicate ID, cyclic dependency, duplicate Work Items heading) exit nonzero with actionable diagnostics.
- Spec PR Check validates only modified `tasks.md` files and leaves unrelated one-file Specs alone.
- Existing tests and exact-SHA Check gates remain enforced.
- The two auto-generated GitHub Issues appear in Project #2 Todo, the native graph admits T001 before T002, and the original GitHub-hosted GLM Worker produces the corresponding code PRs.
- Both PRs merge to develop with existing required CI; only after T001 merge and successful develop Check does T002 become eligible.

## Exclusions

No changes to production image, VM09, VM13, cn-dev, GLM credentials, queue ledger, native Dispatcher or Policy.
