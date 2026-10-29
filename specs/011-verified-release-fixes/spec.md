# 011 · Verified release fixes: promote digest integrity and SSR-stable graph geometry

- **Motivation and approval boundary**: Owner requested fixes for verified issues discussed around PR #112. An earlier review of a separate change set reported 0 blocking, but those patches are **not present in current develop**. This DRAFT records required changes and test criteria, not completed implementation or production verification.
- **Replaces**: nothing. It closes two correctness gaps in the existing 008 promotion pipeline and in the web app's hydration path; it changes no deployment topology, target host or credential.

## Proposed user-visible behavior (not yet implemented on develop)

1. **Pin-only promotion must update the running digest.** In `scripts/deploy-prod.sh`, read `LRSITE_APP_IMAGE_REF` from the host `.env`; if it differs from the validated `IMAGE_REF`, force the application pull/re-tag even when the source diff is empty. On both successful keep and pull paths, record `LRSITE_APP_IMAGE_REF=<IMAGE_REF>` alongside the release metadata. Missing legacy records must converge on first successful run. Reruns remain idempotent.
2. **Promotion must bind source SHA and immutable digest.** The `promote` job must resolve `ghcr.io/jboone1989/eventgraph-app:sha-<SOURCE_SHA>` and reject any pinned `IMAGE_REF` whose digest differs. Existing status checks, digest existence and source-diff rules remain required.
3. **SSR hydration and calendar keys must be stable.** Round computed knowledge-graph geometry to two decimal places in the shared layout before rendering SVG attributes; key weekly calendar headings by position rather than repeated single-letter text. Do not alter business measurements.

**Implementation status**: These are requirements for a future implementation PR with an approved immutable Spec pin. Existing `develop` has not been shown to satisfy them. No production change is authorized by this draft alone.

## Out of scope

- The Graphiti/Neo4j knowledge image release flow (independent by design; an app digest cannot replace it).
- Branch protection, required-check names, `deploy_production` opt-in state, and the `main` promotion gate's other validations.
- Introducing rounding anywhere user data is displayed; the rounding is scoped to the computed SSR layout geometry.

## Acceptance criteria

| # | Required behavior | Verification to perform on implementation HEAD |
| --- | --- | --- |
| AC-1 | Pin-only digest update deploys the new digest; matching pin keeps existing release | Fake isolated host release state with different/matching `LRSITE_APP_IMAGE_REF`; assert pull/keep and exact image identity |
| AC-2 | Every successful app deploy records the actual pinned digest | Exercise both pull and keep WRITE_RELEASE paths and compare recorded `.env` value |
| AC-3 | `promote` refuses an otherwise valid but mismatched source-SHA digest | Negative test using a real tag digest different from `IMAGE_REF` |
| AC-4 | Home knowledge graph hydrates without geometric mismatch | Browser SSR/hydration regression on a clean build; zero hydration mismatch console errors |
| AC-5 | English daily/monthly calendar has unique React keys | Navigate /daily → /hot → /daily in browser and assert zero duplicate-key warnings |

## Validation status

- **Current PR is documentation only.** Existing code has not been changed by this Spec PR.
- Before merging a corresponding implementation PR, run targeted shell/workflow/browser regressions for AC-1 through AC-5, plus current-HEAD required CI and independent GLM review.
- Historical PR #112 discussion and local browser observations motivate these requirements; they are **not** proof that `develop` now implements them.
- No live production deployment, new credentials, or host changes are authorized by this draft.
