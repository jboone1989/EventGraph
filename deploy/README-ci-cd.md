# GitHub Actions deployment contract

Source of truth: `develop` for development, `main` for production.
GitHub's `Check` workflow must pass on the exact pushed commit.
`Build and deploy` uses a SHA-tagged GHCR image, then runs Docker Compose remotely.
The server never builds an image or runs npm.

## One-time setup (per environment)
- Create GitHub Environments `development` and `production`. Restrict allowed branches to `develop` and `main` respectively. Protect `main` with a required successful Check and reviewed PRs.
- Set environment secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` and environment variable `DEPLOY_DIR`. Verify host keys from a trusted source; do not use unauthenticated `ssh-keyscan` during each deployment.
- Bootstrap `DEPLOY_DIR` on each server with `docker-compose.yml`, `deploy/compose.ghcr.yml`, and a server-local `.env` (mode 0600). This is one-time provisioning, NOT a per-deploy git pull.
- Start the database service once, preserving its named volumes and Compose project name. Give the deploy identity Docker/Compose permissions and read access to GHCR. Production and development must have separate .env files, DB storage and host ports.
- Do not replace an existing production Compose topology without verifying it against the live services and persistent volumes. If Graphiti/Neo4j services use additional Compose overlays, adapt this workflow to that topology before activation.

## Subsequent releases
1. Push `develop` => GitHub Check => build image => remote pull + idempotent setup + update app containers + health check.
2. Merge `develop` into `main` => Check => production build and deployment.
3. On failed application health, attempt to restore `.eventgraph-last-good-image`. The first deployment has no prior image to restore; make a backup/snapshot before first activation.

### Caveats
- Because this workflow is triggered by `workflow_run`, GitHub requires the workflow file to exist on the default branch before automatic triggering works. Merge the workflow to main ONLY after review and ensure production environment credentials/branch policies are not prematurely enabled.
- Application-image rollback does **not** reverse database migrations or guarantee data/schema compatibility. Test forward/backward migration compatibility and back up the production DB.
- This release process assumes the server is already provisioned. The GHCR image is pinned to the exact CI-tested SHA, not mutable latest.
- GitHub-hosted runner `GITHUB_TOKEN` grants package push during a workflow. If your GHCR package permissions reject the token, explicitly grant the repository package access or configure a read-only GHCR credential for the target host.
