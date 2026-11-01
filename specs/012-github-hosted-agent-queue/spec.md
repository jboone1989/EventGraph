# GitHub-hosted autonomous development queue

**Status:** Draft until this PR has passed independent review and is merged.  
**Date:** 2026-10-30  
**Target repository:** `jboone1989/EventGraph`  
**Target development branch:** `develop`  
**Runtime/control-plane branch:** `main`

## 1. Problem

Development work currently depends on a person repeatedly prompting an agent to continue. A persistent Claude Code session and a host timer do not provide a durable, verifiable task lifecycle. A second hand-built queue would duplicate GitHub's task, workflow, and history capabilities.

The development workflow must be driven by GitHub events and durable GitHub state. It must continue without a ChatGPT conversation remaining open and without code execution on cn-dev, VM13, VM09, or another user-managed host.

## 2. Owner-approved scope

The owner approved the direction in the 2026-10-30 conversation with **“做吧”**, after specifying:

- use GitHub-hosted execution rather than cn-dev;
- prefer existing GitHub capabilities instead of building a parallel scheduler;
- do not retain the previous Pi/systemd-timer/tmux scheduling approach.

This is a development-automation control plane only. It does not replace EventGraph's application runtime queue (PostgreSQL/pg-boss).

## 3. User-visible behavior

