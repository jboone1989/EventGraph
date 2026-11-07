# Automatic develop → main image promotion (2026-11-07)

**Status:** Owner-approved (owner-delegated Spec Review of 02612844b24bec27e82fff2cb9587c50a4849915)

## Problem and approval
The owner requested a durable fix after repeated failed production releases. Development publishes immutable GHCR images automatically, while main production still uses a manually edited pinned image from an older commit; runtime equivalence therefore fails after legitimate develop→main merges. Repeated main-only pin commits also cause avoidable branch-history divergence.

## Contract
1. Promote **only** a reviewed develop image already successfully built and smoke-tested by GitHub Actions develop release; main and VM09 never rebuild the application.
2. On a main release, use the **new main merge commit** (two parents) and take its second parent as the reviewed develop tip. Scan that tip's first-parent ancestry newest-first. For each candidate: **(a)** if its runtime tree differs from the new main merge tree, STOP and fail (never fall back across changed runtime source); **(b)** if runtime-equivalent and it has a successful exact-SHA publish check from the expected GitHub Actions develop workflow, SELECT and promote that candidate; **(c)** if runtime-equivalent but unpublished, SKIP that candidate and check its first parent. If no candidate qualifies, fail. This permits control-path-only commits excluded by isPromotionControlPath after the last published image without promoting stale application code; documentation outside that precise excluded set remains fail-closed.
3. Resolve the image by its exact `sha-<SOURCE_SHA>` GHCR tag; obtain and verify its immutable SHA-256 digest and pass digest, source SHA and exact main SHA to deploy. No editable `.github/production-image.env` advance or main-only commit is needed.
4. Production host validates the three promoted values and exact main HEAD before changing containers; compare runtime tree as GitHub did. Deploy only verified digest, with application release identity persisted in private host `.env` for idempotent re-entry. Direct host releases require fully explicit pinned values, not stale repository defaults.
5. Preserve all gates: CI, independent review, Spec-first, branch protection, GHCR verification, production opt-in and SSH credentials, smoke, fail-closed drift. Never force-push, never reset data/Neo4j.
6. Historical main merge commits do not need back-merging merely for ancestry. Require real merge commits, not squash; reject invalid provenance.

**Single runtime-equivalence definition:** `scripts/ci/promotion-source-equivalence.mjs` function `isPromotionControlPath` defines the sole source of excluded paths. Excluded control files are `.github/**`, `scripts/ci/**`, `specs/**`, `scripts/deploy-prod.sh`, `docs/ci-cd.md`, `docs/spec-review.md`, and `docs/production-deployment.md`. All other paths (including app code, database, image build files, industry content and other documentation) are compared and must match. The production host's shell comparison must mirror that exact exclusion set, with a regression test asserting alignment. Removal of the legacy `.github/production-image.env` is a control-path change that intentionally triggers the one-time conversion release; it does not change runtime equivalence.

## Validation
- Deterministic tests for merge ancestry, only excluded control-path commits after the published source, no verified source, runtime differences, invalid digest, and malformed/divergent refs.
- GitHub CI, E2E, Docker and independent review on implementation PR.
- Following production promotion, logs prove source SHA and digest match verified develop publish; host version equals promoted main SHA.
