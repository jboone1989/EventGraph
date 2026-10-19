# Weekly release governance (EventGraph)

- Branch flow: short-lived feature -> develop -> main. Existing `.github/workflows/branch-hygiene.yml` deletes merged feature branches; no duplicate cleaner.
- Develop: normal Check + E2E + GHCR immutable digest smoke + auto-deploy.
- Production: Sunday 10:00 Asia/Shanghai (02:00 UTC), **at most one scheduled promotion**. Production is off unless `EVENTGRAPH_PROD_AUTO_DEPLOY=true`, the host/environment variables and secrets exist, and production approvals are satisfied. Workflow dispatch from a person does not promote or deploy.
- Weekly release checks the **exact develop SHA** has passing source checks, publish and **successful development deployment**, then compares migrations/knowledge/production Compose against main. Differences require a separate backed-up, reviewed migration; the weekly image-only path refuses them.
- Before advancing main it read-only checks the running production Compose stack/health. If safety gates fail, no merge and no deployment.
- Production updates only app services by immutable image digest; no database/Neo4j replace and no implicit migration. Missing migration parity fails closed.

## Important bootstrap boundary

GitHub only fires scheduled workflows when their definition lives on **default branch `main`**. Merging this change into `develop` is NOT an activated Sunday schedule. A separately reviewed one-time bootstrap of `.github/workflows/weekly-release.yml`, updated `check.yml`, `scripts/ci/deploy-image.sh` and production preflight script onto `main` is required, **without deploying production**. Existing main/develop divergence must also be reconciled. Do this in a controlled release window; never pretend a workflow only on develop schedules anything.

## Activation checks

- Validate real production host/Compose paths and GitHub deployment environment/SSH secrets with read-only preflight before setting the auto-deploy variable.
- Confirm credentials allow `gh workflow run check.yml --ref main -f weekly_release=true` and that the checked-out main workflow accepts `weekly_release`.
- Verify one full development image publish/deployment through the latest digest smoke. Trigger a diagnostic manual dispatch (must skip promotion); observe a genuine Sunday run before claiming scheduling has worked.
- Production cannot promote pending provider migrations or Graphiti schema changes through the image-only release path.

Sources: GitHub Actions scheduled workflow default branch behavior and built-in GITHUB_TOKEN dispatch exception; Docker Compose native image pull/Compose orchestration.