1. A repository owner adds the `agent-ready` label to an eligible GitHub Issue. The Issue body must contain a testable task description and acceptance criteria, a pinned Spec reference in the exact form `Spec: specs/<feature>/spec.md@<40-character-commit-sha>`, and the URL of the Spec PR. The Producer verifies that the referenced Spec PR was merged by repository owner `jboone1989` into `develop`, that the pinned Spec commit is an ancestor of current `develop`, and that the Spec file at that commit is unchanged on `develop`. The owner-authored `agent-ready` label event is the task-specific authorization; other actors cannot admit Work.
2. Intake is a deterministic GitHub Actions workflow, not an LLM agent. It validates the owner label event and Issue metadata, builds the native Work JSON, and calls the pinned GH-AW CLI `gh aw work-queue --repo jboone1989/EventGraph submit-work --file <work.json> --worker-profile eventgraph-worker --request-id issue-<number>`. The stable request ID makes duplicate label deliveries idempotent. After successful submission, it invokes `eventgraph-dispatch-gate.yml` on `main` via `workflow_dispatch` once. The gate performs the open-PR preflight and then invokes the native Dispatcher CLI. No custom queue storage or model call is used for intake.
3. The native Dispatcher is a very small GH-AW workflow. It calls `work_queue_dispatch_next` exactly once, requesting at most one Claim and one dispatch. It does not choose a Work ID or worker profile; the native scheduler selects the eligible Work and its approved worker profile. A separate deterministic `eventgraph-dispatch-gate.yml` wrapper checks that no open `agent-work` PR targets `develop` before launching the Dispatcher; it serializes gate runs and invokes `gh aw work-queue --repo jboone1989/EventGraph dispatch eventgraph-dispatcher --wait`. The CLI's `--wait` waits for the Dispatcher workflow only, not for Worker completion; subsequent dispatches are event-driven as specified below.
4. A GH-AW Worker runs on a GitHub-hosted `ubuntu-latest` runner, checks out EventGraph `develop`, verifies the immutable approved Spec, researches existing code/upstream/official interfaces, implements the task, runs relevant tests, and proposes one non-draft PR targeting `develop`, using an `agent/*` branch and the `agent-work` label.
5. The Worker has no direct GitHub write permissions. PR creation and Claim completion use GH-AW's claim-scoped safe-output and native Work Queue mechanisms. Every code Work carries a closed version-1 `effect_contract` and version-1 `resource_scope`. The code Work contract is exactly one repository-scoped `create_pull_request` output with `min: 1` and `max: 1`; its resource scope is the canonical `github.com/jboone1989/EventGraph` repository and repository ID `1416699488`. The Worker PR body includes a machine-readable marker containing the immutable Work ID and originating GH-AW Worker run ID. No other agent-authored write is authorized.
6. A deterministic default-branch `worker-complete` workflow listens for completion of the exact published GH-AW Worker workflow in this repository. If a successful Worker run created exactly one open, non-draft `agent-work` PR targeting `develop` whose marker matches that Worker run ID, it reads the live PR head SHA and dispatches Check on that PR branch with `expected_sha` set to that exact SHA. If no matching PR exists and no open `agent-work` PR exists, it invokes `eventgraph-dispatch-gate.yml` once; the queue decides whether a no-write Work or bounded retry is eligible. If any open `agent-work` PR exists without a matching successful Worker marker, the handler blocks further dispatch and surfaces manual recovery rather than creating duplicate work. The helper is deterministic GitHub Actions glue, not a scheduler or LLM agent.
7. The dispatched Check verifies `expected_sha == github.sha`, resolves exactly one current open same-repository PR at that SHA targeting `develop`, and runs Check, E2E and Docker. The existing independent R01–R18 reviewer then reviews that exact SHA. The default-branch `claude-pr-dispatch.yml` forwards completed Check runs for both `pull_request` and validated `workflow_dispatch` events to the central reusable reviewer; when GitHub supplies no PR association for `workflow_dispatch`, the central reviewer resolves the unique live PR by the exact Check SHA. The central reviewer accepts `workflow_dispatch` only after the same exact-SHA/live-PR checks. A stale Check or review cannot authorize a newer SHA.
8. Extend the default-branch `claude-pr-dispatch.yml` with a trusted merge job; the current file only forwards completed Check runs to the central reusable reviewer and does not merge PRs. The forwarding job must include successful `workflow_dispatch` Check runs (not only `pull_request` runs), and the central reviewer must resolve the unique live PR by exact Check SHA when the workflow-run payload has no PR association. The new dependent merge job revalidates the original Check run ID, exact current PR HEAD, open/non-draft state, `develop` base, same-repository head, `agent-work` label, required Check job, successful E2E and Docker jobs for code changes (or explicitly skipped E2E and Docker only when `changes.docs_only == true`), and successful `claude-review` status for that exact SHA. It then requests a normal squash merge with no `--admin`; GitHub branch protection remains authoritative. If this merge uses `GITHUB_TOKEN`, the same trusted workflow explicitly dispatches Check on `develop` with the exact merge commit SHA as `expected_sha`. Check fails closed if the selected `develop` ref no longer resolves to that SHA. The dispatched Check reruns Check and E2E and re-enters the existing develop `publish` path for that exact SHA; existing VM13 preview and cn-dev worker deployment jobs remain behind their existing `EVENTGRAPH_DEV_AUTO_DEPLOY` gate and run only after successful publish. These are existing application-delivery jobs, not agent execution: GH-AW Workers never run on those hosts.
9. A `resume_queue` job in the existing Check workflow runs with `if: always()` for `develop` push and validated `workflow_dispatch` runs. It requires Check success and accepts either (a) a docs-only run where E2E and publish are both explicitly skipped, or (b) a code run where E2E and publish both succeeded. It then confirms the same SHA is still the current `develop` head and no open `agent-work` PR exists, and invokes `eventgraph-dispatch-gate.yml` via `workflow_dispatch` once. The gate performs the open-PR preflight and invokes the native Dispatcher CLI only when no code PR is open. This deliberately handles ordinary docs-only Spec merges: a skipped E2E/publish job must not silently suppress queue continuation. The job does not wait for independent preview/deployment jobs.
10. Queue progression is event-driven: Issue admission submits Work and invokes the dispatch gate; Worker completion invokes the gate when no code PR is open; successful PR merge and develop Check/publish invokes the gate again. The gate has a GitHub Actions concurrency group with `cancel-in-progress: false`; the GH-AW Dispatcher has its own separate concurrency group; and the native Work Queue allows two active Claims per pool under approved Spec 013 v2. For the owner-approved 2026-11-01 limited validation, retry is bounded to `max_attempts: 2` (initial attempt plus at most one retry), `backoff_seconds: 1`. No retry is authorized once the 120 AIC combined acceptance budget for Issues #276 and #277 is exhausted. No systemd timer, Linux cron, scheduled polling loop, tmux session, or persistent agent process is used. A manual `workflow_dispatch` recovery entry point is allowed.
11. The model ID and key remain configuration. Use GLM-5.3 initially, with `GLM_WORKER_MODEL` falling back to `GLM_REVIEW_MODEL` and then `glm-5.3`. **Owner-approved recovery amendment (2026-10-31):** the GH-AW Dispatcher and Worker compilation inputs pin `ANTHROPIC_BASE_URL` to `https://open.bigmodel.cn/api/anthropic`. These compiled GH-AW workflows no longer read `vars.GLM_BASE_URL`; changing their upstream requires updating the reviewed Markdown inputs and regenerating locks with the official pinned compiler. GH-AW v1.0.1 otherwise treats the fallback expression suffix as part of the proxy base path, and strict mode forbids the tested runtime argument override. Keep strict mode, firewall, API proxy and credential isolation enabled. The separate central independent reviewer retains its existing `GLM_BASE_URL` configuration. The Worker receives `secrets.GLM_API_KEY` only through the GH-AW Claude engine's documented engine-specific secret binding, never through workflow-level `env` or model-visible prompt text. Changing provider credentials or model ID must not require rewriting queue or Worker logic. The EventGraph default-branch `claude-pr-dispatch.yml` already forwards `GLM_API_KEY` to the central reviewer. Hosted run [#41010390636](https://github.com/jboone1989/EventGraph/actions/runs/41010390636) completed the configured-key check and official Claude Code Action with GLM successfully; this proves the central reviewer key and endpoint work, but not yet the separate GH-AW Worker engine binding.
12. Bound every agentic run by role. The deterministic Producer and event helpers use no model. The Dispatcher has `timeout-minutes: 5`, `jobs.agent.timeout-minutes: 5`, `safe-outputs.timeout-minutes: 2`, `max-turns: 3`, and `max-ai-credits: 5`. Each code Worker has `timeout-minutes: 30`, `jobs.agent.timeout-minutes: 30`, `safe-outputs.timeout-minutes: 10`, `max-turns: 40`, and temporarily `max-ai-credits: 60` under the 2026-11-01 owner approval for the two-task acceptance run. Do not disable the credit guardrail. GH-AW AIC is a best-effort estimate, not an exact provider invoice cap; the pinned GLM-5.3 model pricing must be present in the compiled firewall configuration or explicitly configured from the current official Zhipu pricing. If the compiler cannot account for the selected model's pricing, normal intake remains disabled. Report actual token/AIC usage from GH-AW run records and reconcile it with provider billing. Exceeding a turn, credit, or time limit fails the Work visibly; it is not silently retried as success.

