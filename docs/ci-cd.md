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

The development deployment continues to use its pre-existing `EVENTGRAPH_DEV_*` variables and credentials; slow GHCR downloads there do not change the already verified image's release identity.
