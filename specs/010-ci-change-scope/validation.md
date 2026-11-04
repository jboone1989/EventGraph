# CI scope · live validation ledger (2026-10-28)

This is the acceptance record for [Spec 010](./spec.md) and [Issue #176 T15](https://github.com/jboone1989/EventGraph/issues/176). It is a **documentation-only** change, intentionally exercising the real post-merge scope classifier. Do not infer deployment success from a passing PR.

## CI / CD

The [CI / CD section](#ci--cd) exercises GitHub Markdown heading anchors as part of the docs-only validator. The Spec gate, relative links and anchors must still be checked; heavy builds and deployments are not evidence for a documentation-only change.

## Baseline and implementation

- Before selective CI: documentation-only [PR #181](https://github.com/jboone1989/EventGraph/pull/181) merged at `176d88c`; [develop run 40611600417](https://github.com/jboone1989/EventGraph/actions/runs/40611600417) unnecessarily ran Docker, E2E, image publish, VM13 and cn-dev Worker deployment, with the latter timing out. This is the observed pre-fix negative control.
- Approved scope specification: [PR #191](https://github.com/jboone1989/EventGraph/pull/191), merged at `56c76ca`.
- Implementation: [PR #193](https://github.com/jboone1989/EventGraph/pull/193), merged at `1d06804c9f69d95af929b1533270b1c27a8e02a0`. Latest PR-head [Check run 40619106248](https://github.com/jboone1989/EventGraph/actions/runs/40619106248) succeeded; independent Claude review reported 0 blocking findings. Scope logic fails closed for unknown base and `workflow_dispatch`, and preserves code-before-docs publishing.
- Local scope tests before merge: 21/21 passed; `#181` classified docs-only, `#189/#182` code. This is not yet a live post-merge validation.

## Required live acceptance

| Scenario | Required evidence | State |
| --- | --- | --- |
| Documentation-only PR (this PR) | On the latest head: real Spec gate, docs links/anchors, independent Claude; heavy build/test/docker jobs skipped by scope without falsifying required status checks | **Pending**: inspect this PR's Check jobs and reviewer |
| Documentation-only develop merge | Check succeeds, `publish`, VM13 deployment, E2E preview and Worker deployment do **not** execute; no image digest changes | **Pending**: do not mark from PR checks |
| Code-changing PR | Existing Check/Docker/E2E and independent Claude run on latest head | **Pending**: use the next actual code PR (for example [#192](https://github.com/jboone1989/EventGraph/pull/192) or [#194](https://github.com/jboone1989/EventGraph/pull/194)) |
| Code-changing develop merge | Published image digest and VM13 Web/API plus cn-dev Worker revisions match the merged code; actual API/DB/browser verification | **Pending**: release only through normal gated PR |
| A code commit followed by B docs-only (AC-7 A→B) | A must still publish and deploy; B must not publish | **Pending**: inspect A and B push runs, publish and both deploy jobs |
| A code commit followed by C code (AC-7 A→C) | Newer C supersedes A; only C publishes and deploys | **Pending**: inspect both per-SHA push runs and deployment jobs |
| A code → B docs-only → C code (AC-7 A→B→C) | C supersedes A; B never publishes; C publishes and deploys | **Pending**: verify all three push runs and both deploy targets |
| A code running → B code queued → C docs pushed (AC-7 queued-B race) | C must not cancel or replace B's queued code run; B builds, publishes and deploys when eligible | **Pending**: verify B's run ID, concurrency group, image and both deployment jobs |
| Base-branch scope detector (AC-3) | CI runs the detector from the trusted base branch when present, falling back to PR copy only on first installation | **Local tests passed**; inspect live checkout/detector steps before closure |
| Failed/unknown diff classification | Full checks and deploy eligibility; never misclassify code as docs-only | **Local tests passed**, live manual-dispatch evidence pending |

## Evidence policy

A skipped job may satisfy GitHub branch protection, but is **not** evidence that the skipped test actually ran. Never mark T15 complete until the above live post-merge controls have been observed. The scope change must not modify VM09 production, bypass required Claude review, or weaken Spec-first validation.
