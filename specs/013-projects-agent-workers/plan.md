# Implementation plan: Multi-Engine GH-AW Workers

**Status:** Owner-approved; implementation starts after this Spec PR merges to develop.

## 1. Repository findings

Inspected the current EventGraph repository, GH-AW control-plane files and the pinned upstream GH-AW v1.0.1 release.

### Existing EventGraph implementation

- The GH-AW control plane lives on EventGraph `main`; the repository's normal application development branch is `develop`.
- `.github/workflows/eventgraph-worker.md` is the current Worker. It uses the GH-AW Claude engine with model `glm-5.3`, the existing GLM base URL/key binding, `tools.work-queue.require-assignment: true`, and a single repository-scoped `create-pull-request` safe output.
- `.github/workflows/eventgraph-dispatcher.md` currently allowlists only `eventgraph-worker`.
- `.github/workflows/aw.json` currently sets Work Queue concurrency to one.
- `scripts/ci/eventgraph-work-intake.mjs` currently hardcodes `--worker-profile eventgraph-worker`. It already validates owner-authored `agent-ready`, pinned merged Spec provenance, Issue task/acceptance criteria and idempotent Issue request IDs.
- The current queue ledger was inspected on the `work-queue` branch. It contained two no-write smoke Work submissions and an installed single-profile Policy with logical/native pool limits of one. Those records must be settled through the existing queue; do not reset or rewrite the ledger.
- The current main/develop history is intentionally divergent. At the start of this Spec, `develop` was `5ccc73b34f815dc17907d747f648c04f70d7b549`, `main` was `2d981e5c37f8613d71df6d78f71787ba58e55685`, with develop 174 commits ahead and 11 behind. Do not promote the full develop branch to main to install control-plane files.

### Official GH-AW v1.0.1 capabilities reused

- The pinned GH-AW v1.0.1 Pi engine documentation supports the `anthropic/` provider through `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL`. The owner-approved recovery pins compiled GH-AW workflows to `https://open.bigmodel.cn/api/anthropic` and preserves the existing `GLM_API_KEY`; those workflows no longer read `vars.GLM_BASE_URL`. The Pi profile must reuse the same literal endpoint and key with `model: anthropic/glm-5.3`.
- GH-AW v1.0.1 supports multiple registered Worker workflows. The Dispatcher declares the allowed worker workflow names, while the immutable Work selects an approved `worker_profile`. The native scheduler still chooses eligible Work and creates Claims.
- GH-AW v1.0.1 Pi supports native MCP and Work Queue tools. The Pi engine reference states threat detection defaults to Copilot regardless of Pi's model provider. Configure `safe-outputs.threat-detection.engine` as an object with `id: claude`, `model: glm-5.3`, and explicit `env.ANTHROPIC_BASE_URL` / `env.ANTHROPIC_API_KEY` pointing to the existing GLM endpoint and secret. The threat-detection reference explicitly says different engines do not inherit main-engine environment, API targets or custom model aliases. This avoids any Copilot entitlement dependency.

## 2. Chosen minimal design

### Backlog and execution

- Issue #176 remains the only human-maintained backlog, consistent with its explicit queue rules.
- The GH-AW native Work Queue remains the only execution scheduler and authoritative record of Claims, retries, reservations and Results.
- Do not create a GitHub Projects board, duplicate task tracker or status synchronizer.

### Worker profiles

Keep `eventgraph-worker` as the GLM default and add `eventgraph-pi-worker` as a GH-AW Pi engine Worker using the existing GLM-5.3 Anthropic-compatible endpoint. This is harness diversity, not model-provider diversity.

Both workflows use the same:
- immutable Work Queue assignment and Claim handle;
- pinned Spec verification requirements;
- repository resource scope and PR effect contract;
- `agent/*` branch convention and non-draft PR safe output;
- Work ID/Worker run ID marker;
- independent Check/review/merge pipeline.

The deterministic Producer selects the profile from Issue labels:
- no Worker-selection label or `agent-worker:glm` -> `eventgraph-worker`;
- `agent-worker:pi` -> `eventgraph-pi-worker`;
- both labels -> reject before Work submission.

The owner-authored `agent-ready` label remains the only admission authorization. Worker labels never grant admission.

### Concurrency

Do not change the existing installed Policy while the two current smoke Work items or any other unfinished Work/reservations remain.

After the queue is quiescent and both profiles pass their hosted no-write smoke tests, change `aw.json` to concurrency two and apply the official quiescent Policy epoch update. Verify two concurrent Claims. If Pi/GLM endpoint or explicit detection smoke validation fails, retain GLM as the only enabled profile and do not claim Pi acceptance.

## 3. Implementation sequence

