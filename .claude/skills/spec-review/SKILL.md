---
name: spec-review
description: Independently review an EventGraph pull request against a previously approved Spec Kit specification or Issue, verifying implementation, scope, tests and deployment evidence.
---

# EventGraph Spec-based PR review

Read `CLAUDE.md` / `AGENTS.md`, `docs/spec-review.md`, the PR diff, and its acceptance matrix.

1. Identify the **approved** spec URL, path and commit SHA recorded in the PR, or the explicitly approved Issue acceptance criteria. Read the fixed source. If evidence of approval is missing, call it `UNVERIFIED`; don't infer approval from a newly added `spec.md` in the same PR.
2. Compare `spec.md` ↔ `plan.md` ↔ `tasks.md` when present, then compare requirements to actual changed code. Review Search Before Build references (existing EventGraph, AIHOT upstream, official docs) and look for unnecessary new machinery.
3. For every acceptance criterion, name the implementation file, regression test and observable result. Check missing behavior, scope creep, regressions and private/withdrawn-evidence handling where relevant.
4. Independently confirm test results using actual commands / CI checks when available; distinguish pending, passing, failing and unrun. Do not claim development or production deployment from CI alone.
5. Post one concise review: `PASS`, `CHANGES REQUESTED` or `UNVERIFIED`, followed by blockers, acceptance matrix, and links to the exact evidence. Never merge or deploy unless separately instructed.
