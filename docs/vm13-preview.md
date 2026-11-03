# VM13 development preview · production data, read-only

**Development preview, never a production deployment.** As of the operator's
2026-11-02 topology change, VM13 runs only the develop Web and API; neither
VM13 nor cn-dev runs a development database or collection worker. VM09 remains
the production service host and is not updated by this workflow.

| Host | Responsibility |
| --- | --- |
| VM13 (43.133.185.154) | Development Web + API from the checked develop GHCR digest |
| cn-dev (43.142.127.40) | Development checks and Playwright preview acceptance |
| VM09 | Existing production database, graph and services; never deployed by this pipeline |

Preview URL: http://43.133.185.154/.

## Private data path and hard read-only boundary

VM13 opens an SSH tunnel to the production data host; it binds PostgreSQL on
VM13 loopback and the Docker bridge gateway only. The VM13 Compose service
resolves `devdb:15432` to that gateway; **devdb is an alias, not a separate
cn-dev database**. Production database access remains private.

Host identity checks are distinct:

- GitHub Actions → VM13: VM13's own pinned SSH host key.
- VM13 → production tunnel: **independently verified production host key**,
  supplied to the development job as `EVENTGRAPH_PROD_SSH_FINGERPRINT`.
  The script exports it as `EVENTGRAPH_PROD_TUNNEL_HOST_FINGERPRINT`.
  This must never reuse cn-dev's `EVENTGRAPH_DEV_SSH_FINGERPRINT`.
  An absent or mismatched pin aborts the release; `ssh-keyscan` only retrieves
  candidates and does not establish trust.

VM13's API sets `EVENTGRAPH_PREVIEW_READONLY=true`. Postgres.js starts its
database sessions with `default_transaction_read_only`; the health endpoint
reports the **live** session's `dbReadOnly`, which acceptance requires to be
`true`. The preview omits database heartbeat/watchdog updates and analytics
storage. It runs **no** `migrate.ts` or `seed.ts`, and the smoke check performs
**no** login, note-write or other state-mutating probes against the production
database. Schema changes and seeding are managed by production's separately
gated release, not by the development preview.

The host-only `vm13.env` provides the database connection and existing API
credentials; it is never committed. Do not add production credentials to the
repository or to cn-dev.

## One pipeline

1. `develop` passes `check` + `e2e`, publishes an immutable GHCR digest
   and smoke-tests that exact digest.
2. `deploy_vm13_preview` logs in to VM13, verifies the **separately pinned**
   production tunnel host key, pulls the digest, stages the exact release's
   Compose file, and restarts only the VM13 `api` and `web` services.
   It compares their image IDs against the published digest and checks health;
   on failure it restores the previous Compose and image.
3. `e2e_vm13_preview` runs on cn-dev, checks the deployed source SHA,
   `db: ok`, `dbReadOnly: true`, public daily archive and knowledge endpoints,
   and Chromium zh/en desktop/mobile pages. This is intentionally read-only.

**Acceptance after the 2026-11-02 topology change:** the old Spec 008
requirements for a private cn-dev database, VM13 migrations/seeding, password
session creation, and admin notes write/readback are no longer valid for a
production-backed preview. These checks would mutate production data; the
non-mutating checks and live read-only assertion above supersede them.

A successful PR check or image publish is **not** proof of VM13 deployment.
The deploy job and the subsequent cn-dev browser smoke must both succeed.