1. Obtain approval for this immutable Spec and merge its Spec PR to `develop`.
2. Extend the existing central GLM reviewer in `jboone1989/livingruntime-remote` to resolve exact-head PRs targeting both `develop` and `main`. Add `claude-review` to the EventGraph `main` ruleset alongside `check` and `docker`, then verify a docs-only PR to `main` receives the exact-head review status. Reuse the existing reviewer and checklist; do not add a second review system.
3. Mirror the exact approved Spec content to `main` in a docs-only PR. Record the main-specific Spec commit SHA.
4. Create one main-only control-plane PR pinned to the main Spec SHA:
   - add `eventgraph-pi-worker.md` with `engine: pi`, `model: anthropic/glm-5.3`, and the existing GLM API key and the owner-approved fixed endpoint literal `https://open.bigmodel.cn/api/anthropic`;
   - update `eventgraph-dispatcher.md` to allowlist the new profile;
   - update `eventgraph-work-intake.mjs` to select the profile from labels;
   - extend `eventgraph-worker-complete.yml` and `eventgraph-work-queue-guards.mjs` to accept the Pi Worker run name through the same completion handler, with focused tests;
   - add focused intake routing tests;
   - compile all affected GH-AW Markdown sources and lock files together with pinned v1.0.1 in strict mode;
   - update `.github/workflows/check.yml` so its pinned v1.0.1 strict compile command includes `eventgraph-pi-worker`, and require the generated Pi lock file to be committed.
5. Keep the existing queue Policy at concurrency one while current Work remains unfinished.
6. Settle the two existing no-write smoke Works, then verify GLM and Pi no-write smoke Work through their actual GitHub-hosted Workers, including the Pi Worker's explicit GLM-backed Claude threat-detection job. Do not use synthetic local-only test output as hosted evidence.
7. After queue quiescence, apply the concurrency-two Policy epoch and verify two independent no-write Works receive simultaneous Claims while no `agent-work` PR is open. The existing dispatch gate remains unchanged; code Work remains serialized.
8. Run one low-risk, owner-authorized code Work through each enabled profile sequentially. Verify exact PR markers, current-HEAD CI, independent GLM review, normal merge and post-merge queue continuation before dispatching the next code Work.

## 4. Branch and delivery constraints

- GH-AW workflow source and generated lock files belong on default branch `main`; do not put the active GH-AW control plane only on `develop`.
- Because `main` and `develop` are divergent, use a docs-only Spec mirror followed by an isolated main-only implementation PR. Do not merge all of `develop` into `main`.
- The main implementation PR must reference the exact approved main Spec commit in its body. Its exact HEAD must pass the central independent GLM review, Check and Docker; the main ruleset enforces all three.
- Preserve all current branch protection, Check, Docker, E2E, central GLM review and normal squash-merge rules.
- Do not touch production VM09 or execute Workers on cn-dev, VM13 or other user-managed hosts. The GH-AW Pi engine runs inside GitHub-hosted Actions; it is not a separate Pi server.

## 5. Research sources

- GH-AW v1.0.1 WorkQueueOps: https://github.github.io/gh-aw/guides/deploy-work-queue/
- GH-AW v1.0.1 Pi engine: https://github.com/github/gh-aw/blob/0627fdb/docs/src/content/docs/engines/pi.md
- GH-AW v1.0.1 Pi provider and threat-detection reference: https://github.com/github/gh-aw/blob/0627fdb/docs/src/content/docs/reference/engines/pi.md
- GH-AW v1.0.1 Work Queue reference: https://github.com/github/gh-aw/blob/0627fdb/docs/src/content/docs/reference/work-queue.md
- Existing central GLM reviewer to extend for main PRs: https://github.com/jboone1989/livingruntime-remote/blob/main/.github/workflows/eventgraph-glm-review.yml
- GH-AW v1.0.1 Codex authentication (ChatGPT subscription login is not supported): https://github.com/github/gh-aw/blob/0627fdb/docs/src/content/docs/engines/codex.md
- GitHub Spec Kit and EventGraph's mandatory approval policy: `docs/spec-review.md`, `AGENTS.md`.

## 6. Rejected alternatives

| Alternative | Decision |
|---|---|
| GitHub Projects board or second task tracker | Rejected; Issue #176 is the only human-maintained backlog and the native Work Queue is the only execution scheduler. |
| New task database or second queue | Rejected; duplicates Issue #176 and the GH-AW native Work Queue. |
| GH-AW Codex with ChatGPT subscription login | Not usable on GitHub-hosted GH-AW: the official Codex engine requires `CODEX_API_KEY`/`OPENAI_API_KEY` or Copilot inference; ChatGPT subscription login is explicitly unsupported. |
| Increase concurrency immediately | Rejected; the installed Policy has unfinished smoke Work and must be changed only when quiescent. |
| Merge develop wholesale into main | Rejected; branch histories are intentionally divergent and the GH-AW control plane is installed through isolated main PRs. |
