# EventGraph 开发 CI/CD（GitHub 原生）

本项目使用 GitHub Actions + Docker 官方 Actions + GHCR + Docker Compose，不运行额外的调度、轮询或自制部署脚本。

## 分工

| 环节 | GitHub 事件 | 运行位置 |
|---|---|---|
| CI（原有 `check.yml`） | `pull_request` / `push main` | GitHub-hosted |
| 发布镜像（`dev-image.yml` 的 `publish`） | `Check` 在 `main` 的 push 成功完成 | GitHub-hosted |
| 更新开发应用（`deploy_dev`） | 同一工作流的 `needs: publish`，启用后 | GitHub-hosted → SSH → cn-dev |
| Claude Review | 独立 PR 评审 | 不阻塞开发预览 |
| 生产部署 | 不在本工作流内 | 完全独立 |

发布使用 Docker 官方 `setup-buildx-action`、`login-action`、`build-push-action`；利用 GitHub Actions BuildKit 缓存，而不是让 cn-dev 反复构建。镜像打上来源 Git SHA 标签，并以不变的 OCI digest 交给下一步。

**不会从 PR 构建结果部署开发环境。** 工作流只接受本仓库 `main` 的成功 push Check，并在构建前检查当前 HEAD，避免旧提交覆盖新版本。

## 开发部署启用前检查

首次合并后，只自动构建并发布 GHCR 镜像。**开发部署默认关闭**（没有设置变量即不运行），因为当前 cn-dev 运行的应用容器来自不同 Compose 工作目录，主工作区还有本地提交和未提交修改，不能盲目覆盖。

统一 Compose 配置、确认现有应用和数据库兼容、核对真实运行版本后，才设置以下 GitHub Repository Variables 和 **development Environment Secrets**：

- Variables: `EVENTGRAPH_DEV_AUTO_DEPLOY=true`、`EVENTGRAPH_DEV_HOST=43.142.127.40`、`EVENTGRAPH_DEV_USER=ubuntu`。
- Environment secrets（development）: `EVENTGRAPH_DEV_SSH_KEY`（仅用于开发部署的 SSH 私钥）、`EVENTGRAPH_DEV_KNOWN_HOSTS`（从可信渠道核实的 SSH host key）。
- 不需要 self-hosted runner、长期 GHCR PAT、Webhooks 服务器，也不向仓库提交任何密钥。

启用后，GitHub 托管 Runner 用本次 `GITHUB_TOKEN` 登录 GHCR，在 cn-dev 上执行标准 Docker Compose `pull` / `up -d --no-deps --no-build`，仅更新 `api`、`worker`、`web`，随后在 web 容器内部做健康检查。保留 `db`、`knowledge-neo4j`、`knowledge`、`egress-bridge`、卷、环境文件和源码工作区。GitHub Actions `concurrency` 防止同一流水线并发运行。

部署步骤**不自动迁移数据库**，且不具备生产级自动回滚。如果需要新增迁移，应先按既有迁移流程验证开发数据库，确保正在运行的服务兼容。若健康检查失败，GitHub Actions 报红，需要人工核对或按旧镜像 digest 执行标准 Compose 回退，不能声称自动回滚成功。

## 开发预览

直接编辑 cn-dev 上的开发代码可继续使用 `npm run dev:web`、`npm run dev:api` 的热更新模式；这条路径不需要推送 GitHub，也不需要等待 PR CI。推送 PR 后，CI 和 Claude Review 各自独立进行；合并 main 后生成可复现的镜像用于统一开发环境部署。

当前的唯一阻塞：开发机运行栈尚未收敛为单一受控 Compose 来源，且未配置开发 SSH 凭据。**不要仅为了“完成自动化”而覆盖现有服务和数据。**