### Canonical Work payload contracts

The code Work's immutable payload must use the v1.0.1 field shapes below (task text and Issue/Spec metadata are additional ordinary Work fields):

```json
{
  "task": "Implement the pinned, owner-approved Issue against the pinned Spec.",
  "effect_contract": {
    "version": 1,
    "outputs": [
      { "type": "create_pull_request", "min": 1, "max": 1 }
    ]
  },
  "resource_scope": {
    "version": 1,
    "resources": [
      {
        "host": "github.com",
        "repository": "jboone1989/EventGraph",
        "repository_id": "1416699488"
      }
    ]
  }
}
```

The accepted `effect_contract` is a closed union of exactly two forms:

- No resource effects: `{"kind":"none"}`. This exact form has no `version` or `outputs` fields. A no-write smoke Work omits `resource_scope`.
- Version 1 effects: `{"version":1,"outputs":[...]}`, with only the documented v1 fields. A Work declaring resource effects must also carry a version-1 `resource_scope` with the exact allowed resources.

No extra fields, aliases, wildcards, or mutable post-admission edits are allowed. The native Work Queue validates the contract and checks every delivered resource against the immutable Work scope and installed worker profile.

A no-write smoke Work therefore has this payload shape and no resource scope:

```json
{
  "task": "Verify that a GitHub-hosted Worker can claim, execute and finish a no-write Work.",
  "effect_contract": { "kind": "none" }
}
```

