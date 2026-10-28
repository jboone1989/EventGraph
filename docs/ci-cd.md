# EventGraph CI/CD — promote, don't rebuild

A release uses **one** application image: push to `develop` → Check/E2E → immutable GHCR digest → development deployment; promote the exact successful digest to `main` → VM09 production deployment. No production rebuild.

- Feature PRs (including promotion PRs targeting `main`) still run the repository's required `check`, `docker` and browser checks.
- Only a push to `develop` runs builds and publishes `ghcr.io/jboone1989/eventgraph-app@sha256:...`.
- A push to `main` runs `promote` only. Its `.github/production-image.env` pins both the successful develop SOURCE_SHA and digest; promotion requires successful `check`, `e2e`, `publish` results for that SHA, unchanged application inputs, and an existing digest. The main push never builds a second image.
- The `deploy_production` job runs only if `EVENTGRAPH_PROD_AUTO_DEPLOY=true` is configured. It invokes the existing VM09 `scripts/deploy-prod.sh`. With no configured production SSH, run that script on VM09 through an authorized operator; **merging to main by itself does not deploy**.

## Selective checks by change scope

A `changes` job classifies each change range with `scripts/ci/scope-changes.mjs`, which
reuses the Spec gate's documentation-only file rules. When every changed file is
documentation, the heavy `check` steps, `e2e` and `docker` are skipped through
job/step-level `if:` conditions. That keeps every required check reported — GitHub
records a skipped job as success for branch protection — while documentation PRs still
run the real Spec gate plus `scripts/ci/check-docs.mjs` (offline relative-link and
anchor validation of the changed Markdown) and still receive the independent Claude
review, because the Claude dispatch fires whenever the Check run succeeds. Scope
detection uses the base branch's copy of the detector (the Spec gate's trust model) and
fails closed: any error, empty diff, or any non-documentation file — CI scripts,
workflows, `Dockerfile`, dependencies, `industry/` data, application code — runs the
full pipeline unchanged.

A documentation-only push to `develop` publishes no image and deploys nothing:
`publish` is skipped explicitly and both development deployments then skip through the
existing `needs` chain. Supersession is decided by content, not only by the branch tip:
`publish` and both development deployments run `scripts/ci/release-candidate.mjs`, which
keeps a code release current while every change from its source SHA to the `develop` tip
is documentation-only — a documentation-only push that lands first cannot suppress a
pending code release — and skips the release once any later executable change exists.
The release SHA never moves: a documentation-only tip deploys the earlier code image
unchanged. The check fails closed: an unreadable or diverged branch tip, or any detection
error, skips the release. Code pushes keep the automatic CD above, and the `main`
promotion flow is untouched: promotion still requires successful `check`, `e2e` and
`publish` runs on the pinned source SHA, which by construction is always a published
(non-documentation-only) commit. See `specs/010-ci-change-scope/spec.md`.

## VM09 (production)

Production is `VM-0-9-ubuntu`, in `/home/ubuntu/livingruntime-prod-source`, Compose project `livingruntime`. This differs from the development project. The production script fetches the exact `main` release, validates the pinned develop SHA, pulls the **same** GHCR digest and tags it locally as `livingruntime-app:<main-SHA>`, then reconciles only `api`, `worker`, `web` with `--no-build --pull never --no-deps`. No transfer/build via cn-dev; no DB or Neo4j restart. The production smoke test verifies real news, graph data and default-off AdSense. Schema migrations retain their existing explicit change detection and preflight behavior.

Release command on VM09:

```bash
cd /home/ubuntu/livingruntime-prod-source
bash scripts/deploy-prod.sh --check
bash scripts/deploy-prod.sh
```

Configure the production GitHub environment and `EVENTGRAPH_PROD_HOST`, `EVENTGRAPH_PROD_USER`, `EVENTGRAPH_PROD_SSH_KEY`, `EVENTGRAPH_PROD_SSH_FINGERPRINT` before opting into automatic VM09 deployment. An authorized operator is required when those credentials are absent or an external execution policy blocks the script. Do not use the development `deploy-image.sh` on production.

## Development (cn-dev worker + VM13 Web/API)

A push to `develop` publishes one immutable digest and then deploys it in two
independent jobs — neither gates the other:

