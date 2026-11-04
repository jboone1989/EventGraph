# Retire Claude Code from EventGraph GitHub automation, preserve GH-AW

Status: Approved by repository owner on 2026-11-04. Owner explicitly clarified that GH-AW and its Work Queue must be kept.

## Goal
GitHub Actions must not run Claude Code for PR reviews or for code development. Keep native GitHub Agentic Workflows (GH-AW), their Work Queue, Specs-to-Work automation, Worker, Dispatcher and PR lifecycle.

## Scope
- Remove the separate EventGraph Claude Code Action PR review and its Check-triggered dispatcher; remove central GitHub Actions Claude review, already retired in `jboone1989/livingruntime-remote`.
- Preserve GH-AW Markdown source workflows, generated lock workflows, native queue continuation, Worker/Dispatcher, compile, smoke and route-deploy workflows.
- Replace any GH-AW `engine: claude` with a supported non-Claude-Code engine rather than deleting GH-AW; compile regenerated locks before activation. If replacement credentials or runtime are unverified, keep dispatch paused, not silently run Claude Code.
- Preserve native deterministic Check, Docker, E2E, Spec gate and deployment.
- Remove required branch status `claude-review` without removing ordinary CI requirements.
- Do not modify application runtime, model bindings, production deployment or GH-AW Work Queue records.

## Acceptance
1. No active GitHub workflow invokes `anthropics/claude-code-action`, self-hosted Claude CLI, or a GH-AW Worker/Dispatcher built with `engine: claude`.
2. GH-AW code and queue workflows remain available, with eventual non-Claude engine validated and compiled.
3. PRs can merge with required deterministic checks without `claude-review`.
4. Existing standard CI and deployment remain intact.
