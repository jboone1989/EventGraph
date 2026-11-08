# Work items — post-bootstrap CI repair regression and queue continuation

## One-time control-plane bootstrap (not a native Work)

**Prerequisite (not T000):** After this Spec has passed independent review and merged to develop, install the GH-AW repair entry through one normal, non-`agent-work` feature PR, with the official GH-AW compiled lock, usual Check/Docker/E2E/independent reviewer and native develop merge. Promote its workflow to GitHub's default branch via the existing guarded `develop -> main` Merge Commit release. With the GH-AW entry available, recover the historical #501 failure on its **existing PR branch** and verify real current-head CI / reviewer / auto-merge / VM13 preview. None of these actions can be delegated to the queued Worker while #501 occupies the single `agent-work` PR slot; do not create a duplicate or direct-merge #501.

## Work Items

### T001 — Verify and extend post-bootstrap same-PR CI repair regression coverage

**Scope:** After the one-time bootstrap and original #501 auto-merge have released the serial Agent PR slot, use the existing GH-AW native Work Queue to add missing focused regression tests and accurate operator diagnostics in the already installed repair lifecycle. Do not reimplement the bootstrap, rewrite #501 business code, alter CI gates or create new queues. Preserve the fixed approved Spec/Issue scope.

**Depends on:** none

**Acceptance:**

- Prove the repair event gate recognizes a failed whole Check workflow for Typecheck-only, Docker-only, E2E-only and independently reviewed actionable code defects, not merely the `check` job.
- Ensure runner/container registry/model credential/quota/provider failures produce a visible infrastructure takeover reason, without dispatching blind business-code repair.
- Test original PR/Issue/Task/Spec/current-HEAD authorization, same-repo branch-only safe update, idempotent repeated events, stale SHA, fork, Draft, no label, two-attempt bound, protected files and actual fresh Check triggering.
- Preserve the single open `agent-work` PR gate and confirm native queue continuation can take original approved tasks #477 and #490 after #501 merges, only if native eligibility is met.
- Use existing GitHub-native workflow/official GH-AW safe outputs, and verify normal Check/Docker/E2E/independent Review and native develop auto-merge; no extra queue, runner, timer or direct production action.
- Do not auto-merge #482 Draft or erase historical articles while attempting source deletion; that separate product decision stays outside this Work.
