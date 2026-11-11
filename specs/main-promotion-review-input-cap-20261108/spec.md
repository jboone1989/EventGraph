# Keep reviewed develop-to-main promotions from failing at the diff byte cutoff

**Status:** Owner-approved (owner-delegated Spec Review of 646c6ccad1c0e996c74a13dd51a0ddf73a7ad8bf)
**Type:** CI review gate correctness
**Owner goal:** A valid `develop -> main` release PR should not deadlock solely because its accumulated diff is 1% over an arbitrary single-pass input ceiling; preserve independent review and all existing safety gates.

## Evidence (2026-11-08)
- PR #497 is the approved-source `develop -> main` promotion following the history-only merge #503.
- Its current required `check`, `docker`, and `e2e` jobs are green, but the `claude-review` job fails **before invoking its model** at `Prepare bounded one-pass review input`: 151,566 bytes > the existing 150,000-byte guard.
- `develop` is now a descendant of `main`; the failure is a size cap, not an unresolved branch divergence or a reviewer finding.
- A same-repo `develop -> main` promotion cannot be fragmented into cherry-picked unrelated release PRs without breaking the existing exact-develop-history promotion contract.

## Behavior contract
1. Keep all existing Spec gate, independent `claude-review`, `check`, `docker`, `e2e`, release-source equivalence, and GitHub branch-protection requirements unchanged. Do not auto-approve, mark successful without a review, or bypass the reviewer.
2. Increase the **code-review** input size ceiling from 150,000 to **262,144 bytes** for all code-review PRs, including same-repository `develop -> main` promotions. Keep the independent Spec-review input threshold unchanged.
3. The exact three-dot/merge-base review diff must continue to be measured in bytes before submitting it to the reviewer. Fail closed with the measured size and ceiling when it still exceeds 262,144 bytes. Preserve the existing one-pass structured review verdict and fail-closed behavior on model errors.
4. Add a regression test checking the code-review input threshold, the separate unchanged Spec-review threshold, the error on oversize, and the required model-review gate. Avoid adding a controller, timer, alternate reviewer, or unrelated refactor.
5. Once the separately approved Spec is merged and the implementation PR passes its required checks and reviewer, the updated `develop` should refresh PR #497. Do not manually merge #497 if its current required checks remain red. Verify its next current-head review can process the bounded 151,566-byte-plus PR diff and complete with a genuine verdict before production promotion.

## Acceptance examples
- A PR code review of 151,566 bytes does not fail the byte-size guard and proceeds to the actual configured reviewer.
- A code-review diff over 262,144 bytes still fails explicitly rather than truncating or silently passing.
- Spec Review stays at its existing 150,000-byte limit.
- A reviewer API/JSON failure, actual code review finding, or red CI continues to block merge.
- No change to branch policy, deployment targets, source-equivalence checks, or when main releases happen.

## Implementation boundaries
Change the existing check workflow and focused test only. First merge this Spec via the native Spec review flow; open implementation separately with a pinned `Spec: ...@<approved develop commit>` reference.
