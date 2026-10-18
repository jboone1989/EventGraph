# EventGraph 开发流水线：独立模块、事件组合

本仓库已有 `.github/workflows/check.yml`。GitHub **原生 workflow_run 事件**就是构建触发器，无需另写 HTTP webhook 服务。

## 三个独立环节

| 步骤 | 触发条件 | 执行地点 | 输出 / 失败处理 |
|---|---|---|---|
| 本地开发预览 | cn-dev 上修改代码 | 现有开发进程 | `npm run dev:web` / `npm run dev:api` 热更新，**无需 PR** |
| Check | PR / main push | GitHub-hosted runner | 类型检查、数据库/浏览器测试、Docker smoke；失败不发布镜像 |
| Build Image | `Check` 在 main 的 push **成功完成** | GitHub-hosted runner | 构建应用镜像，发布 GHCR `sha-<commit>`，输出不可变 `image@sha256:digest` |
| Update Dev | Build Image 成功且仓库变量启用 | cn-dev 专用 runner | 拉取指定 digest，更新 api/worker/web，健康检查；失败回滚应用容器 |

- **Claude Review** 是另一个并行质量关卡：在 PR 上复审，不能阻塞个人开发预览；合并前按仓库保护规则处理。
- **生产部署完全独立**，不在这个 workflow 里。
- PostgreSQL / Neo4j 保持运行。普通代码更新不迁移数据库、不重建数据库镜像，也不重启知识图谱。
- `knowledge_service` 是单独 Python 服务，本 PR 不触发其构建；后续可按相同模式加独立镜像工作流。

## 开发部署如何启用

默认仅在 `main` 成功通过 Check 后发布 GHCR 镜像。**Update Dev 默认跳过**：这避免未经确认就覆盖目前 cn-dev 的预览与数据库。

启用时需要一次性完成：

1. 在 cn-dev 安装 **仓库专用** GitHub Actions self-hosted runner，标签 `eventgraph-cn-dev`，用有 Docker 权限的独立运行账号；只允许运行受保护 `main` 的工作流。此 runner 拥有本机 Docker socket 的强权限，不能拿来执行来自外部 PR 的任意脚本。
2. 在仓库 Actions Variables 里设置 `EVENTGRAPH_DEV_AUTO_DEPLOY=true`。没有这个变量时，不会安排远程部署作业；`GITHUB_TOKEN` 用于当次 GHCR 下载，不另建 Webhook 服务器或长期 GitHub Personal Access Token。
3. 目标路径为 `/home/ubuntu/livingruntime-aihot`，必须确认主机名 `VM-0-5-ubuntu`、真实 `.env` 和 Compose 均属于 cn-dev。首次启用前人工核对**运行中镜像对应的实际源码 SHA**和开发数据库迁移账本，再由有权限的操作者把该 40 位 SHA 写到 `~/.local/state/eventgraph-dev/last-source-sha`（权限 0600）。脚本不从可能有未提交改动的工作树 HEAD 猜测部署版本；缺少基线、SHA 不在同一 ancestry 或Docker 数据目录所在磁盘空闲不足 4 GiB 都会拒绝部署。
4. 更新流程仅更新 `aihot` Compose 项目的 `api`、`worker`、`web`，依赖 `docker-compose.dev-image.yml`。任何检测到 `database/migrations/` 变化的发布都**拒绝自动更新**，应先单独迁移开发数据库再开启该次部署；不触碰生产环境。
5. 更新前分别读取 `api/worker/web` 的**不可变本地镜像 ID**，保存三个回滚标签，更新后校验三个服务都在运行目标 digest 对应的镜像，连续三轮通过 web/API 健康探测才写入当前版本记录。失败、取消和超时会尽力恢复三个应用镜像与容器；数据库和数据卷从不删除或自动恢复。只尝试删除带有 EventGraph 镜像来源标签、且没有任何容器或回滚目标引用的旧镜像；绝不对整台开发机执行全局 image/system/volume prune。历史 Git SHA 与镜像引用在 `~/.local/state/eventgraph-dev`。

## 触发链和重试

```text
编辑 cn-dev → 开发预览热更新（最快路径）
        |
        └── GitHub PR → Check → Claude Review → 合并 main
                                        |
                          main Check success（workflow_run）
                                        |
                        Build image at GitHub → GHCR digest
                                        |
                         Update Dev（启用后自动）
                                        |
                          health check / app rollback
```

失败处理互相独立：测试失败就修测试；镜像构建失败只重跑 Build 工作流；开发环境启动失败只重新发布/回滚开发镜像。不会为了修改一个按钮去重建 PostgreSQL 或 Neo4j。

**尚未启用/验证：** 本 PR 创建后需要先确认 GitHub Check 和 Build 工作流可读、以及 GHCR 发布凭据有效。由于生产式的 GitHub runner 尚未确认安装在 cn-dev，真实 Update Dev 不得宣称已经可用或已经部署。
