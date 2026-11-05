# EventGraph CI/CD — promote, don't rebuild

A release uses **one** application image: push to `develop` (or validated exact-SHA post-merge re-entry on `develop`) → Check/E2E → immutable GHCR digest → development deployment; promote the exact successful digest to `main` → VM09 production deployment. No production rebuild.

- Feature PRs (including promotion PRs targeting `main`) still run the repository's required `check`, `docker` and browser checks.
- A push to `develop` or a validated exact-SHA post-merge `workflow_dispatch` on `develop` builds and publishes `ghcr.io/jboone1989/eventgraph-app@sha256:...`; documentation-only changes do not publish.
- Only main pushes with release intent run standalone promotion. Its `.github/production-image.env` pins both the successful develop SOURCE_SHA and digest; promotion requires successful `check`, `e2e` and published-image results for that SHA, unchanged application inputs, and an existing digest. The main push never builds a second image.
- The `deploy_production` job runs only if `EVENTGRAPH_PROD_AUTO_DEPLOY=true` is configured. It invokes the existing VM09 `scripts/deploy-prod.sh`. With no configured production SSH, run that script on VM09 through an authorized operator; **merging to main by itself does not deploy**.

## 分支继承与发布规则（2026-11-05）

- 唯一功能路径：`feature/* → develop → main`。先将修复、Spec、工作流变更合入 `develop`；`main` 只接受**同仓库 `develop` 作为 PR 源分支**。CI 的 Spec gate 对其他源分支指向 `main` 的 PR 直接失败，包括 `release/*`、`hotfix/*`；紧急修复也先合到 `develop`。
- `develop → main` 使用 **Merge Commit**，不可 Squash/Rebase。保留提交祖先关系；生产镜像仍由经检验的 `develop` SHA 和不可变 GHCR digest 配对固定到 `.github/production-image.env`，绝不因为合并分支而跳过镜像和环境验证。
- **每次 `main` 合并成功后，立即通过 PR 将 `main → develop` 回同步，使用 Merge Commit，不使用 Squash/Rebase**；已经包含 `main` 祖先时不需要新 PR。仅同步分支历史和经过验证的发布元数据，禁止在此步骤夹带业务功能。 Spec 门禁仅对同仓库、`develop` 为 `main` 祖先、差异为空或仅 `.github/production-image.env` 的纯回同步放行；业务差异仍需已有批准 Spec，全部 CI 与代码评审继续执行。
- 主分支受 GitHub 规则保护，不直接推送、不强制推送。不重复开同用途的 PR，优先处理已有回同步 PR。回同步完成时应满足 `git merge-base --is-ancestor main develop`；此时未发布的功能提交只能在 `develop` 一侧增加。
- 本次回同步仅调整分支历史、CI 合并门禁和规则说明，**不修改 `.github/production-image.env`，不执行生产部署**。下次生产发布必须在独立、经过验证的 `develop → main` 发布中选择与最新运行代码等价的已发布镜像摘要，继续执行 `release-main.yml` 的校验。

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



## Claude Review (one job inside Check)

- `claude-review` runs only for same-repo code PRs after `check`, `docker` and `e2e` succeeded; documentation-only PRs never invoke a paid model. There is no second AI verification round or separate reviewer workflow. The reviewer output is one structured verdict: concrete blockers are commented on the PR and the review job fails.
- Provider: official `anthropics/claude-code-action@v1` using the OpenRouter Anthropic endpoint `https://openrouter.ai/api` (override via repository variable `CLAUDE_REVIEW_BASE_URL`). Store the API key in GitHub Actions secret `OPENROUTER_API_KEY` (the API key stored in EventGraph's model-management database is not a GitHub secret); choose the model using optional variable `CLAUDE_REVIEW_MODEL`. Do not use the old GLM default or GH-AW engine configuration for this review.
- Once a successful reviewer execution is verified, add `claude-review` to each target branch's required status checks. The existing required job IDs remain `check`, `docker`, `e2e`, even though workflow runs now have descriptive names. GitHub branch rules, not an external review bot, remain the merge authority.

For GH-AW source edits, compile with `gh aw compile eventgraph-worker eventgraph-dispatcher --strict --approve --no-check-update`, commit the generated lock files and let normal PR CI validate them. For queue diagnostics use `gh aw work-queue --repo jboone1989/EventGraph stats --json`; no smoke workflow is needed.

## Operation and recovery

To re-run CI after editing only PR metadata or retargeting its base, dispatch GitHub `Check` on the current PR branch with the exact 40-character `expected_sha`. To re-release a verified develop SHA, dispatch that same pinned Check on develop. `Release production` accepts only an exact main SHA and never bypasses digest validation or environment gates.
