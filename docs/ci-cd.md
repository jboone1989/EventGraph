# EventGraph CI/CD

One GitHub workflow: `.github/workflows/check.yml`. It composes the existing
checks, official Docker Actions, and the Marketplace appleboy/ssh-action.

Feature PR to develop -> Check (including Docker integration).
Push to develop -> Check -> one SHA-pinned GHCR image -> development rollout.
Develop -> main PR -> CI checks (no deployment).
Merge develop to main -> main push Check -> GHCR image publish only.
Production deployment is out of scope until its distinct Compose stack and
persistent volumes are audited. Target hosts do not compile code.

## One-time setup

Create a GitHub environment named development, restricted to develop.
Require successful PR checks and review before merging to main.
Configure these development repository variables and environment secrets:

Development:
- Repo vars EVENTGRAPH_DEV_AUTO_DEPLOY=true, EVENTGRAPH_DEV_HOST,
  EVENTGRAPH_DEV_USER, optional EVENTGRAPH_DEV_ROOT
  (defaults to /home/ubuntu/livingruntime-aihot).
- Environment secrets EVENTGRAPH_DEV_SSH_KEY and
  EVENTGRAPH_DEV_SSH_FINGERPRINT (SHA256 host fingerprint).

Production deployment is intentionally disabled. Do not use this development
script on production. The existing production release requires Compose project
`livingruntime` plus `docker-compose.production.yml`, knowledge and release
overlays. Audit and integrate it separately before introducing an automated job.

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

Development auto deploy passed real CI, GHCR pull and HTTP smoke on cn-dev
(2026-10-19, run 39192329068). Production auto deploy is not implemented.
The SHA-pinned SSH Marketplace Action fetches drone-ssh v1.8.2 at runtime
without independent checksum verification. Risk is accepted for dev only.
