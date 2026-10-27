# EventGraph CI/CD — promote, don't rebuild

A release uses **one** application image: push to `develop` → Check/E2E → immutable GHCR digest → development deployment; promote the exact successful digest to `main` → VM09 production deployment. No production rebuild.

- Feature PRs (including promotion PRs targeting `main`) still run the repository's required `check`, `docker` and browser checks.
- Only a push to `develop` runs builds and publishes `ghcr.io/jboone1989/eventgraph-app@sha256:...`.
- A push to `main` runs `promote` only. Its `.github/production-image.env` pins both the successful develop SOURCE_SHA and digest; promotion requires successful `check`, `e2e`, `publish` results for that SHA, unchanged application inputs, and an existing digest. The main push never builds a second image.
- The `deploy_production` job runs only if `EVENTGRAPH_PROD_AUTO_DEPLOY=true` is configured. It invokes the existing VM09 `scripts/deploy-prod.sh`. With no configured production SSH, run that script on VM09 through an authorized operator; **merging to main by itself does not deploy**.

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
  pulls the digest (VM13 reaches GHCR reliably) and streams it to cn-dev over the
  pre-authorized VM13→cn-dev SSH path. `docker save | docker load` cannot carry
  registry digest references, so delivery uses a content-addressed local tag
  (`eventgraph-dev:<image ID hex>`); the export verifies the loaded image ID on
  cn-dev and records the tag/digest pairing there. cn-dev never contacts the
  registry. The job then SSHes to cn-dev and runs
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
