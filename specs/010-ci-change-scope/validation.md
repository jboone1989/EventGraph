# CI change-scope validation ledger

Spec: [010 · selective CI by change scope](spec.md). Tracking: [EventGraph Issue #176](https://github.com/jboone1989/EventGraph/issues/176), task T15.

This document is a **documentation-only acceptance test**, not a claim that the full acceptance suite is finished. The implementation was squash-merged as [PR #193](https://github.com/jboone1989/EventGraph/pull/193) at commit `1d06804c9f69d95af929b1533270b1c27a8e02a0` on 2026-10-28. This file is the first real post-merge documentation-only PR to exercise AC-4 and, after an approved merge, AC-5.

## CI / CD

The [CI / CD section](#ci--cd) also exercises GitHub's punctuation-sensitive Markdown heading anchor behavior. A correct documentation-only run must still perform the Spec gate and relative link/anchor verification, then independently produce the required Claude review while heavy code-only jobs are marked skipped rather than left pending.

## Acceptance evidence to record

- [ ] **AC-4**: real documentation-only pull request; true Spec gate and docs validator succeed; heavy web/backend and E2E/Docker work skipped; required job conclusions and Claude review verified on latest HEAD.
- [ ] **AC-5**: after merge into `develop`, document-only push produces no new image and no VM13/cn-dev Worker deployment, verified from the actual GitHub push run and release digest.
- [ ] **AC-6**: code PR and subsequent code push still execute full checks and real VM13/Worker deployment.
- [ ] **AC-7**: code commit followed by a docs-only commit cannot suppress the pending code release; code followed by later code supersedes the older release. Validate event ordering, not only static tests.

No production VM09 actions or historical backfill are part of this verification.