## 4. Platform and branch constraints

- Pin GitHub Agentic Workflows to immutable, verified `v1.0.1` release commit `0627fdb`. Use its native Git-backed Work Queue; do not hand-implement queue storage, fairness, Claims, retry state, or task dependency state. The native queue ledger is `work-queue.jsonl` on the dedicated `work-queue` branch. The first accepted submission installs Policy and Work together; Issues are projections, not queue storage. The v1.0.1 operator CLI is documented as experimental, so the hosted smoke test below is a mandatory release gate.
- All agent and framework jobs use GitHub-hosted runners. No self-hosted runner or SSH hop is part of the development execution path.
- EventGraph's default branch is `main`; normal development targets `develop`. The current branch comparison is `develop` 170 commits ahead of `main` and `main` 5 commits ahead of `develop` (2026-10-30). A full develop-to-main promotion would include 170 unrelated commits and is expressly prohibited for this feature. Do not change the default branch, force-push, or promote application code as a side effect.
- GH-AW source Markdown and generated `.lock.yml` files must be compiled together by the pinned official CLI in strict mode and committed together. Generated lock files must never be hand-authored.
- Because GH-AW workflow sources must exist on the repository default branch, activate the control plane through isolated, reviewed PRs rather than a full branch promotion. After this Spec is reviewed and merged to `develop`, use this sequence:
  1. Extend the central reviewer to accept exact, live PRs targeting either `develop` or `main`, and compare against the actual PR base ref. PR #102 in `jboone1989/livingruntime-remote` has already been squash-merged as `ad10e27568d092fcadc285a5b03c08fc6be0efc1`; it adds successful `workflow_dispatch` Check support while retaining exact-SHA validation. A follow-up central-reviewer PR is still required for base-`main` support.
  2. Create a docs-only Spec mirror PR to `main` containing only `specs/012-github-hosted-agent-queue/spec.md` and the superseded Pi Spec notice in `specs/pi-auto-repair/spec.md`. The file contents must match the reviewed `develop` versions. This creates a distinct immutable Spec SHA on `main`; it must not include application code.
  3. Create a main-only Spec-gate bootstrap PR based on current `main`. It contains exactly the first-install allowlist already enforced by `scripts/ci/check-spec.mjs`: `.github/pull_request_template.md`, `.github/workflows/check.yml`, `scripts/ci/check-spec.mjs`, and `scripts/ci/check-spec.test.mjs`. It must not include the compile workflow, dispatch gate, merge job, GH-AW sources, or application source. Because the PR's Check workflow is loaded from its base branch, the new Spec-gate job will not run during this first-install PR; the central reviewer runs the already-merged trusted Spec-gate script from `develop` against this bootstrap PR's base SHA, head SHA and body. After merge, the main Check workflow enforces the Spec gate on future main PRs.
  4. After the bootstrap PR merges, create one main-only GH-AW control-plane PR based on updated `main`. It contains the deterministic GH-AW compile workflow, `eventgraph-dispatch-gate.yml`, the trusted exact-SHA merge job addition to `claude-pr-dispatch.yml`, the compiled GH-AW Worker/Dispatcher/Producer Markdown sources and CLI-generated lock files, `.github/workflows/aw.json`, and the deterministic Issue-intake and `worker-complete` workflows. Compile all GH-AW sources and lock files together with the pinned official CLI in strict mode; never hand-author locks. Pin this PR to the mirrored Spec SHA on `main`, and require the main Check/Spec gate plus central review. It contains no application feature code or unrelated `develop` commits.
  5. Create a separate develop-only CI PR based on current `develop`, pinned to the Spec SHA on `develop`. It updates the develop Check workflow for exact-SHA `workflow_dispatch`, Docker on `agent/*`, post-merge publish re-entry, docs-only-aware `resume_queue`, and synchronizes the stale develop `claude-pr-dispatch.yml` copy. It contains no application feature work.
  6. Keep normal intake disabled until the central reviewer extension, Spec mirror, main Spec-gate bootstrap PR, main GH-AW control-plane PR, and develop-only CI PR are merged and the hosted smoke tests pass. No full `develop`→`main` merge is part of this rollout.
