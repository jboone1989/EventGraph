# EventGraph development: VM13 Web preview, production read-only data

**This is development, not production.** Production remains exclusively on VM09,
with PostgreSQL, Neo4j, API, worker, collection, and public website unchanged.

| Role | Host |
| --- | --- |
| Developer workstation, source builds, Pi, Playwright Chromium | cn-dev (43.142.127.40) |
| EventGraph development Web preview + small GET-only Caddy proxy | VM13 (43.133.185.154) |
| API, processing, all live data, public website | VM09 |

VM13 URL: http://43.133.185.154/. No production database credentials
are copied to VM13 or cn-dev. `api-forward` proxies **GET/HEAD only**
to `https://www.livingruntime.com`, rewrites the upstream Host header,
removes Authorization/Cookie and rejects methods that could mutate production.
Do not test admin sign-in, ingestion or mutable operations against production.

GitHub Actions `develop` builds/publishes a pinned GHCR digest, then
`deploy_vm13_preview` deploys only VM13 `api-forward` and `web`,
and `e2e_vm13_preview` executes installed Playwright Chromium **on cn-dev**
against VM13. Existing development CI SSH credentials are reused; no new
secrets and no SSH agent on VM13. The job first checks the current develop
HEAD so stale runs never downgrade Web. The deploy script pulls the exact
image, stages Compose and the Caddyfile from the exact source SHA, validates
Caddy, updates Web and the forwarder, performs health checks and attempts
rollback on failure.

Production `main` deployment is entirely separate. PostgreSQL images and
containers are not data volumes: Docker volumes survive image rebuilds.
The old cn-dev EventGraph stack can be removed **after** the first complete
VM13 CD + cn-dev browser acceptance; never use `docker compose down -v`
against production. If schema or worker tests need a DB, use the existing
isolated `aihot-test-pg` or an ephemeral development DB seeded with a small
non-sensitive production sample, not the production DB.

The VM13 preview is currently HTTP-only on a public IP and is not private
access restricted; avoid credentials and sensitive data in that interface.
