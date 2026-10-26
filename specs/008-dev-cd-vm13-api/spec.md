# 008 · Development CD: VM13 Web+API on the isolated cn-dev development database

- **Approval source**: user-approved development topology of 2026-10-25 (session instruction to the cn-dev implementation agent): VM13 43.133.185.154 hosts the development Web **and** API as separate containers with Web talking only to the local API; cn-dev VM-0-5 hosts the isolated development PostgreSQL/Neo4j and the worker/ingest/model workloads; VM09 production is untouched. Amended by the 2026-10-26 session instruction: the development database stays private — reached over the existing VM13→cn-dev SSH connectivity, not through a public DB port. This spec is the written form of that approval; it is a draft until the PR is reviewed.
- **Replaces**: the read-only VM13 Web preview that proxied production `www.livingruntime.com` (merged in d45e249), and the claim that cn-dev is only a Playwright runner.

## User-visible behavior

1. `develop` pushes that pass `check` + `e2e` publish one immutable GHCR digest (unchanged), then in one pipeline:
   - `deploy_development` (restored job) updates the cn-dev development app (api/worker/web) against the cn-dev development database; cn-dev's public 80/8080 Web ingress, database container, knowledge stack and data volumes are untouched.
   - `deploy_vm13_preview` deploys **api + web** containers from that digest to VM13; Web reaches only `http://api:3001` locally; the read-only Caddy forwarder is removed.
   - `e2e_vm13_preview` runs on cn-dev and accepts the deployment.
2. VM13's API connects to the cn-dev development PostgreSQL through an SSH tunnel from VM13 to cn-dev using the pre-existing, pre-authorized VM13 host key; the database is published only on cn-dev host loopback (`docker-compose.dev-db.yml`) and the tunnel port only on VM13 loopback plus the Docker bridge gateway. No database port is exposed to the internet on either host; no new security-group rule is used.
3. Acceptance (smoke on cn-dev) proves, without ever contacting production:
   - `/api/health` on VM13 reports `ok`, `db: ok` and `release` equal to the deployed source SHA; the deploy scripts additionally verified the pulled image's `org.opencontainers.image.revision` label and that the running containers use exactly the published digest (both hosts).
   - A real admin password login (`/api/auth/password`) yields a session; `/api/admin/me` returns the CSRF principal.
   - A non-destructive write (`POST /api/admin/notes`) through the VM13 API is read back through the API **and** directly from the cn-dev development database, then the previous note state is restored.
   - The browser pages checks (zh/en, desktop/mobile, no console errors, no overflow) still pass.
4. Knowledge-graph HTTP endpoints on VM13 return their built-in `disabled` state (`GRAPHITI_API_URL` unset; the Graphiti service stays on cn-dev); nothing errors.

## Out of scope

- VM09 production, its secrets and data; the promotion flow; new ports in the cloud security group; new SSH keys or forwarders; moving the worker or the knowledge stack off cn-dev; changes to cn-dev's public 80/8080 ingress.

## Acceptance criteria

| # | Criterion | Evidence |
| --- | --- | --- |
| AC-1 | VM13 runs `api` + `web` from the pinned digest; no `api-forward` container | `docker ps` on VM13; `scripts/ci/deploy-vm13-preview.sh` |
| AC-2 | VM13 Web calls only the local API | `docker-compose.vm13-preview.yml` (`API_BASE_URL: http://api:3001`) |
| AC-3 | VM13 API reaches the cn-dev dev DB only via the SSH tunnel (loopback/bridge bindings, no public DB port) | `docker-compose.dev-db.yml` + `eventgraph-dev-db-tunnel.service` written by the deploy script; `ss -ltn` on both hosts |
| AC-4 | cn-dev worker/api/web auto-update on develop publish from the exact SHA | restored `deploy_development` job + `scripts/ci/deploy-image.sh` |
| AC-5 | Smoke asserts SHA, health, admin login, write/readback+restore, knowledge disabled, browser pages | `scripts/ci/smoke-vm13.sh` run on cn-dev |
| AC-6 | Production never contacted by dev CD/smoke | URL whitelist in smoke; no production host in compose/scripts |
| AC-7 | Rollback restores the previous VM13 services on failure | deploy script `restore()` |
