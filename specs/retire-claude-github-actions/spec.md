# Retire standalone Claude Code PR review; preserve GH-AW with attributable usage

Status: Approved in chat 2026-11-04. Owner explicitly approved retaining GH-AW and its Claude Code execution engine if cost attribution is verifiable.

## Goal
Keep GitHub Agentic Workflows (GH-AW), its native Work Queue, Worker, Dispatcher, Spec-to-Work tasks and PR lifecycle. Do not confuse Claude Code as a GH-AW runtime with the separate Claude Code Action PR-review pipeline.

## Scope
- Retain GH-AW Worker / Dispatcher `engine: claude`, compiled locks, queue continuation, smoke, compile and route-deployment automation.
- Retain the existing configured GLM model/provider for GH-AW. Do not silently substitute Pi/OpenRouter or remove GH-AW.
- Remove the independent GitHub Actions Claude Code PR-review / repeated Check-to-review dispatch workflows, including the central `livingruntime-remote` reviewer. Keep normal check, docker, e2e, Spec gate and deployment checks.
- Remove `claude-review` from required branch checks, while preserving deterministic CI requirements.
- For any question about spend, inspect the exact GH-AW run's `usage` artifact, native `gh aw logs` / `gh aw audit`, and provider billing independently. Attribute each observed cost to repository, workflow, run ID, job, role, model, gateway, outcome, timestamp and source (CLI estimate vs actual provider charge). Empty usage and authentication failures must not be counted as successful paid inference.
- Do not add a custom cost ledger that duplicates GH-AW's native audited usage.

## Acceptance
1. No separate Claude Code Action code-review workflows run or retry.
2. GH-AW Claude engine, native queue, Worker and Dispatcher are preserved and unchanged.
3. A user can follow an exact run ID to inspect model, tokens, AIC/CLI estimated cost and authentication failures in the official GH-AW artifacts; distinguish provider invoices from estimates.
4. Normal CI status checks and deployment are unaffected.