- The EventGraph default-branch `main` copy of `.github/workflows/claude-pr-dispatch.yml` (blob `3c9afe1c37e4895f731a0aecc050a3d857b180c2`) currently forwards completed Check runs to the central reusable reviewer and passes `secrets.GLM_API_KEY`; it has no merge job. Add the trusted exact-SHA `agent-work` merge job and ensure the forwarding path includes successful `workflow_dispatch` Check runs as well as `pull_request` Check runs. The central reusable reviewer must resolve the unique PR from the exact Check SHA when `workflow_dispatch` has no PR association. The develop copy is stale at blob `90cdf38df8ec693977ccc809add709de355c05e4`; synchronize it in the develop-only CI PR.
- Extend both `main` and `develop` copies of EventGraph `.github/workflows/check.yml` with the optional `expected_sha` input and exact-SHA guard. The `develop` copy must run Docker for `workflow_dispatch` refs under `agent/*` (while retaining the existing upstream-bot branch behavior); the normal `pull_request` Docker path and docs-only optimization remain unchanged. Widen develop `publish` and existing development deployment job conditions only for the exact, validated `workflow_dispatch` path on `develop`, preserving existing push behavior and deployment flags.
- Add the `resume_queue` job to the develop Check workflow with `if: always()` and explicit result handling: accept skipped E2E/publish only when `changes.docs_only == true`; otherwise require both to succeed. It also requires Check success, current develop HEAD equal to the run SHA, and no open `agent-work` PR. This is required because normal docs-only Spec merges skip E2E and publish.
- Add a deterministic default-branch `eventgraph-dispatch-gate.yml` workflow. It serializes gate runs, checks that zero open `agent-work` PRs target `develop`, and only then invokes the official GH-AW Dispatcher CLI. Add a separate deterministic `worker-complete` workflow triggered by completion of the exact GH-AW Worker workflow. It verifies the Work ID/Worker run ID PR marker and dispatches Check on the live PR branch with `expected_sha`; when no PR exists and no unmatched open `agent-work` PR exists, it invokes the dispatch gate. The GH-AW Dispatcher itself has a separate serialized concurrency group.
- Extend the central reusable reviewer `jboone1989/livingruntime-remote/.github/workflows/eventgraph-glm-review.yml` to accept `workflow_dispatch` only after it independently verifies the source Check run is completed/successful and its SHA is the exact live HEAD of one open, non-draft, same-repository PR targeting `develop`. For the isolated main PRs above, extend the accepted base set to `develop` and `main`, fetch the actual PR base ref for the diff, and run the Spec gate against main-targeting implementation PRs. Preserve exact-SHA and stale-head guards. Do not let the main merge job auto-merge main PRs until the normal main branch-protection checks and Spec gate are green.
- The main Check workflow does not currently contain the Spec gate. The main Spec-gate bootstrap PR adds the existing `scripts/ci/check-spec.mjs` and its tests from `develop`, and wires the main Check workflow to execute the gate for future main PRs. Because a PR's workflow definition is loaded from its base branch, the first bootstrap PR's new Check job will not run during that same PR; the central reviewer must execute the already-merged trusted `check-spec.mjs` from `develop` against the bootstrap PR's base SHA, head SHA and PR body, never execute the candidate PR's copy. Its changed-file set must remain within the bootstrap allowlist in the script. The Spec mirror PR is docs-only and is reviewed separately.
- The GH-AW Worker's `Spec:` pin in each Work/PR targeting `develop` is the exact `develop` Spec SHA. The main-only GH-AW control-plane PR has its own PR-level `Spec:` pin to the identical reviewed Spec content mirrored on `main`; these are branch-specific commit SHAs, not interchangeable.
- The existing Check workflow's post-merge release re-entry must reject a missing/mismatched `expected_sha`. The queue-resume job must not dispatch if the develop ref moved after the Check run.
- GitHub suppresses most follow-on workflow events created by `GITHUB_TOKEN`, with documented exceptions such as `workflow_dispatch`. The design therefore explicitly dispatches Check after a token-created PR and after a token-created merge; it does not assume a `pull_request` or `push` event will fire.

