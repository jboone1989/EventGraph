# EventGraph Constitution

Spec Kit is installed with official 1.2.1 generated artifacts. These principles complement, but never replace, `AGENTS.md`.

1. **Search Before Build**: inspect EventGraph current code, AIHOT upstream, and official documentation before proposing new modules. Reuse mature existing work.
2. **Testable requirements**: describe acceptance criteria and observable behavior before implementing non-trivial work.
3. **Approved requirement baseline**: review code against the approved, commit-pinned `spec.md` or an approved Issue record, not a spec silently edited alongside implementation.
4. **Minimal implementation**: one bounded goal per PR; maintain `feature → develop → main`. No duplicate CI, graph engine, provider manager or unrelated refactor.
5. **Truthful evidence**: report separately completed tests, actual GitHub CI, independent review, development deployment and production deployment. Missing evidence is `UNVERIFIED`.
6. **Existing safeguards**: preserve privacy/withdrawal filters, budget gates, migration safety and all `AGENTS.md` project constraints.

See `docs/spec-review.md`.
