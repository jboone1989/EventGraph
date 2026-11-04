# EventGraph engineering quality contract

This is the **existing project baseline**, not a new CI/CD system. Loaded as the project-specific quality bar by `constraint-driven-development` and `AGENTS.md`. Project policies and approved Specs override generic examples in upstream skills.

## Always required

- **Spec-first for implementation**: preserve `scripts/ci/check-spec.mjs` and the approved, immutable Spec reference already required by `docs/spec-review.md`; never silently exempt implementation PRs.
- **Search Before Build**: check the current EventGraph code, relevant AIHOT upstream path and official interfaces; record alternatives and why reuse was/was not chosen.
- **Review integrity**: do not delete/skip tests, weaken assertions, loosen CI gates, lower thresholds or omit required reviewer checks to create a green status. A justified change to policy requires a separate reviewed decision.
- **Honest evidence**: a passing unit test is not proof of browser behavior; passing CI is not proof of deployment; a deployed image digest is not proof that a feature works. State what was actually verified.
- **Simple, owned code**: no duplicate queues/providers/caches, speculative compatibility/fallback/retry logic, needless wrapper layers or silent error masking. Keep changes within the accepted Spec and existing module boundaries.
- **Small cohesive units**: prefer functions around 50 lines when useful, inspect >100-line mixed-responsibility methods; do not force pointless splits.
- **Root-cause debug**: reproduce, localize, correct and verify; preserve error evidence. Do not repeatedly rerun unchanged failed CI or silently mark failures done.
- **Autonomous delivery**: once an approved task is clear, proceed through implementation, tests, PR and next queued task without new human prompts. Escalate only genuine requirement changes, required credentials or irreversibly high-risk actions.

## Existing verification entry points

- `npm run typecheck`
- `npm test` against a disposable database as documented in `AGENTS.md`
- `npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts`
- Existing GitHub `Check / check`, `e2e`, `docker` and independent `claude-review`, as applicable.

No numeric coverage, performance, accessibility or bundle budget is invented here. Introduce one only from measured project baselines through an approved change; never let the feature-author lower a check to make its own PR pass.
