# 008 · Development CD: VM13 Web+API on the isolated cn-dev development database

- **Approval source**: user-approved development topology of 2026-10-25 (session instruction to the cn-dev implementation agent): VM13 43.133.185.154 hosts the development Web **and** API as separate containers with Web talking only to the local API; cn-dev VM-0-5 hosts the isolated development PostgreSQL/Neo4j and the worker/ingest/model workloads; VM09 production is untouched. Amended by the 2026-10-26 session instruction: the development database stays private — reached over the existing VM13→cn-dev SSH connectivity, not through a public DB port. This spec is the written form of that approval; it is a draft until the PR is reviewed.
- **Replaces**: the read-only VM13 Web preview that proxied production `www.livingruntime.com` (merged in d45e249), and the claim that cn-dev is only a Playwright runner.

## User-visible behavior

1. `develop` pushes that pass `check` + `e2e` publish one immutable GHCR digest (unchanged), then in one pipeline:
   - There is **no cn-dev image-deployment gate**. cn-dev hosts the worker/ingest/models and private databases, but no Web/API or public development Web ingress. cn-dev's unreliable GHCR pull must never delay VM13.
   - After VM13 pulls the immutable digest and opens its private tunnel to cn-dev PostgreSQL, it runs idempotent `migrate.ts` + `seed.ts` **inside the pinned VM13 image** before restarting Web/API. The seed inserts only missing sources; operator changes survive. Production `deploy-prod.sh` runs setup independently.
   - `deploy_vm13_preview` deploys **api + web** containers from that digest to VM13; Web reaches only `http://api:3001` locally; the read-only Caddy forwarder is removed.
   - `e2e_vm13_preview` runs on cn-dev and accepts the deployment.
2. VM13's API connects to the cn-dev development PostgreSQL through an SSH tunnel from VM13 to cn-dev using the pre-existing, pre-authorized VM13 host key; the database is published only on cn-dev host loopback (`docker-compose.dev-db.yml`) and the tunnel port only on VM13 loopback plus the Docker bridge gateway. No database port is exposed to the internet on either host; no new security-group rule is used.
3. Acceptance (smoke on cn-dev) proves, without ever contacting production:
   - `/api/health` on VM13 reports `ok`, `db: ok` and `release` equal to the deployed source SHA; deployment verifies image revision label and both VM13 containers' exact published digest. **Do not expect cn-dev's Worker to share this SHA until independent Worker-only delivery is implemented.**
   - A real admin password login (`/api/auth/password`) yields a session; `/api/admin/me` returns the CSRF principal.
   - A non-destructive write (`POST /api/admin/notes`) through the VM13 API is read back through the API **and** directly from the cn-dev development database, then the previous note state is restored.
   - The browser pages checks (zh/en, desktop/mobile, no console errors, no overflow) still pass.
4. Knowledge-graph HTTP endpoints on VM13 return their built-in `disabled` state (`GRAPHITI_API_URL` unset; the Graphiti service stays on cn-dev); nothing errors.

## Out of scope

- VM09 production, its secrets and data; the promotion flow; new cloud security-group ports; moving the worker or knowledge stack off cn-dev; automatically updating cn-dev Worker (a separate delivery path is needed, with no direct cn-dev GHCR pull).

## Activation and English report acceptance (2026-10-26 approved scope)

- VM13 development setup and the separate production release each insert missing `sourceLifecycle.discovery={enabled:true,maxGaps:6,maxCandidates:8}` and `sourceLifecycle.autoPromote={enabled:true}` through the existing seed; operator edits are not overwritten. The existing `cron.sources.discover` runs daily only when collection is enabled; DeepSeek credentials and request budget must be present for actual searches.
- The English report latest-page requests an English-aware index and carries `titleEn` into the left archive menu. Prefer the source's original English title to a model-translated title, falling back to saved English copy for Chinese-language originals; do not translate on page view.
- Published-image smoke verifies both activation keys in a fresh DB. VM13 acceptance checks its release SHA, real development DB read/write and browser pages; cn-dev Worker version and active discovery credentials/budgets are tracked independently, never assumed from VM13 Web success. Production acceptance follows its own promotion.

