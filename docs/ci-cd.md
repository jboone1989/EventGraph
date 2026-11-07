# EventGraph CI/CD — promote, don't rebuild

A release uses **one** application image: push to `develop` (or validated exact-SHA post-merge re-entry on `develop`) → Check/E2E → immutable GHCR digest → development deployment; promote the exact successful digest to `main` → VM09 production deployment. No production rebuild.

- Feature PRs (including promotion PRs targeting `main`) still run the repository's required `check`, `docker` and browser checks.
- A push to `develop` or a validated exact-SHA post-merge `workflow_dispatch` on `develop` builds and publishes `ghcr.io/jboone1989/eventgraph-app@sha256:...`; documentation-only changes do not publish.
- Only main pushes with release intent run promotion. A true `develop → main` **merge commit** identifies the develop second parent; the workflow takes the newest runtime-equivalent first-parent ancestor with a successful develop publish check, then resolves the digest from that ancestor's exact `sha-<SHA>` tag. A runtime change before any verified candidate blocks promotion, rather than deploying an old digest. The stale `.github/production-image.env` is retired.
- The `deploy_production` job still requires `EVENTGRAPH_PROD_AUTO_DEPLOY=true`, valid SSH configuration and the production environment. It passes the exact main SHA, selected develop SHA and immutable digest to VM09; deployment rejects mismatches. If production SSH is unavailable, the publish validation can succeed while host deployment is skipped. No success claim without host smoke.

## 分支继承与发布规则（2026-11-07）

- 唯一功能路径：`feature/* → develop → main`。所有功能修复先入 `develop`，`main` 仅接受同仓库 `develop` 作为 PR 来源，代码审核、Spec 和 CI 不变。
- **`develop → main` 必须 Merge Commit，不得 Squash/Rebase。** 这样生产工作流可以可靠读取第二父提交，并精确对应到 GitHub 中已验证的开发镜像。必须保留 GitHub 分支保护和发布完整性检查。
- `main` 每次合并天然多一个发布合并提交，因此在没有 main-only 运行代码时，**不必创建 `main → develop` 历史回同步 PR**。它会制造额外的 PR、CI 和分叉数，而不会解决发布问题。禁止为了清除 ahead/behind 数字而反复合并。
- 主分支仍受保护，不直接推送、不强制推送，不再手动更新 `production-image.env`；发布工作流自动使用经验证的 GHCR 不可变 digest。

## GitHub-native workflow ownership (2026-11-04)

- `Check` validates PRs, develop pushes and immutable-SHA manual dispatch, preserving real `check`, `docker`, `e2e` and the Spec gate. Metadata-only edits no longer rerun heavy CI; manually re-dispatch Check on the current head when retargeting a base.
- An executable successful develop Check invokes `release-develop.yml` **in the same run**; this reusable workflow publishes a pinned GHCR digest and optionally deploys/smoke-tests VM13. No independent `workflow_run` relay or automatic retry.
- `release-main.yml` independently handles main pushes and explicit pinned-SHA releases. Governance-only pushes have no release intent. Real releases validate the immutable develop digest, exact successful Check/E2E/publish status and runtime equivalence. VM09 is guarded by `EVENTGRAPH_PROD_AUTO_DEPLOY=true`.
- GH-AW Worker/Dispatcher and the official native Work Queue remain, including their engine and per-run usage artifacts. The native queue continuation responds to successful develop Check, successful Worker completion, eligible Agent PR close, or explicit manual dispatch; failed Workers cannot spawn an automatic retry loop. Failures are visible on that queue workflow, not as false CI failures. GH-AW compiled locks are maintained using the official CLI, without separate smoke or compile Actions. GitHub's built-in auto-delete merged branches handles branch cleanup.
- **Retired:** standalone `claude-pr-dispatch.yml`, `eventgraph-glm-review.yml`, manual GH-AW smoke/compile Actions, one-shot Work acceptance and custom branch pruning; Claude Review is a single conditional CI Job, not an independent workflow. Auto-merge respects GitHub's current real required checks.

## Selective checks by change scope

A `changes` job classifies each change range with `scripts/ci/scope-changes.mjs`, which
reuses the Spec gate's documentation-only file rules. When every changed file is
documentation, the heavy `check` steps, `e2e` and `docker` are skipped through
job/step-level `if:` conditions. That keeps every required check reported — GitHub
records a skipped job as success for branch protection — while documentation PRs still
run the real Spec gate plus `scripts/ci/check-docs.mjs` (offline relative-link and
anchor validation of the changed Markdown) and never trigger the paid Claude Review job. Scope
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
`publish` runs on the automatically selected develop source SHA, which is always a published
(non-documentation-only) commit. See `specs/010-ci-change-scope/spec.md`.

## VM09 (production)

Production is `VM-0-9-ubuntu`, in `/home/ubuntu/livingruntime-prod-source`, Compose project `livingruntime`. This differs from the development project. The production script fetches the exact `main` release, validates the automatically selected develop SHA and main SHA, pulls the **same** GHCR digest and tags it locally as `livingruntime-app:<main-SHA>`, then reconciles only `api`, `worker`, `web` with `--no-build --pull never --no-deps`. No transfer/build via cn-dev; no DB or Neo4j restart. The production smoke test verifies real news, graph data and default-off AdSense. Schema migrations retain their existing explicit change detection and preflight behavior.

Normal release is automatic via `.github/workflows/release-main.yml` on a verified `main` merge. For manual recovery, dispatch that workflow on the current `main` with its exact 40-character `expected_sha` instead of editing or relying on old pin files. Host `scripts/deploy-prod.sh` now requires the validated source SHA, digest and main SHA together; running it without those values fails closed.

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



## Claude Review (one job inside Check)

- `claude-review` runs only for same-repo code PRs after `check`, `docker` and `e2e` succeeded; documentation-only PRs never invoke a paid model. There is no second AI verification round or separate reviewer workflow. The reviewer output is one structured verdict: concrete blockers are commented on the PR and the review job fails.
- Provider: official `anthropics/claude-code-action@v1` using the OpenRouter Anthropic endpoint `https://openrouter.ai/api` (override via repository variable `CLAUDE_REVIEW_BASE_URL`). Store the API key in GitHub Actions secret `OPENROUTER_API_KEY` (the API key stored in EventGraph's model-management database is not a GitHub secret); choose the model using optional variable `CLAUDE_REVIEW_MODEL`. Do not use the old GLM default or GH-AW engine configuration for this review.
- Once a successful reviewer execution is verified, add `claude-review` to each target branch's required status checks. The existing required job IDs remain `check`, `docker`, `e2e`, even though workflow runs now have descriptive names. GitHub branch rules, not an external review bot, remain the merge authority.

For GH-AW source edits, compile with `gh aw compile eventgraph-worker eventgraph-dispatcher --strict --approve --no-check-update`, commit the generated lock files and let normal PR CI validate them. For queue diagnostics use `gh aw work-queue --repo jboone1989/EventGraph stats --json`; no smoke workflow is needed.

## Operation and recovery

To re-run CI after editing only PR metadata or retargeting its base, dispatch GitHub `Check` on the current PR branch with the exact 40-character `expected_sha`. To re-release a verified develop SHA, dispatch that same pinned Check on develop. `Release production` accepts only an exact main SHA and never bypasses digest validation or environment gates.
