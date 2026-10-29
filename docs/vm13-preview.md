# EventGraph development: VM13 Web + API, isolated cn-dev development database

**This is development, not production.** Production remains exclusively on VM09,
with PostgreSQL, Neo4j, API, worker, collection, and public website unchanged.

| Role | Host |
| --- | --- |
| Isolated development PostgreSQL/Neo4j, worker, collection, knowledge stack, Playwright Chromium (no public Web ingress) | cn-dev (43.142.127.40) |
| Development Web + API preview from the tested GHCR digest | VM13 (43.133.185.154) |
| Production | VM09 (untouched) |

VM13 URL: http://43.133.185.154/. Both VM13 containers run the immutable
develop digest; Web reaches only the local API (`http://api:3001`), never
production.

## Database path (private, SSH only)

The development PostgreSQL stays on the cn-dev Compose network with no public
port. `docker-compose.dev-db.yml` (cn-dev only) publishes it on **host loopback
`127.0.0.1:5432`**, and a systemd unit on VM13
(`eventgraph-dev-db-tunnel.service`, written by `scripts/ci/deploy-vm13-preview.sh`)
forwards `127.0.0.1:15432` and `<docker-bridge-gateway>:15432` on VM13 to
`127.0.0.1:5432` on cn-dev over the existing VM13→cn-dev SSH key
(`~ubuntu/.ssh/id_ed25519`, already authorized on cn-dev). The Compose API
service resolves `devdb` to the docker bridge gateway via `host-gateway`, so
`DATABASE_URL` targets `devdb:15432`. No database port is open to the internet
on either host, and no new cloud security-group rule is used.

## GitHub Actions (single pipeline, develop pushes)

1. `check` + `e2e` + published-digest Compose smoke gate `publish`, which builds
   one immutable GHCR digest (`ghcr.io/jboone1989/eventgraph-app@sha256:…`).
2. `deploy_dev_worker` (independent of the VM13 job below; neither gates the
   other) ships the digest to cn-dev **without cn-dev contacting GHCR**:
   `scripts/ci/export-image-vm13.sh` runs on VM13, pulls the digest there and
   delivers it with up to eight pinned-SSH rsync/zstd streams to
   `~/.eventgraph-transfer/parts/`. Failed transfers retain partial chunks;
   all chunks are reassembled into a new archive and checked against the
   complete source SHA256 before replacing `current.tar`. The exact loaded
   Docker image ID and source revision are then verified
   before a content-addressed local tag is recorded (see `docs/ci-cd.md`);
   then
   `scripts/ci/deploy-image.sh` runs on
   cn-dev, asserts the local tag's image ID and
   `org.opencontainers.image.revision` label, stages
   `docker-compose.dev-db.yml` from the exact release SHA, applies the loopback
   DB binding, and recreates only `worker` with digest and heartbeat
   assertions plus rollback to the last good local image. No Web/API containers
   are created on cn-dev.
3. `deploy_vm13_preview` SSHes to VM13 and runs
   `scripts/ci/deploy-vm13-preview.sh`: stages the Compose file from the SHA,
   asserts the image label, refreshes the SSH tunnel unit, recreates
   `api` + `web` (the old read-only Caddy forwarder is gone), verifies the
   running containers use exactly the published digest and the site answers,
   and rolls back on failure.
4. `e2e_vm13_preview` runs `scripts/ci/smoke-vm13.sh` **on cn-dev** against
   VM13: `/api/health` reports `db: ok` and `release` equal to the deployed
   SHA; a real admin password login yields a session and CSRF principal; a
   probe note written through the VM13 API is read back through the API and
   directly from the cn-dev development database, then restored; knowledge
   endpoints return their built-in `disabled` state; Chromium checks the zh/en
   desktop/mobile pages. Production is never contacted.

`vm13.env` (host-only on VM13, never committed) holds
`DATABASE_URL=postgres://aihot:…@devdb:15432/aihot`, `SESSION_SECRET`,
`ADMIN_PASSWORD` and `IMG_PROXY_SIGN_SECRET` (development values, matching
cn-dev).

The VM13 preview is HTTP-only on a public IP; treat everything in it as
development data. Never copy production credentials to VM13 or cn-dev.
