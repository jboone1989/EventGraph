# EventGraph VM13 development preview (2026-10-25)

This is a **single-viewer development/test deployment, not production**.
VM09 continues to host the production site and remains untouched.
Ferro has an independent deployment lifecycle.

## Current placement

| Component | Location |
| --- | --- |
| EventGraph Web/SSR preview | VM13 `43.133.185.154` |
| API, worker, ingestion, model calls, PostgreSQL, Neo4j | cn-dev `10.0.0.5` |
| Production EventGraph | VM09 |

VM13 runs only one stateless service: `eventgraph-vm13-preview-web-1`.
Its public Web entrypoint is `http://43.133.185.154/`.
The server-side `API_BASE_URL` points to the existing cn-dev HTTP ingress at `http://43.142.127.40`, which proxies `/api` to cn-dev's API container. There are no extra database, worker, collection, inference, or credential copies on VM13.

## Existing deployed release

VM13 repository: `/home/ubuntu/workspace/eventgraph`, branch `develop`.
Release source SHA `11478d2a9201f11094b97d5234bd882aaa54a246`.
Immutable OCI image digest `sha256:3e49688ddae5428028d598c11217a40ff8afd0c60d194ce046cbc1413ac2d2c7`.
Standalone Compose file: `docker-compose.vm13-preview.yml` (not combined with the repository's default `aihot` Compose project).

```bash
cd /home/ubuntu/workspace/eventgraph
sudo docker compose -f docker-compose.vm13-preview.yml config --quiet
sudo docker compose -f docker-compose.vm13-preview.yml up -d --no-build --pull never
sudo docker compose -f docker-compose.vm13-preview.yml ps
curl -I http://127.0.0.1/
curl -i http://127.0.0.1/api/health
```

On 2026-10-25: the image pull and Compose startup succeeded; container health was `healthy`; VM13 `/` and `/api/health` returned HTTP 200 locally; cn-dev received HTTP 200 from VM13's public `/` URL. No changes were made to the cn-dev API/DB/worker stack.

## Current limitations

- This is an HTTP preview exposed on port 80, **not an access-restricted/private or TLS-protected endpoint**. Avoid entering administrator passwords or sensitive data until HTTPS plus access control is configured.
- Cross-host API calls traverse the public cn-dev HTTP ingress; this is acceptable for basic public-content browser smoke tests, not confidential testing.
- `/api/mcp` initialization via a bare-IP Host can return 421 `misdirected_request` because of the existing cn-dev Host allowlist; ordinary pages and `/api/health` were verified separately.
- Test UI regressions with Chromium rather than relying on HTTP 200 alone.
- For a later update, build/publish a tested `develop` image in the existing CI, update the immutable digest in the standalone Compose file, and recreate only this VM13 Web container. Never run the default `docker-compose.yml` on VM13.

The VM13 development preview is intentionally independent of the production release procedure in `docs/production-deployment.md`.

## Browser verification (2026-10-25)

Playwright Chromium 1.61.1 ran from cn-dev against VM13 public HTTP: desktop `/`, `/en`, `/daily`, `/en/daily` and mobile `/en/daily` (390×844). All five navigations succeeded. No `pageerror`, console error, or horizontal overflow was found by the existing `e2e/site.ts`-style check. The English daily H1 was `Daily brief · October 25, 2026 · Sun` and the HTML title `Daily brief · EventGraph`.

English content can still contain Chinese original publisher headlines and a Chinese quiet-report lead (`今日安静，无大事发生`), produced by the cn-dev report pipeline/template; this reproduces on cn-dev and is not caused by moving the Web service. Screenshot files were generated on cn-dev under `/tmp/vm13-shots/`, but no manual visual overlap inspection was completed; zero horizontal overflow does not prove that all text and tabs never overlap.

## Development CI/CD after splitting Web and API

This deployment has exactly one CI image source: the existing `develop`
GitHub Actions checks/builds/GHCR digest. Pull requests still run isolated
Playwright E2E in GitHub-hosted CI. The **deployed** browser smoke runs on
cn-dev, targeting VM13 (Chromium is not installed on VM13).

When `EVENTGRAPH_DEV_AUTO_DEPLOY=true` and the existing cn-dev SSH
deployment succeeds, the additional jobs in `.github/workflows/check.yml`
can deploy the same tested digest to VM13 and execute cn-dev's Chromium smoke.

The VM13 Web deployment uses the **existing** development auto-deploy gate
`EVENTGRAPH_DEV_AUTO_DEPLOY=true` and the **same** development SSH private-key
secret `EVENTGRAPH_DEV_SSH_KEY`, to avoid creating a second credential or
manual GitHub variable. The matching public key was appended to
`ubuntu@VM13:~/.ssh/authorized_keys` on 2026-10-25 while preserving existing
keys. The host key is verified against the fingerprint read directly from VM13
(`SHA256:UfYGtQUohibqwf71gOna4qLk7iJsTqlzA4+vMwp4daw`).
The target is fixed at `ubuntu@43.133.185.154`; optional
`EVENTGRAPH_VM13_URL` defaults to `http://43.133.185.154`.

The job runs `scripts/ci/deploy-vm13-preview.sh` through the existing SSH
Action. It pulls the immutable digest, reconciles **only** the Web service,
performs two HTTP checks and tries the previous Web image if these fail.
After successful deployment `scripts/ci/smoke-vm13-browser.sh` executes on
cn-dev using its already-installed Chromium. No databases, workers or
knowledge services are started on VM13.

The CI key's public half is installed on VM13, but a green pull-request CI
run alone does not demonstrate the real end-to-end SSH deployment. Verify the
first develop push's deploy_vm13_preview and e2e_vm13_preview job logs.
VM09 production remains entirely separate.