## 5. Acceptance criteria

### A. Queue and dispatch

- [ ] GH-AW source and lock files compile with pinned GH-AW v1.0.1 in strict mode.
- [ ] The deterministic Producer uses the official CLI and no model call; the first accepted submission initializes the native Git-backed Work Queue and Policy on `work-queue`.
- [ ] Producer submission uses a stable Issue-derived request ID; duplicate label events do not create duplicate Work.
- [ ] The deterministic `eventgraph-dispatch-gate.yml` invokes the official `gh aw work-queue --repo jboone1989/EventGraph dispatch eventgraph-dispatcher --wait` command; Producer, worker-complete and resume_queue invoke this gate rather than implementing or selecting Work themselves.
- [ ] The Dispatcher calls native `work_queue_dispatch_next` once and receives at most one Claim; the native scheduler, not the model, selects Work and worker profile.
- [ ] `.github/workflows/aw.json` sets native Work Queue concurrency to two active Claims per pool and, for the owner-approved temporary acceptance, bounded retry (`max_attempts: 2`, `backoff_seconds: 1`); Dispatcher workflow concurrency prevents overlapping dispatch runs.
- [ ] Every code Work has the closed version-1 `effect_contract` and immutable version-1 `resource_scope` described above. A no-write smoke Work uses exactly `{"kind":"none"}` and omits `resource_scope`.
- [ ] A no-write Worker completion automatically dispatches the next Dispatcher; a second synthetic Work is admitted and dispatched without a user prompt or external timer.

### B. Real development delivery

- [ ] An Issue is admitted only after the repository owner adds `agent-ready`, and its pinned Spec PR, immutable Spec SHA, and acceptance criteria validate.
- [ ] The Worker runs only on GitHub-hosted infrastructure and checks out `develop`; no user-managed host is contacted by an agent Worker.
- [ ] The Worker creates one PR to `develop` with the exact develop Spec path/SHA, Spec PR URL, Issue authorization evidence, Work ID and Worker run ID marker in its body.
- [ ] `worker-complete` verifies exactly one matching live PR and dispatches Check on its branch with `expected_sha` equal to the live PR head.
- [ ] That dispatched Check validates `expected_sha`, resolves the exact open PR, runs Docker for `agent/*`, and automatically triggers the central independent reviewer; the review is recorded against the same SHA without a manual prompt.
- [ ] A passing `agent-work` PR is squash-merged by the newly added trusted default-branch merge job only after exact-SHA Check and independent review success, plus successful E2E and Docker for code changes; for docs-only changes, E2E and Docker must be explicitly skipped with `changes.docs_only == true`. The merge never bypasses branch protection.
- [ ] After a `GITHUB_TOKEN` merge, the dispatched develop Check validates `expected_sha`, reruns Check/E2E, and produces a successful immutable `publish` run for the exact merge SHA; existing development deployment jobs run only under their existing flag.
- [ ] For a code change, `resume_queue` dispatches the next Dispatcher only after Check/E2E/publish all succeed for the exact current develop SHA.
- [ ] For a docs-only develop merge, `resume_queue` still dispatches after Check success when E2E and publish are explicitly skipped; the skipped jobs cannot silently strand queued Work.
- [ ] The deterministic dispatch gate refuses to launch another Dispatcher while an `agent-work` PR to `develop` is open; neither worker-complete nor resume_queue bypasses that gate.
- [ ] A manual merge/push to `develop` also resumes the queue through the normal push Check path, including the docs-only path.

### C. Operational behavior