- `deploy_vm13_preview` SSHes to VM13 and runs `scripts/ci/deploy-vm13-preview.sh`
  for the Web and API containers, which reach the cn-dev development database
  through the private SSH tunnel (details in `docs/vm13-preview.md`).
- `deploy_dev_worker` first SSHes to VM13, where `scripts/ci/export-image-vm13.sh`
  pulls the digest (VM13 reaches GHCR reliably) and delivers it to cn-dev over
  the pre-authorized VM13→cn-dev SSH path through a registry bound to cn-dev's
  loopback (`127.0.0.1:5000`, reachable only through that path). The push is
  content-addressed — each blob is HEAD-checked and only layers cn-dev does not
  already have are uploaded — so a code-only release ships its app layer instead
  of the full ~146 MB `docker save` stream that repeatedly missed the 20-minute
  deadline across the variable cross-border link (measured ~123 KB/s sustained
  on 2026-10-28, when both attempts of the morning timed out), and a push that
  dies mid-way resumes on retry because uploaded blobs are skipped. The push
  itself runs quiet and every attempt is bounded by one shared 16-minute
  watchdog budget that fits the step's 20-minute command timeout: on
  2026-10-28 the first live run committed every blob and then wedged without
  ever sending the manifest (tunnel and session both healthy), so a hung
  client must be killed by the watchdog — committed blobs survive — and
  return to the resumable loop instead of stalling until the whole script is
  killed. Docker
  treats `127.0.0.0/8` as insecure by default, so the plain-HTTP registry needs
  no daemon configuration on either host; `registry:2` itself is bootstrapped
  once over a compressed one-shot stream. Each successful delivery uses
  transport scratch storage: the registry is seeded from the last local
  cn-dev app image over loopback, so the cross-border push sends only missing
  layers, then after the pulled image ID and digest pairing are verified the
  registry container and volume are removed. If a transfer dies before
  verification, the registry volume is deliberately retained so a workflow
  retry resumes already-uploaded blobs. Rollback images live in cn-dev's local
  image store and are never tied to registry retention.
  Delivery keeps the content-addressed local tag contract
  (`eventgraph-dev:<image ID hex>`) that `deploy-image.sh` asserts: the export
  pulls on cn-dev from the loopback registry, verifies the image ID there and
  records the tag/digest pairing. cn-dev never contacts GHCR. The job then
  SSHes to cn-dev and runs
  `scripts/ci/deploy-image.sh`: the worker-only deploy asserts the local tag
  points at the image named by its own hex and carries the release's
  `org.opencontainers.image.revision` label, runs the idempotent setup
  (migrations + missing-source seed; an advisory lock serializes it against the
  VM13 job's setup), recreates **only the worker**, verifies it runs that image
  and its `settings` heartbeat is fresh, and rolls back to the last good local
  image on failure. No Web/API containers run on cn-dev, and superseded images
  are pruned to keep the host's disk bounded.

A failed worker delivery or deploy never blocks the VM13 preview, and the VM13
job never waits for cn-dev. Both deployments use the pre-existing
`EVENTGRAPH_DEV_*` variables and credentials. The runner pins cn-dev's host key
fingerprint (`secrets.EVENTGRAPH_DEV_SSH_FINGERPRINT`) on its own SSH hops, and
the same pin authorizes the VM13→cn-dev legs: `export-image-vm13.sh` and the
database-tunnel bootstrap in `deploy-vm13-preview.sh` scan both host-key
algorithms sshd offers (ed25519 and ECDSA — the pin may be for either, like the
pinned VM13 key in the workflow) and accept only the scanned key whose
fingerprint matches, writing it to a dedicated `known_hosts.cndev` that is
rewritten on every run and pinning that algorithm for the connection.


### Documentation-only commits and release ordering

Push Check runs use per-commit SHA concurrency groups so later docs commits
cannot replace a pending code build. The publish and both development deploy
gates consider a newer docs-only HEAD non-superseding, but reject any later
executable change. Because checkout defaults to shallow Git history, those
gates fetch complete ancestry on a changed tip before testing git ancestry.
This avoids silently dropping the most recent code release without extending
or changing production deployment permissions.
