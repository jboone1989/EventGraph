# 016 · Stop duplicate paid reviews and retire Claude Code from EventGraph CI

- **Owner direction:** 2026-11-04. Hundreds of review executions were observed despite substantially fewer PR submissions. Claude Code is no longer authorized for EventGraph GitHub Actions code development or review.
- **Observed evidence:** On 2026-11-04, many `workflow_run` executions of `Forward PR to central GLM review` targeted the same PR and workflow commit. A local review job at GitHub Actions run 41821795002 invoked `anthropics/claude-code-action@v1` twice via OpenRouter, first for review and again for verification. The workflow trigger is not uniquely bound to a newly changed PR HEAD.
- **Purpose:** Immediate, reversible cost containment without making successful CI or fake review results.

## Minimal change

1. Remove the default-branch `.github/workflows/claude-pr-dispatch.yml` and its dependent `.github/workflows/eventgraph-glm-review.yml`. These are the active automatic model-review entry point and the reusable Claude Code Action implementation. Do not replace them with a no-op check reporting `claude-review=success`.
2. Remove only the stale workflow-specific reference assertion from `.github/workflows/check.yml`; retain `check`, `docker`, `e2e`, existing Spec enforcement, actual build/test jobs, and deployment gates unchanged.
3. Land the shutdown through normal protected-branch PR/CI. Do not bypass `main` branch protection, force push, or deploy production as part of the shutdown.
4. Before using the same removal on `develop`, remove the now-obsolete required `claude-review` context from active develop Ruleset #25775731 through an authenticated repository administrator. Preserve the real `check`, `docker`, and `e2e` requirements. Do not silently forge review statuses to unblock merging.
5. A future independent reviewer is a **separate Spec and implementation**. It must use a direct API call (not Claude Code), require an exact active PR head/base identity, and deduplicate on `(head SHA, base ref, base SHA)` so that one successful identity is reviewed at most once. No automatic second verification model call; explicitly authorized re-review is separate.

## Acceptance

- Active default-branch workflow definitions no longer trigger Claude Code/GLM reviewer on successful `Check`; no `anthropics/claude-code-action` usage remains in the active EventGraph CI review path.
- Existing tests and real CI gates are unchanged except for removal of the reference validation that required the deleted workflow files.
- The protected-main shutdown PR passes required checks and merges without changing production deployment configuration.
- Develop cannot be inadvertently blocked by a missing required review context after its matching ruleset and workflows are deliberately updated.
- No claim that past GitHub Actions runs were retroactively cancelled, or that a workflow run count equals a billed API-call count.
