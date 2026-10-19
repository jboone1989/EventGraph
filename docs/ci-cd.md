# EventGraph CI/CD

This uses the existing GitHub Actions Check and dev-image workflows, official
Docker Actions for GHCR, and Marketplace appleboy/ssh-action for releases.

Feature PR to develop -> Check (including Docker integration).
Push to develop -> Check -> one SHA-pinned GHCR image -> development rollout.
Merge develop to main -> Check -> GHCR image -> production rollout.
The release workflow must be present on the default branch to receive
workflow_run events. It never builds anything on target hosts.

## One-time setup

Create GitHub environments named development and production. Restrict the
development environment to develop, production to main; enable required
reviews for production if desired. Enable branch protection for main.
Configure the following repository variables and environment secrets:

Development:
- Repo vars EVENTGRAPH_DEV_AUTO_DEPLOY=true, EVENTGRAPH_DEV_HOST,
  EVENTGRAPH_DEV_USER, optional EVENTGRAPH_DEV_ROOT
  (defaults to /home/ubuntu/livingruntime-aihot).
- Environment secrets EVENTGRAPH_DEV_SSH_KEY and
  EVENTGRAPH_DEV_SSH_FINGERPRINT (SHA256 host fingerprint).

Production:
- Repo vars EVENTGRAPH_PROD_AUTO_DEPLOY=true, EVENTGRAPH_PROD_HOST,
  EVENTGRAPH_PROD_USER, EVENTGRAPH_PROD_ROOT (required).
- Environment secrets EVENTGRAPH_PROD_SSH_KEY and
  EVENTGRAPH_PROD_SSH_FINGERPRINT.

An environment-specific deploy account must already have Docker/Compose
permissions and read access to GHCR via the workflow token. Each host must
already have its own .env, docker-compose.yml, DB and persistent volumes.
Do not initialize or replace production volumes. Inspect existing Compose
overlays/Neo4j layout before first activation. The script only updates setup,
api, worker and web images; it does not stop DB/Neo4j.

The container image is referenced by immutable digest. Deploys reject stale
branch revisions and check the HTTP health endpoint. A failed health check attempts to restore the previous app image. Before the
first managed release, the script snapshots the image ID from the running web
container; it aborts instead of deploying without a rollback baseline.
Migrations and database backups are a separate, reviewed process; normal image
rollouts never run migrations or re-create the database. Releases that need a
new schema must be coordinated separately.

Do not enable either *_AUTO_DEPLOY switch until one-time prerequisites have
been independently verified. Neither flag requires approval for future pushes.
