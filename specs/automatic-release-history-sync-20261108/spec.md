# Eliminate recurring main / develop release-history divergence

**Status:** Draft
**Type:** CI/release-history correctness
**Owner goal:** After every approved release, main and develop must not diverge solely because the release used a merge commit. Do not repeatedly ask the owner to resolve history-only branch conflicts or launch paid reviews for phantom source deletions.

## Evidence (2026-11-08)
- GitHub compare develop...main: 9 main-only commits, 6 develop-only commits, **zero main-only changed files**.
- PR #497 (develop -> main) cannot satisfy main's up-to-date rule while main release merge ancestry is absent from develop.
- PR #498 (main -> develop) has zero GitHub PR changed files but its one-pass reviewer uses `git diff base_SHA head_SHA` (two endpoints, instead of merge-base..head), falsely reports that approved Worker reconciliation, approved Specs and tests are deleted, and fails `claude-review`.
- The develop auto-merge step always uses `gh pr merge --auto --squash` except literal head branch main or upstream import. A new zero-content history-sync branch would lose its ancestry if squashed.
- PR #499 is a safe history-only merge candidate: first parent develop `8ffb3dd`, second parent main `47cf4c3`, tree **identical** to develop `815332e55e46c791efa6d92d75544812da4827a9`. It is intentionally Draft until the review/merge-method handling is corrected.

## Behavior contract
1. Normal feature PRs still flow feature -> develop; the only allowed main application promotion is same-repository develop -> main. Keep all existing Spec, CI, review, immutable-image and deployment gates.
2. An approved develop -> main merge may create main-only **history**. GitHub Actions shall automatically detect this on a main push and, if main isn't already an ancestor of develop, prepare a content-preserving history-sync PR targeting develop. The history-sync commit has develop as first parent and main as second; its tree is exactly current develop. Never push directly to protected develop, force-push, or create a timer / external controller.
3. Before creating that commit, verify `git diff --quiet $(git merge-base main develop) main`. If main contains any main-only file changes, **fail closed** and report a real change needing review rather than discarding it with an 'ours' merge. Check fresh branch SHAs and do not silently update stale heads. Avoid duplicate sync PRs by deterministic identity or discovery.
4. PR review must inspect GitHub-style `merge-base(base, head)..head` changes, not `base..head` endpoint differences. For a verified history-only PR with zero changed files, skip the model call without claiming to have reviewed any code; machine-check the two parents and exact original develop tree, with a successful explicit review-gate result only if all invariants hold.
5. A verified history-sync PR must be merged through native GitHub **merge commit**, never squash/rebase. Enable `--auto --merge` only after actual required checks and exact-head validation, subject to existing branch rules. No bypass of review/protection; no paid model call for zero-code sync.
6. A history-only sync must not trigger production release. If develop's CI is triggered on merge, classify zero executable file changes and do not build/redeploy an identical application image only for ancestry.
7. After merge, assert `main` is an ancestor of `develop` (until main advances again) and all preexisting develop source/configuration files are unchanged. The next develop -> main release should not need another manual reverse PR.

## Acceptance examples
- Given main has only merge-history changes and develop has new approved Worker changes, when release sync runs, it creates a PR with zero source changes; after checks and merge, develop retains Worker source, Specs and tests unchanged, and main is its ancestor.
- Given main contains a real main-only hotfix, when sync runs, it refuses any 'ours' overwrite and reports actionable failure.
- Given a synthetic divergence where endpoint diff shows deletions but `merge-base..head` is empty, reviewer recognizes no code changed and does not call LLM.
- Given a history-sync PR without two validated parents, or with a changed tree, no automated merge takes place.
- Given a normal feature PR, its normal squash merge, Spec check and code-review behavior are unchanged.

## Implementation boundaries
Reuse GitHub Actions and gh CLI; no new scheduler, database, service or separate agent. Provide focused offline git-history fixtures and CI tests plus a short branch contract in existing CI docs. Implementation must be on a separate PR after this Spec is approved and merged into develop.
