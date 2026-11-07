# Automatic develop → main image promotion (2026-11-07)

**Status:** Draft

## Problem and approval
The owner requested a durable fix after repeated failed production releases. Development publishes immutable GHCR images automatically, while main production still uses a manually edited pinned image from an older commit; runtime equivalence therefore fails after legitimate develop→main merges. Repeated main-only pin commits also cause avoidable branch-history divergence.

## Contract
1. Promote **only** a reviewed develop image already successfully built and smoke-tested by GitHub Actions develop release; main and VM09 never rebuild the application.
2. On a main merge release, determine the develop source from the merge commit's **second parent** (same-repository `develop → main` with real merge commit), then search its first-parent chain from newest to older for the latest qualifying published commit. Skip only commits whose runtime tree is equivalent to main; stop with an error rather than falling back across any runtime change. Require the publish check to be successful on exactly that source SHA, from the expected Actions workflow.
3. Resolve the image by its exact `sha-<SOURCE_SHA>` GHCR tag; obtain and verify its immutable SHA-256 digest and pass digest, source SHA and exact main SHA to deploy. No editable `.github/production-image.env` advance or main-only commit is needed.
4. Production host validates the three promoted values and exact main HEAD before changing containers; compare runtime tree as GitHub did. Deploy only verified digest, with application release identity persisted in private host `.env` for idempotent re-entry. Direct host releases require fully explicit pinned values, not stale repository defaults.
5. Preserve all gates: CI, independent review, Spec-first, branch protection, GHCR verification, production opt-in and SSH credentials, smoke, fail-closed drift. Never force-push, never reset data/Neo4j.
6. Historical main merge commits do not need back-merging merely for ancestry. Require real merge commits, not squash; reject invalid provenance.

## Validation
- Deterministic tests for merge ancestry, docs/spec-only commits after the published source, no verified source, runtime differences, invalid digest, and malformed/divergent refs.
- GitHub CI, E2E, Docker and independent review on implementation PR.
- Following production promotion, logs prove source SHA and digest match verified develop publish; host version equals promoted main SHA.
