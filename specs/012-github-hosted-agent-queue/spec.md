# GitHub-hosted autonomous development queue

**Status:** Draft until this PR has passed independent review and is merged. It records the owner-approved direction from 2026-10-30 and becomes the active implementation contract only after merge.  
**Supersedes:** `specs/pi-auto-repair/spec.md` (effective when this PR merges)  
**Date:** 2026-10-30  
**Target repository:** `jboone1989/EventGraph`  
**Target development branch:** `develop`

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
2. A GH-AW Producer validates the Issue and submits it as immutable Work through native `work_queue_submit`. The native Git-backed Work Queue ledger is authoritative; no `tasks.json`, `runs.jsonl`, custom database, or host-side scheduler is introduced. Submission uses a stable Issue-derived request identity so repeated label events are idempotent.
3. A GH-AW Dispatcher requests one eligible Claim. The native Work Queue, not the agent prompt, selects the next Work and its approved worker profile.
4. A GH-AW worker runs on a GitHub-hosted `ubuntu-latest` runner, checks out EventGraph `develop`, verifies the immutable approved Spec, researches existing code/upstream/official interfaces, implements the task, runs relevant tests, and proposes one non-draft PR targeting `develop`, using an `agent/*` branch and the `agent-work` label.
5. The worker has no direct GitHub write permissions. PR creation and Claim completion use GH-AW's claim-scoped safe-output and native Work Queue mechanisms. Every code Work carries a closed version-1 `effect_contract` and version-1 `resource_scope`. The code Work contract is exactly one repository-scoped `create_pull_request` output with `min: 1` and `max: 1`; its resource scope is the canonical `github.com/jboone1989/EventGraph` repository and repository ID `1416699488`. Synthetic smoke Work uses `{"kind":"none"}` and performs no resource effects. No other agent-authored write is authorized. The PR body includes a machine-readable marker containing the immutable Work ID and the originating GH-AW Worker run ID; this binds the created PR to the exact Claim execution.
6. A deterministic default-branch `worker-complete` workflow listens for completion of the published GH-AW Worker workflow. It accepts only the exact Worker workflow in this repository. If a successful Worker run created exactly one open, non-draft `agent-work` PR targeting `develop` whose marker matches that Worker run ID, it reads the live PR head SHA and dispatches Check on that PR branch with `expected_sha` set to that exact SHA. It then dispatches the native Dispatcher once. The Dispatcher first checks for an open `agent-work` PR and exits without requesting a Claim if one exists; otherwise it asks the native queue for one eligible Claim. This advances no-write smoke Work and bounded retries automatically while keeping code Work serialized behind its open PR. The helper does not select Work, modify source, or hold agent execution credentials. This is necessary because GH-AW safe-output PR creation uses a GitHub token and cannot be assumed to emit a `pull_request` event that starts CI. If a failed Worker run leaves a partially created PR, the Dispatcher fails closed on the open PR and surfaces manual recovery rather than creating duplicate work.
7. The dispatched Check verifies `expected_sha == github.sha`, resolves exactly one current open same-repository PR at that SHA targeting `develop`, and runs Check, E2E and Docker. The existing independent R01–R18 reviewer then reviews that exact SHA. The main-branch `claude-pr-dispatch.yml` already forwards every completed Check run to the central reusable reviewer; the central reviewer must accept `workflow_dispatch` only after the same exact-SHA/live-PR checks. A PR is eligible for squash merge only when the exact current PR HEAD has every required check and an explicit successful independent review. A stale Check or review cannot authorize a newer SHA. No branch-protection bypass is allowed.
8. The existing default-branch `claude-pr-dispatch.yml` is the trusted merge workflow: after its central reusable review job succeeds, a dependent merge job revalidates the original Check run ID, exact current PR HEAD, open/non-draft state, `develop` base, same-repository head, and successful `claude-review` status. It then requests a normal squash merge with no `--admin`; GitHub branch protection remains authoritative. If this merge uses `GITHUB_TOKEN`, the same trusted workflow explicitly dispatches Check on `develop` with the exact merge commit SHA as `expected_sha`. Check fails closed if the selected `develop` ref no longer resolves to that SHA. The dispatched Check reruns Check and E2E and re-enters the existing develop `publish` path for that exact SHA; the existing VM13 preview and cn-dev worker deployment jobs remain behind their existing `EVENTGRAPH_DEV_AUTO_DEPLOY` gate and run only after successful publish. These are the repository's existing application-delivery jobs, not agent execution: GH-AW workers never run on those hosts.
9. A `resume_queue` job in the existing Check workflow runs only after Check, E2E and publish succeed for the same `develop` SHA, confirms that SHA is still the current `develop` head and no open `agent-work` PR exists, then dispatches the next GH-AW Dispatcher on `main`. It does not wait for independent preview/deployment jobs and does not use a timer. Manual merges resume through the normal develop push Check/publish path. This prevents a token-created merge from silently skipping the normal develop release pipeline or queue continuation.
10. Queue progression is event-driven: a Producer accepts owner-labeled Issues, a Dispatcher requests native Claims, and a Worker executes them. Worker completion, Check/review completion, merge and publish events resume the appropriate workflow. The Dispatcher checks for an open `agent-work` PR before dispatching. Configure native Work Queue concurrency to one active Claim per pool and bounded retries (`max_attempts: 3`, `backoff_seconds: 1`); the one-second minimum backoff lets the event-driven completion handler request the next eligible Claim without a polling loop. No systemd timer, Linux cron, scheduled polling loop, tmux session, or persistent agent process is used. A manual `workflow_dispatch` recovery entry point is allowed.
9. The model endpoint and key are configuration, not code. Use GLM-5.3 initially, with `ANTHROPIC_BASE_URL` from `vars.GLM_BASE_URL` when configured, otherwise `https://open.bigmodel.cn/api/anthropic`. The current default-branch `main` copy of EventGraph `.github/workflows/claude-pr-dispatch.yml` (blob `3c9afe1c37e4895f731a0aecc050a3d857b180c2`) already calls `jboone1989/livingruntime-remote/.github/workflows/eventgraph-glm-review.yml@main` for completed Check runs and passes `secrets.GLM_API_KEY`; this confirms the reference and forwarding path, not that the secret value has been successfully read. The central reusable reviewer currently accepts only a successful `pull_request` Check. Extend its preflight to also accept a completed, successful `workflow_dispatch` Check for the exact SHA, then retain its existing unique-PR resolution, same-repository/open/non-draft/`develop` checks and live-HEAD staleness guard. For a dispatched Check with no PR association, resolve exactly one current PR from the checked SHA. Synchronize EventGraph's stale `develop` copy of `claude-pr-dispatch.yml` with the current `main` forwarding behavior before the next normal promotion, so promotion cannot revert the reviewer path. Missing credentials must fail visibly; do not claim secret readability until a hosted run proves it. Pass the key only through GH-AW's documented engine-specific secret mechanism, never through workflow-level `env` or model-visible prompt text. Changing provider credentials or base URL must not require rewriting queue or worker logic.
10. Bound every agentic Work run: `timeout-minutes: 30`, `jobs.agent.timeout-minutes: 30`, `safe-outputs.timeout-minutes: 10`, `max-turns: 40`, and `max-ai-credits: 50`. Do not disable the credit guardrail. GH-AW AIC is a best-effort estimate, not an exact provider invoice cap; the pinned GLM-5.3 model pricing must be present in the compiled firewall configuration (or explicitly configured from the provider's published rates) and verified in the hosted smoke test. Report actual token/AIC usage from GH-AW run records and reconcile it with the provider billing view. Exceeding a turn, credit, or time limit fails the Work visibly; it is not silently retried as success.

### Canonical code Work payload

The code Work's immutable payload must use the v1.0.1 field shapes below (the task text and any Issue/Spec metadata are additional ordinary Work fields):

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

The `effect_contract` and `resource_scope` objects are closed schemas: no extra fields, aliases, wildcards, or mutable post-admission edits. A read-only smoke Work uses `"effect_contract": {"kind":"none"}`. The native Work Queue validates the versioned contract and checks every delivered resource against the immutable Work scope and installed worker profile.

## 4. Platform and branch constraints

- Pin GitHub Agentic Workflows to the immutable, verified `v1.0.1` release. Use its native Work Queue; do not hand-implement queue storage, fairness, Claims, retry state, or task dependency state. The v1.0.1 documentation marks the Work Queue operator command experimental, so the hosted smoke test below is a mandatory release gate.
- All agent and framework jobs use GitHub-hosted runners. No self-hosted runner or SSH hop is part of the development execution path.
- EventGraph's GitHub default branch is `main`, while normal development targets `develop`. GH-AW requires worker Markdown sources and compiled locks to be published on the repository default branch. Develop and validate them on `develop` first; they become active only through the existing normal `develop`→`main` promotion after this Spec is merged. Do not cherry-pick/selectively push automation files to `main`, directly push unreviewed workflow changes, change the default branch, or promote application code as a side effect of this feature. Keep normal intake disabled until the approved Spec and compiled worker sources are present on `main`.
- GH-AW source Markdown and generated `.lock.yml` files must be compiled together by the pinned official CLI in strict mode and committed together. Generated lock files must never be hand-authored.
- GitHub does not start most follow-on workflows from events created with `GITHUB_TOKEN`. The current `main` `.github/workflows/claude-pr-dispatch.yml` forwards completed Check runs to the central reusable reviewer and passes the EventGraph `GLM_API_KEY`; the central reusable reviewer's current preflight in `jboone1989/livingruntime-remote/.github/workflows/eventgraph-glm-review.yml` accepts only `workflow_run.event == 'pull_request'`. Extend that preflight to accept `workflow_dispatch` only after it independently verifies the source run is completed/successful and its SHA is the exact live HEAD of one open, non-draft, same-repository PR targeting `develop`. Keep the existing exact-SHA PR resolution and stale-head guard. Update EventGraph's `develop` copy of `claude-pr-dispatch.yml` to match the default-branch forwarding behavior before promotion.
- Extend both `main` and `develop` copies of EventGraph `.github/workflows/check.yml` with the optional `expected_sha` input and the exact-SHA guard. The `develop` copy must run Docker for `workflow_dispatch` refs under `agent/*` (while retaining the existing upstream-bot branch behavior); the normal `pull_request` Docker path and docs-only optimization remain unchanged. A worker-created PR is checked by dispatching Check on its exact branch after the Worker run completes. Widen the develop `publish` and existing development deployment job conditions only for the exact, validated `workflow_dispatch` path on `develop`, preserving existing push behavior and the deployment flag. Add the `resume_queue` job to Check with `needs` on Check/E2E/publish; it verifies the same SHA is still the current `develop` head and no `agent-work` PR is open before dispatching the next GH-AW Dispatcher. It must not wait for the independent preview/deployment jobs.
- Keep the existing Spec gate. Every code-producing Work must carry an immutable Spec path/SHA and the owner-approved Issue/Spec PR evidence; the Worker verifies the Spec is already on `develop` and unchanged before editing code.

## 5. Acceptance criteria

### A. Queue and dispatch

- [ ] GH-AW source and lock files compile with pinned GH-AW v1.0.1 in strict mode.
- [ ] The first accepted submission initializes the native Git-backed Work Queue and Policy on the dedicated `work-queue` branch.
- [ ] A synthetic no-write Work is admitted, receives exactly one Claim, runs on a GitHub-hosted runner, finishes, and obtains an independently verified Result.
- [ ] The Dispatcher cannot choose a specific Work or worker; it requests a bounded pool prefix and the native scheduler selects the assignment.
- [ ] `.github/workflows/aw.json` sets native Work Queue concurrency to one active Claim per pool and bounded retry (`max_attempts: 3`, `backoff_seconds: 1`); duplicate Issue events do not create duplicate Work.
- [ ] Every code Work has the closed version-1 `effect_contract` and immutable version-1 `resource_scope` described in §3.5; synthetic smoke Work has the no-write `{"kind":"none"}` contract.
- [ ] The `worker-complete` event handler dispatches the next Dispatcher after a no-write Worker finishes; a second synthetic Work is admitted and dispatched automatically without a user prompt or external timer.

### B. Real development delivery

- [ ] An Issue is admitted only after the repository owner adds `agent-ready`, and its pinned Spec PR, immutable Spec SHA, and acceptance criteria validate.
- [ ] The worker runs only on GitHub-hosted infrastructure and checks out `develop`; no user-managed host is contacted by an agent worker.
- [ ] The worker creates one PR to `develop` with the exact Spec path/SHA, Spec PR URL, and Issue authorization evidence in its body.
- [ ] The PR's exact HEAD receives Check, E2E, Docker, and independent R01–R18 review. A stale Check or review cannot authorize a newer SHA.
- [ ] The Worker PR contains a Work ID + Worker run ID marker; the deterministic `worker-complete` workflow verifies exactly one matching live PR and dispatches Check on its branch with `expected_sha` equal to the live PR head.
- [ ] That dispatched Check validates `expected_sha`, resolves the exact open PR, runs Docker for `agent/*`, and automatically triggers the central independent reviewer; the resulting review is recorded against the same SHA without a manual prompt.
- [ ] A passing PR is squash-merged by the trusted default-branch `claude-pr-dispatch.yml` merge job only after exact-SHA Check and independent review success, without bypassing branch protection.
- [ ] After a `GITHUB_TOKEN` merge, the dispatched develop Check validates `expected_sha`, reruns Check/E2E, and produces a successful immutable `publish` run for the exact merge SHA; existing development deployment jobs run only under their existing flag.
- [ ] The Check `resume_queue` job dispatches the next Dispatcher only after successful Check/E2E/publish for the exact current `develop` SHA. The `worker-complete` handler also advances no-PR Work and retries. Neither path launches another Worker while an `agent-work` PR to `develop` is open.
- [ ] A manual merge/push to `develop` also resumes the queue through the same successful push Check/publish evidence.
- [ ] After merge and publish, the next queued Work starts automatically from the new `develop` HEAD.

### C. Operational behavior

- [ ] No `tasks.json`, `runs.jsonl`, host-side queue, timer, cron, tmux, or long-running agent is required.
- [ ] Queue state, Claims, attempts, delivery and Results can be inspected through the official GH-AW operator CLI and GitHub Actions history.
- [ ] Every worker has the explicit agent, generated-job and safe-output timeouts, 40-turn cap, and 50-AIC budget; GLM-5.3 pricing is recognized/configured by the pinned compiler and the budget stop is exercised in a hosted test.
- [ ] The implementation verifies that `GLM_API_KEY` is readable by an EventGraph-hosted workflow before the hosted smoke test; missing credentials block intake.
- [ ] Missing credentials, unsupported API compatibility, queue protocol errors, failed checks, failed review, and budget exhaustion are visible as failures/blocked Work; they are never reported as completed.
- [ ] A real hosted smoke test is required before enabling the `agent-ready` intake label for normal work.

## 6. Out of scope

- EventGraph product features, its PostgreSQL/pg-boss runtime queue, production deployment, and application architecture.
- Reusing Pi, the old Pi auto-repair flow, VM09/VM13/cn-dev execution, systemd timers, cron, or tmux for agent work.
- Changing EventGraph's default branch or selectively promoting automation files to `main` outside the normal reviewed release path.
- Weakening Spec, Check, E2E, Docker, R01–R18 review, or branch-protection gates.

## 7. Research basis

Implementation must be based on these pinned/current primary references and checked-in repository facts:

- [GH-AW v1.0.1 immutable release](https://github.com/github/gh-aw/releases/tag/v1.0.1), release commit `0627fdb`; [Work Queue reference](https://github.github.io/gh-aw/reference/work-queue/) and [WorkQueueOps deployment example](https://github.github.io/gh-aw/patterns/workqueue-ops/). The native queue uses the Git-backed `work-queue.jsonl` ledger on `work-queue`; first accepted submission installs Policy and Work together; Issues are projections, not queue storage; Producer/Dispatcher/Worker roles and Claim-scoped safe outputs are native. `aw.json` `concurrency` is per-pool capacity (default 16, accepted 1–4096); retry backoff accepts 1–3600 seconds. The operator CLI remains documented as experimental.
- [GH-AW v1.0.1 frontmatter reference](https://github.github.io/gh-aw/reference/frontmatter/) and [cost management](https://github.github.io/gh-aw/reference/cost-management/). `max-turns` bounds model responses/tool calls; `max-ai-credits` is enabled by default and 1 AIC represents USD 0.01, but AIC is best-effort and may differ from provider invoices. Explicit agent, generated-job and safe-output timeouts are supported.
- [GH-AW v1.0.1 Claude engine setup](https://github.github.io/gh-aw/engines/claude/): use the documented Claude engine and engine-specific secret handling; a Claude subscription login is not supported.
- EventGraph default-branch reviewer forwarder: `.github/workflows/claude-pr-dispatch.yml`, current blob `3c9afe1c37e4895f731a0aecc050a3d857b180c2`. It calls the central reusable reviewer and passes `GLM_API_KEY`. EventGraph's `develop` copy is stale at blob `90cdf38df8ec693977ccc809add709de355c05e4`.
- Central reviewer: `jboone1989/livingruntime-remote/.github/workflows/eventgraph-glm-review.yml`, current blob `e599f81d2b6d0bb3b443c643ca1c266626bb9aaf`. Its exact-SHA/live-PR checks already exist; its Check event preflight currently accepts only `pull_request` and must be extended for `workflow_dispatch`.
- EventGraph's existing `.github/workflows/check.yml` publishes immutable develop images and runs development deployment jobs only on develop push events. The implementation must explicitly re-enter this pipeline after a token-created merge, rather than assuming `GITHUB_TOKEN` will create a push event.
- [Zhipu GLM-5.3 pricing](https://help.aliyun.com/en/model-studio/glm-5-3-by-zhipu) is USD 1.40/M input, USD 4.40/M output, and USD 0.26/M cached input for the international endpoint; verify the actual `glm-5.3` pricing embedded by the pinned compiler and reconcile actual usage against the provider billing view. The configured AIC ceiling is an operational guardrail, not an invoice guarantee.

The Work Queue documentation explicitly states that model tests and fixtures do not prove a live hosted Result. The two-Work hosted smoke test above is therefore a release gate, not an optional demo.