- [ ] No `tasks.json`, `runs.jsonl`, host-side queue, timer, cron, tmux, or long-running agent is required.
- [ ] Queue state, Claims, attempts, delivery and Results can be inspected through the official GH-AW operator CLI and GitHub Actions history.
- [ ] Producer/event helpers use no model. Dispatcher is bounded to 3 turns/5 AIC/5 minutes; each Worker is bounded to 40 turns/60 AIC/30 minutes during the owner-approved temporary acceptance with a 10-minute safe-output limit.
- [ ] GLM-5.3 pricing is recognized/configured in the compiled firewall; if not, intake remains disabled. Actual token/AIC usage is reported and reconciled against provider billing.
- [ ] The EventGraph-hosted central reviewer has proven `GLM_API_KEY` readability and a successful GLM API call (run #41010390636); the GH-AW Worker engine's separate secret binding is verified by the hosted smoke test.
- [ ] Missing credentials, unsupported API compatibility, queue protocol errors, failed checks, failed review, and budget exhaustion are visible as failures/blocked Work; they are never reported as completed.
- [ ] A real hosted smoke test is required before enabling `agent-ready` intake for normal work: two sequential no-write Work items, then one explicitly owner-authorized code Work that creates a PR and completes the full Check/review/merge/publish/resume cycle.

## 6. Out of scope

- EventGraph product features, its PostgreSQL/pg-boss runtime queue, production deployment, and application architecture.
- Reusing Pi, the old Pi auto-repair flow, VM09/VM13/cn-dev execution, systemd timers, cron, or tmux for agent work.
- Full `develop`→`main` promotion, direct pushes to protected branches, or changing EventGraph's default branch.
- Weakening Spec, Check, E2E, Docker, R01–R18 review, or branch-protection gates.

## 7. Research basis

- [GH-AW v1.0.1 immutable release](https://github.com/github/gh-aw/releases/tag/v1.0.1), release commit `0627fdb`; [Work Queue reference](https://github.github.io/gh-aw/reference/work-queue/) and [WorkQueueOps deployment example](https://github.github.io/gh-aw/patterns/workqueue-ops/). The native queue uses the Git-backed `work-queue.jsonl` ledger on `work-queue`; first accepted submission installs Policy and Work together; Issues are projections, not queue storage; Producer/Dispatcher/Worker roles and Claim-scoped safe outputs are native. The operator CLI is documented as experimental. The documented `dispatch --wait` waits for the Dispatcher workflow, not for Worker Results, which is why completion events explicitly request the next dispatch.
- [GH-AW v1.0.1 frontmatter reference](https://github.github.io/gh-aw/reference/frontmatter/) and [cost management](https://github.github.io/gh-aw/reference/cost-management/). `max-turns` bounds model responses/tool calls; `max-ai-credits` is enabled by default and 1 AIC represents USD 0.01, but AIC is best-effort and may differ from provider invoices. Explicit agent, generated-job and safe-output timeouts are supported.
- [GH-AW v1.0.1 Claude engine setup](https://github.github.io/gh-aw/engines/claude/): use the documented Claude engine and engine-specific secret handling; a Claude subscription login is not supported.
- [GitHub Actions workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows): workflow dispatch is explicitly used for follow-on execution where `GITHUB_TOKEN` event suppression would otherwise prevent a workflow from starting; the selected ref is validated by the exact `expected_sha` guard.
- EventGraph default-branch reviewer forwarder: [`.github/workflows/claude-pr-dispatch.yml`](https://github.com/jboone1989/EventGraph/blob/f21c92928c23f7aa9ad96351baba69d32e97b5c9/.github/workflows/claude-pr-dispatch.yml), blob `3c9afe1c37e4895f731a0aecc050a3d857b180c2`. It calls the central reusable reviewer and passes `GLM_API_KEY`, but has no merge job; the implementation must add one. EventGraph's `develop` copy is stale at blob `90cdf38df8ec693977ccc809add709de355c05e4`.
- Central reviewer: `jboone1989/livingruntime-remote/.github/workflows/eventgraph-glm-review.yml`, current blob `eac84bbd1c5bf42bd96b5cd611e7af744f620a2d`. PR #102 merged at `ad10e27568d092fcadc285a5b03c08fc6be0efc1` and extends the preflight to accept successful `workflow_dispatch` Check runs while preserving exact-SHA/live-PR checks. It still restricts PR base to `develop`; the base-`main` and dynamic-base extension remains a required follow-up.
- EventGraph branch comparison on 2026-10-30: `develop` head `f2150067ed32e39ca8310bff9916c3c1d8b464c6` is 170 commits ahead of `main` head `f21c92928c23f7aa9ad96351baba69d32e97b5c9`, while `main` is 5 commits ahead. This is the evidence for isolated main PRs rather than full branch promotion.
- EventGraph's existing develop `.github/workflows/check.yml` publishes immutable develop images and runs development deployment jobs only on develop push events. The implementation explicitly re-enters this pipeline after a token-created merge.
- GLM-5.3 is the current default in the central reviewer (`GLM_REVIEW_MODEL` falling back to `glm-5.3`); hosted run [#41010390636](https://github.com/jboone1989/EventGraph/actions/runs/41010390636) completed the GLM-backed review successfully. Do not use third-party mirrored prices as Zhipu billing evidence. The GH-AW compiler must recognize the selected model's current official Zhipu price or be explicitly configured from the provider's published pricing before intake is enabled.

The Work Queue documentation explicitly states that model tests and fixtures do not prove a live hosted Result. The two-Work hosted smoke test above is therefore a release gate, not an optional demo.

## Endpoint recovery approval (2026-10-31)

The owner explicitly approved: **“批准固定端点，继续修完整流水线”**, in response to the concrete proposal to pin the Dispatcher and Worker to the existing Zhipu endpoint while preserving strict isolation and credential protection. This version changes endpoint configuration only; it does not waive any task, PR, review, merge or two-task relay acceptance criterion. The compiler error was reproduced with the actual generated shell arguments; runtime recovery remains subject to real acceptance after implementation.


## Owner-approved temporary GH-AW acceptance budget (2026-11-01)

**Owner approval receipt (2026-11-01):** After the assistant asked whether to approve a temporary 60 AIC per-Worker-run cap, at most one retry, and 120 AIC total for the two acceptance tasks, the repository owner replied verbatim **“批准”** (“Approved”) in the same ChatGPT conversation. This explicit approval applies to Story P-4 (Issue #276) and FR-011 (Issue #277): per-Worker-run `max-ai-credits: 60` instead of 50, and native `retry.max_attempts: 2` instead of 3 (one initial attempt plus at most one retry). This amendment supersedes the earlier numerical bounds in this Spec solely for the accepted validation batch; it does not modify the Claude/GLM engine, the Spec-first/GLM review gate, or production deployment.

**Total batch ceiling: 120 AIC across both Issues and all attempts, not per Issue.** Two runs each consuming 60 AIC exhaust this authorization, in which case no retries are allowed despite the queue's theoretical one-retry capability. A per-run limit and per-Work attempt count alone do not enforce an aggregate budget: keep native `grants_paused=true` until the live ledger, total run AIC use and remaining budget are verified, and pause new grants immediately after the authorized initial dispatches. Do not unpause for any retry that could exceed the remaining batch allocation. No user-approved budget expansion is implied by this amendment.

Changing `.github/workflows/aw.json` and regenerating the pinned GH-AW v1.0.1 locks does not update an installed Work Queue Policy. Reapply the policy using a new epoch only when the official queue is quiescent (no unfinished Work, reservations, or unresolved delivery barriers); never bypass that condition, rewrite provenance, or automatically resume grants as part of the PR.

**End-of-batch rollback:** Once both acceptance Works settle or the 120 AIC authorization is exhausted, restore `.github/workflows/aw.json` to `retry.max_attempts: 3` and `.github/workflows/eventgraph-worker.md` to `max-ai-credits: 50`, regenerate the Worker and Dispatcher locks with the pinned official CLI, and reapply the native Work Queue Policy in a new epoch only when the queue is quiescent. Do not automatically unpause Claim grants as part of rollback.
