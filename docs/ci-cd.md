# EventGraph CI/CD

The test and image delivery pipeline stays in `.github/workflows/check.yml`.
It reuses AIHOT's existing tests, official Docker Actions, and the development-only
Marketplace appleboy/ssh-action. Upstream synchronization only proposes draft PRs.

Feature PR to develop -> Check (including Docker integration).
Push to develop -> Check -> GHCR image -> Compose smoke of that exact digest -> development rollout.
Develop -> main PR -> CI checks (no deployment).
Merge develop to main -> main push Check -> GHCR image and digest smoke only.
Each branch builds its own image; this is not same-digest promotion between environments.
The shared smoke check uses a fresh CI database and verifies the built site and
seeded sources. A failed smoke check exports no deployable image reference.
The image can exist in GHCR before acceptance; its presence or SHA tag alone is
not evidence of a successful release. Deployment consumes the verified digest.
Production deployment is out of scope until its distinct Compose stack and
persistent volumes are audited. Target hosts do not compile code.

## One-time setup

The development GitHub environment is restricted to develop.
The active branch ruleset covers main and develop: require PRs, current-base
`check` and `docker` checks from GitHub Actions, resolved review threads, and no
force pushes or deletion. There are no bypass actors. With one collaborator,
the required approval count is zero; add independent approval when another
reviewer is available. Once the e2e workflow is present on both long-lived
branches, require its check too. PR #60 adds that test and its publish dependency;
keep that dependency when combining workflow changes.
Native merged-branch deletion is enabled after protecting both long-lived
branches. The old branch-hygiene workflow is retired; existing archive tags stay.
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

## Upstream PRs and production prerequisites

Merge upstream synchronization PRs with a merge commit to retain upstream
ancestry. GITHUB_TOKEN-created PRs start as drafts. For a clean proposal, a
maintainer marks it ready; `ready_for_review` then runs normal PR CI. Resolve
blocked proposals before marking them ready. If an older draft predates this
trigger, close and reopen it as a maintainer. A workflow_dispatch run alone
does not satisfy required checks in the branch ruleset. Never bypass protection.

Production remains a separate reviewed release. Before changing its image
transport, publish and validate the independent knowledge image (or explicitly
retain its verified version), record both application and knowledge digests,
and audit the actual livingruntime project, all Compose overlays and volumes.
Do not reuse the development deployment script there. Keep the existing
production environment preflight and real content/graph smoke checks.
For a schema change, verify a current independent backup and restoration
procedure before running migrations; the old production script does not enforce
that backup step. CI migration checks and an application-image rollback are
not a database restoration procedure. The production job is not enabled here.

Development auto deploy passed real CI, GHCR pull and HTTP smoke on cn-dev
(2026-10-19, run 39192329068). Production auto deploy is not implemented.
The SHA-pinned SSH Marketplace Action fetches drone-ssh v1.8.2 at runtime
without independent checksum verification. Risk is accepted for dev only.
