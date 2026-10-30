# Implementation plan: GitHub Projects and Multi-Engine GH-AW Workers

**Status:** Draft; implementation starts only after the Spec PR is approved and merged.

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

- The pinned GH-AW v1.0.1 Pi engine documentation supports the `anthropic/` provider through `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL`. EventGraph's existing Worker already uses the GLM Anthropic-compatible endpoint (`GLM_BASE_URL`, default `https://open.bigmodel.cn/api/anthropic`) and `GLM_API_KEY`; the Pi profile can reuse those exact values with `model: anthropic/glm-5.3`.
- GH-AW v1.0.1 supports multiple registered Worker workflows. The Dispatcher declares the allowed worker workflow names, while the immutable Work selects an approved `worker_profile`. The native scheduler still chooses eligible Work and creates Claims.
- GH-AW v1.0.1 Pi supports native MCP and Work Queue tools. The Pi engine reference states threat detection defaults to Copilot regardless of Pi's model provider. Configure `safe-outputs.threat-detection.engine` as an object with `id: claude`, `model: glm-5.3`, and explicit `env.ANTHROPIC_BASE_URL` / `env.ANTHROPIC_API_KEY` pointing to the existing GLM endpoint and secret. The threat-detection reference explicitly says different engines do not inherit main-engine environment, API targets or custom model aliases. This avoids any Copilot entitlement dependency.
- GitHub Projects provides built-in Auto-add and status workflows. Auto-add supports filters such as `is:open`, `is:issue` and `is:pr`, but does not backfill existing items when first enabled. GitHub's default built-in workflows set closed Issues/PRs and merged PRs to Done.
- GH-AW ProjectOps is not needed for this initial requirement. Its own documentation recommends built-in Project workflows for simple rule-based transitions. Avoid a Project API integration, PAT secrets and custom synchronizer until there is a real context-aware requirement.

## 2. Chosen minimal design

### Project

Create one personal Project named `EventGraph Delivery` under `jboone1989`.

- Seed Issue #176 and existing open Issues/PRs once through GitHub's bulk-add UI.
- Enable the built-in Auto-add workflow for new open items from `jboone1989/EventGraph` using `is:open`.
- Use the built-in Status field and labels. Labels encode priority and selected Worker profile.
- Enable the existing built-in closed/merged-to-Done workflows.
- Keep Issue #176 as the existing parent/backlog record; do not create a duplicate Issue for each checkbox.

No ProjectOps workflow or custom Project API integration is added.

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
2. Mirror the exact approved Spec content to `main` in a docs-only PR. Record the main-specific Spec commit SHA.
3. Create one main-only control-plane PR pinned to the main Spec SHA:
   - add `eventgraph-pi-worker.md` with `engine: pi`, `model: anthropic/glm-5.3`, and the existing GLM API key/base URL;
   - update `eventgraph-dispatcher.md` to allowlist the new profile;
   - update `eventgraph-work-intake.mjs` to select the profile from labels;
   - add focused intake routing tests;
   - compile all affected GH-AW Markdown sources and lock files together with pinned v1.0.1 in strict mode.
4. Keep the existing queue Policy at concurrency one while current Work remains unfinished.
5. Verify GLM and Pi no-write smoke Work through their actual GitHub-hosted Workers, including the Pi Worker's explicit GLM-backed Claude threat-detection job. Do not use synthetic local-only test output as hosted evidence.
6. After queue quiescence, apply the concurrency-two Policy epoch and verify two independent Claims execute concurrently.
7. Run one low-risk, owner-authorized code Work through each enabled profile. Verify exact PR markers, current-HEAD CI, independent GLM review, normal merge and post-merge queue continuation.
8. Create/configure the Project in GitHub UI, bulk-add existing items, enable Auto-add and built-in status workflows. Verify a new Issue/PR is added automatically and a merged PR is marked Done.

## 4. Branch and delivery constraints

- GH-AW workflow source and generated lock files belong on default branch `main`; do not put the active GH-AW control plane only on `develop`.
- Because `main` and `develop` are divergent, use a docs-only Spec mirror followed by an isolated main-only implementation PR. Do not merge all of `develop` into `main`.
- The main implementation PR must reference the exact approved main Spec commit in its body. The Spec gate and central independent review must pass on its exact HEAD.
- Preserve all current branch protection, Check, Docker, E2E, central GLM review and normal squash-merge rules.
- Do not touch production VM09 or execute Workers on cn-dev, VM13 or other user-managed hosts. The GH-AW Pi engine runs inside GitHub-hosted Actions; it is not a separate Pi server.

## 5. Research sources

- GH-AW v1.0.1 WorkQueueOps: https://github.github.io/gh-aw/guides/deploy-work-queue/
- GH-AW v1.0.1 Pi engine: https://github.com/github/gh-aw/blob/0627fdb/docs/src/content/docs/engines/pi.md
- GH-AW v1.0.1 Pi provider and threat-detection reference: https://github.com/github/gh-aw/blob/0627fdb/docs/src/content/docs/reference/engines/pi.md
- GH-AW v1.0.1 Work Queue reference: https://github.com/github/gh-aw/blob/0627fdb/docs/src/content/docs/reference/work-queue.md
- GH-AW v1.0.1 Codex authentication (ChatGPT subscription login is not supported): https://github.com/github/gh-aw/blob/0627fdb/docs/src/content/docs/engines/codex.md
- GitHub Projects built-in automations: https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations
- GitHub Projects Auto-add: https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically
- GitHub Spec Kit and EventGraph's mandatory approval policy: `docs/spec-review.md`, `AGENTS.md`.

## 6. Rejected alternatives

| Alternative | Decision |
|---|---|
| Custom ProjectOps workflow for simple status transitions | Rejected; GitHub Projects built-in workflows already cover Auto-add and closed/merged-to-Done. |
| New project-management database or task queue | Rejected; duplicates Projects and the GH-AW native queue. |
| GH-AW Codex with ChatGPT subscription login | Not usable on GitHub-hosted GH-AW: the official Codex engine requires `CODEX_API_KEY`/`OPENAI_API_KEY` or Copilot inference; ChatGPT subscription login is explicitly unsupported. |
| Increase concurrency immediately | Rejected; the installed Policy has unfinished smoke Work and must be changed only when quiescent. |
| Merge develop wholesale into main | Rejected; branch histories are intentionally divergent and the GH-AW control plane is installed through isolated main PRs. |
