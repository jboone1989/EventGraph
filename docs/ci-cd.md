# EventGraph CI/CD — promote, don't rebuild

A release uses **one** application image: push to `develop` (or validated exact-SHA post-merge re-entry on `develop`) → Check/E2E → immutable GHCR digest → development deployment; promote the exact successful digest to `main` → VM09 production deployment. No production rebuild.

- Feature PRs (including promotion PRs targeting `main`) still run the repository's required `check`, `docker` and browser checks.
- A push to `develop` or a validated exact-SHA post-merge `workflow_dispatch` on `develop` builds and publishes `ghcr.io/jboone1989/eventgraph-app@sha256:...`; documentation-only changes do not publish.
- Only main pushes with release intent run standalone promotion. Its `.github/production-image.env` pins both the successful develop SOURCE_SHA and digest; promotion requires successful `check`, `e2e` and published-image results for that SHA, unchanged application inputs, and an existing digest. The main push never builds a second image.
- The `deploy_production` job runs only if `EVENTGRAPH_PROD_AUTO_DEPLOY=true` is configured. It invokes the existing VM09 `scripts/deploy-prod.sh`. With no configured production SSH, run that script on VM09 through an authorized operator; **merging to main by itself does not deploy**.

## GitHub-native workflow ownership (2026-11-04)

- `Check` validates PRs, develop pushes and immutable-SHA manual dispatch, preserving real `check`, `docker`, `e2e` and the Spec gate. Metadata-only edits no longer rerun heavy CI; manually re-dispatch Check on the current head when retargeting a base.
- An executable successful develop Check invokes `release-develop.yml` **in the same run**; this reusable workflow publishes a pinned GHCR digest and optionally deploys/smoke-tests VM13. No independent `workflow_run` relay or automatic retry.
- `release-main.yml` independently handles main pushes and explicit pinned-SHA releases. Governance-only pushes have no release intent. Real releases validate the immutable develop digest, exact successful Check/E2E/publish status and runtime equivalence. VM09 is guarded by `EVENTGRAPH_PROD_AUTO_DEPLOY=true`.
- GH-AW Worker/Dispatcher and the official native Work Queue remain, including their engine and per-run usage artifacts. GH-AW smoke and strict compilation run only when explicitly requested.
- **Retired:** standalone `claude-pr-dispatch.yml`, `eventgraph-glm-review.yml` and paid `claude-review` requirement. Auto-merge respects GitHub's current real required checks.

## Selective checks by change scope

A `changes` job classifies each change range with `scripts/ci/scope-changes.mjs`, which
reuses the Spec gate's documentation-only file rules. When every changed file is
documentation, the heavy `check` steps, `e2e` and `docker` are skipped through
job/step-level `if:` conditions. That keeps every required check reported — GitHub
records a skipped job as success for branch protection — while documentation PRs still
run the real Spec gate plus `scripts/ci/check-docs.mjs` (offline relative-link and
anchor validation of the changed Markdown) and never trigger a standalone paid model review. Scope
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

## Development (VM13 preview on 185.154)

A push to `develop` (or validated exact-SHA post-merge `workflow_dispatch`)
publishes one immutable digest and then, only when `EVENTGRAPH_DEV_AUTO_DEPLOY=true`,
`deploy_vm13_preview` SSHes to VM13 and runs `scripts/ci/deploy-vm13-preview.sh`
for the Web and API containers, which read the production database directly
through the hardened SSH tunnel (details in `docs/vm13-preview.md`).

The former `deploy_dev_worker` path (export/rsync delivery of the Worker image
to cn-dev) was removed on 2026-11-02 when the development environment stopped
running its own worker and database; the full dump backup of the former
development database lives on cn-dev at `~/aihot-dev-final-20261101.dump`.

### Documentation-only commits and release ordering

Push Check runs use per-commit SHA concurrency groups so later docs commits
cannot replace a pending code build. The publish and the development deploy
gate considers a newer docs-only HEAD non-superseding, but reject any later
executable change. Because checkout defaults to shallow Git history, those
gates fetch complete ancestry on a changed tip before testing git ancestry.
This avoids silently dropping the most recent code release without extending
or changing production deployment permissions.


## Operation and recovery

To re-run CI after editing only PR metadata or retargeting its base, dispatch GitHub `Check` on the current PR branch with the exact 40-character `expected_sha`. To re-release a verified develop SHA, dispatch that same pinned Check on develop. `Release production` accepts only an exact main SHA and never bypasses digest validation or environment gates.
