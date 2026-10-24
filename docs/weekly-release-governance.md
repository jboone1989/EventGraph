# Weekly release governance (EventGraph)

- Branch flow: short-lived feature -> develop -> main. Existing `.github/workflows/branch-hygiene.yml` deletes merged feature branches; no duplicate cleaner.
- Develop: normal Check + E2E + GHCR immutable digest smoke + auto-deploy.
- Production candidate: Sunday 10:00 Asia/Shanghai (02:00 UTC), at most one **develop→main release PR** proposed. The scheduler never pushes directly to protected `main`. Production rollout is off unless `EVENTGRAPH_PROD_AUTO_DEPLOY=true` and the existing production host/environment secrets and approval gates are configured.
- Weekly release checks the **exact develop SHA** has passing source checks, publish and **successful development deployment**, then compares migrations/knowledge/production Compose against main. Differences require a separate backed-up, reviewed migration; the weekly image-only path refuses them.
- Before proposing the promotion PR it read-only checks the running production Compose stack/health. If preflight fails, no PR is created and no deployment occurs.
- Production updates only app services by immutable image digest; no database/Neo4j replace and no implicit migration. Missing migration parity fails closed.

## Important bootstrap boundary

GitHub only fires scheduled workflows when their definition lives on **default branch `main`**. Merging this change into `develop` is NOT an activated Sunday schedule. A separately reviewed one-time bootstrap of `.github/workflows/weekly-release.yml`, updated `check.yml`, `scripts/ci/deploy-image.sh` and production preflight script onto `main` is required, **without deploying production**. Existing main/develop divergence must also be reconciled. Do this in a controlled release window; never pretend a workflow only on develop schedules anything.

## Activation checks

- Validate real production host/Compose paths and GitHub deployment environment/SSH secrets with read-only preflight before setting the auto-deploy variable.
- GitHub branch protection requires the weekly PR to merge through normal required checks, not a direct `git push`. Repository setting `allow_auto_merge=false` (observed 2026-10-24), so **human merge is required** until that setting changes. **Use a merge commit, not squash/rebase** for develop→main, so the existing ancestry-based weekly idempotency check remains meaningful. A PR created with the built-in `GITHUB_TOKEN` may put its CI in an approval-required state; explicitly approve the run if prompted. After main merges, use the existing `gh workflow run check.yml --ref main -f weekly_release=true` to request the production deployment with its normal environment approval. Do not claim unattended weekly deployment is operational.
- Verify one full development image publish/deployment through the latest digest smoke. Trigger a diagnostic manual dispatch (must skip promotion); observe a genuine Sunday run before claiming scheduling has worked.
- Production cannot promote pending provider migrations or Graphiti schema changes through the image-only release path.

Sources: GitHub Actions scheduled workflow default branch behavior and built-in GITHUB_TOKEN dispatch exception; Docker Compose native image pull/Compose orchestration.

## Independent review hardening

The manual Check dispatch flag is not by itself proof of a scheduled release. The main publication guard now verifies a merged develop→main PR with a `release(weekly):` title is associated with the exact main SHA; **GitHub production environment required reviewers and restricted deployment branches are mandatory** before enabling any production rollout. Missing production SSH host/user/root/fingerprint fails closed. Set EVENTGRAPH_PROD_AUTO_DEPLOY as a **repository-level Actions variable**, not solely an environment-level variable (job-level conditions cannot read the latter). The weekly workflow does not directly push main or dispatch production. It opens or reuses a normal protected release PR; promotion and production dispatch remain separately observable actions. Do not enable unattended production deployment until these repository settings are verified.

Production deploy independently validates nonempty SSH target fingerprint and connection coordinates immediately before invoking the release action. Rerun of the same Sunday release checks for an existing main-head dispatch and skips duplicates. This guard does not replace mandatory production environment reviewers and branch restrictions.
