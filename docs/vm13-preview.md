# VM13 development preview · production database, writable by administrator

**Development build, but REAL production data.** The operator explicitly approved
admin writes from VM13 on 2026-11-03, rather than paying for a separate dev DB.
VM13 hosts only the develop Web/API; it connects to the existing VM09 production
PostgreSQL over the pinned private SSH tunnel. No extra VM, DB or preview worker
is created. Changes made via the preview admin (providers, API credentials,
model bindings, editorial notes and other mutable records) immediately affect
**production data**. Preview code can differ from the production app, so do not
experiment with destructive actions or unsupported schema in this interface.

| Host | Responsibility |
| --- | --- |
| VM13 (43.133.185.154) | Development Web + API from the checked develop GHCR digest |
| GitHub-hosted Actions | Deployment orchestration and direct Chromium preview acceptance |
| VM09 | Existing production database, graph and services; never deployed by this pipeline |

Preview URL: http://43.133.185.154/.

## Private data path and writable administration

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

VM13 uses `EVENTGRAPH_PREVIEW_READONLY=false` and
`EVENTGRAPH_PREVIEW_MODE=true`: the former permits PostgreSQL write
transactions; the latter prevents the preview API from starting another
heartbeat or worker watchdog. The preview API enables `MODEL_CALLS_ENABLED=true` solely to allow the administrator to explicitly test configured models against their upstream API; this can incur provider usage charges. No collector/worker runs on VM13, and a failed or missing credential is not treated as an ambiguous provider receipt.
The preview runs **no** `migrate.ts`,
`seed.ts` or worker. Schema changes belong only to the separately gated
production release. Newly developed features requiring tables not yet present
in production may remain unavailable until their production schema release.

Before restarting Web/API, VM13 runs `scripts/ci/vm13-db-write-probe.ts`
inside the exact image/container environment. This inserts a uniquely named
settings row, reads it back, and **always ROLLBACKs**, leaving no record.
Missing write permission or a read-only DB session fails deployment and rolls
the preview services back. Public browser smoke requires
`/api/health.dbReadOnly === false` plus the exact deployed SHA; it remains
non-mutating. The DB tunnel and port exposure do not change.

**Shared encryption-key requirement:** Provider API keys written to the shared
production database must decrypt on the production worker as well as VM13.
Set the **same** `MODEL_CREDENTIAL_ENCRYPTION_KEY` securely in both VM13
`vm13.env` and VM09 production API/worker environments, and preserve it across
restarts and backups. An automatically generated key on VM13's local /data
volume is **not** automatically shared with VM09. Do not paste keys into the
repository or GitHub logs. This setting is separate from PostgreSQL write
permission; without a shared key, cross-host use of newly saved credentials
is not verified. The preview URL currently uses HTTP; configure HTTPS before
entering real production API secrets through a public network.

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
3. `e2e_vm13_preview` runs in GitHub-hosted Actions, using the pinned
   Playwright image to check the deployed source SHA, `db: ok`,
   `dbReadOnly: false`, public daily archive and knowledge endpoints,
   and Chromium zh/en desktop/mobile pages. The deploy already proved writes
   through a rolled-back transaction.

**Acceptance after the 2026-11-03 decision:** no separate cn-dev DB or worker;
no preview migrations/seeding. The transactional write/readback/rollback probe
replaces any earlier permanently mutating admin-note smoke. Do not infer that
`develop` deploy has upgraded production schema, or that its admin edits are
isolated from live operations.

No cn-dev SSH connection, development database, or cn-dev Playwright installation is required.

A successful PR check or image publish is **not** proof of VM13 deployment.
The deploy job and the subsequent GitHub-hosted browser smoke must both succeed.

### NVIDIA free-catalogue correction (2026-11-03)

The previous one-time 81-model catalogue was not a list of free API endpoints. The deployment importer now admits only the 15 NVIDIA-documented Free Endpoint candidates from `VERIFIED_FREE_TRIAL_ENDPOINTS`. On the historical VM13-connected production table it reconciles the earlier bootstrap exactly once, deleting only unedited `seed-catalogue` rows from the original connection, excluding workflow-referenced, aliased, user-edited and manually added records. The NVIDIA provider and its saved API Key remain untouched. The audit and `nvidia.registeredModelsFreeOnly.v2` marker record totals. A Free Endpoint listing is not a guarantee of live API entitlement, so each candidate still needs an individual manual probe; no automatic model sweeps run.