## Acceptance criteria

| # | Criterion | Evidence |
| --- | --- | --- |
| AC-1 | VM13 runs `api` + `web` from the pinned digest; no `api-forward` container | `docker ps` on VM13; `scripts/ci/deploy-vm13-preview.sh` |
| AC-2 | VM13 Web calls only the local API | `docker-compose.vm13-preview.yml` (`API_BASE_URL: http://api:3001`) |
| AC-3 | VM13 API reaches the cn-dev dev DB only via the SSH tunnel (loopback/bridge bindings, no public DB port) | `docker-compose.dev-db.yml` + `eventgraph-dev-db-tunnel.service` written by the deploy script; `ss -ltn` on both hosts |
| AC-4 | VM13 runs the published digest's migration and additive source seed over the private tunnel before Web/API recreation; cn-dev is not asked to pull GHCR or run Web/API | `scripts/ci/deploy-vm13-preview.sh` + VM13 development DB source counts |
| AC-5 | Smoke asserts SHA, health, admin login, write/readback+restore, knowledge disabled, browser pages | `scripts/ci/smoke-vm13.sh` run on cn-dev |
| AC-6 | Production never contacted by dev CD/smoke | URL whitelist in smoke; no production host in compose/scripts |
| AC-7 | Rollback restores the previous VM13 services on failure | deploy script `restore()` |

## 2026-10-27 superseding operator decision

VM13 alone runs the development Web/API, while cn-dev remains the private database and Worker host. The former cn-dev `deploy_development` dependency contradicted this design and made VM13 CD dependent on unreliable image pulls. This revision supersedes AC-4 and the former dual-host application deployment; source seeding migrates to VM13 over the private database tunnel. Worker-only delivery remains a separate acceptance item, not silently treated as successful when only VM13 updated.

## 2026-10-28 delivery transport amendment (draft, pending review)

Issue #176 T04 dispatch after the second 20-minute delivery failure of 2026-10-28 (run 40625762383 job 122612277831, then run 40627545256): `docker save | gzip | ssh docker load` ships every layer of the image on every release (~146 MB compressed), and the measured cross-border VM13→cn-dev throughput that morning (~123 KB/s sustained) cannot move that inside any bounded timeout — the #197 gzip already shipped the smaller stream and both attempts still timed out (one finished server-side 21 minutes in, after the job had failed). The transport changes, not the timeout: VM13 now pushes into a `registry:2` bound to cn-dev's loopback (`127.0.0.1:5000`, no new port on either host, reachable only through the pre-authorized VM13→cn-dev SSH path — the same pinned-key connection as the database tunnel), so only blobs cn-dev does not already have cross the link, and a push that dies mid-way resumes on the next attempt because already-uploaded blobs are skipped. Docker treats `127.0.0.0/8` as insecure by default, so the plain-HTTP loopback registry needs no daemon configuration. cn-dev still never contacts GHCR; delivery still ends with the verified image ID, the `eventgraph-dev:<image ID hex>` local tag and the tag/digest pairing file that `deploy-image.sh` asserts, so the deploy contract of this spec is unchanged. Rollback images keep living in cn-dev's own image store; the registry is pruned to roughly one release of blobs.

The relay's cold start is seeded: bootstrap pushes an image cn-dev already holds (the last delivered tag, or any local `eventgraph-dev` image) into the registry over cn-dev's own loopback — disk speed, zero cross-border bytes — so consecutive releases' shared layers are present before the first VM13 push, and only a base-image bump can approach full size on first push (resumable across retries regardless). Host-key pinning (ed25519+ECDSA scan, single verified key in a dedicated `known_hosts.cndev`, algorithm pinned per connection) is unchanged from the 2026-10-27 amendment and is reused byte-identically by the tunnel bootstrap in `deploy-vm13-preview.sh` (enforced by test).
