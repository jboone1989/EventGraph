# EventGraph Constitution

This repository uses GitHub Spec Kit artifacts for substantial feature changes, not as a replacement for `AGENTS.md` or its upstream-derived architecture rules.

1. **Existing work first**: inspect local code, upstream AIHOT, and official docs before creating a new abstraction. Reuse existing implementation wherever adequate.
2. **Public behavior is testable**: describe what a user or consumer can verify; define acceptance criteria before coding.
3. **Approved requirements are stable**: reviewers compare against the approved, commit-pinned `spec.md` (or approved Issue evidence), not an implementation PR's modified wording.
4. **Minimal diff**: one bounded goal per PR; maintain `feature → develop → main`, delete merged branches, and do not add parallel CI/CD, graph, or provider subsystems.
5. **Truthful verification**: separate tests passed, CI pending, Claude-reviewed, development-deployed, and production-deployed. Missing evidence means unverified.
6. **Privacy and safety**: retain public-evidence withdrawal/privacy filters, budget gates, and migration review; follow `AGENTS.md` for full project-specific constraints.

See `docs/spec-review.md` for use and review.
