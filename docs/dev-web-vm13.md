# EventGraph 开发预览：VM13 仅 Web（2026-10-25）

## 固定分工

- **cn-dev**：代码开发、API、Worker、PostgreSQL、Neo4j、Graphiti、新闻采集、模型任务及所有既有数据卷。
- **43.133.185.154 / VM13**：原 Ferro **保持不动**；只额外运行 EventGraph Web SSR（一个受限容器）。
- **VM09 生产**：完全不动。不得修改正式站域名、生产图谱或生产数据库。

本路线不迁数据库，也不开放 PostgreSQL/Neo4j 公网端口。Web 仅访问通过 SSH 转发的 cn-dev API；API 在 cn-dev 继续使用原 Docker DNS 访问数据。不要再把全栈运行到 2C/3.6GiB 且 Ferro 正占用高 CPU 的 VM13。

## 已在仓库提供的两个最小 Compose 配置

- `docker-compose.dev-api-loopback.yml`：只给 cn-dev API 增加 `127.0.0.1:3001:3001`，不公开监听。开发镜像部署脚本已引用，未来更新 API 时不会丢失绑定。
- `docker-compose.dev-web-vm13.yml`：隔离 Compose 项目名 `eventgraph-dev-web-vm13`；只运行 Web，独立宿主 loopback 13000，Web → API 指向宿主 loopback 13001，镜像必须是已通过 CI 的完整 GHCR 不可变 digest。Web 的资源上限为 384 MiB / 0.40 CPU。不创建或修改 Ferro 容器/卷/端口。

Web 使用 host network 的原因仅为访问 VM13 上的 `127.0.0.1:13001` SSH 反向隧道；强制 `WEB_HOST=127.0.0.1`，不会监听公网。该 Web 容器**不配置数据库凭证**。

## 部署前置检查（没通过不切换）

1. 确认 cn-dev 当前事件库、Neo4j、Graphiti 与 API 健康，且无未完成部署/迁移；与此无关的 Ferro 服务不能重启。
2. cn-dev 用两个 Compose 文件验证端口映射，再仅调整 API 服务，不触及 `db`/`worker`/`knowledge` 卷或历史文章。确认 cn-dev 宿主访问 `http://127.0.0.1:3001/api/health` 为 200，公网 `:3001` 无监听。
3. 通过**已验证服务器主机指纹、专用受限 SSH 公钥和固定端口**，从 cn-dev 向 VM13 建立可靠的反向转发：VM13 `127.0.0.1:13001` → cn-dev `127.0.0.1:3001`。不要使用 `StrictHostKeyChecking=no`，也不要把 SSH 凭据或 DB 密码写入仓库。
4. 先在 VM13 上验证 `127.0.0.1:13001/api/health` 与真实 `/api/site/stories/{id}/route` 的后端响应；断开 SSH 时该私有 API 必须不可达。未确认此项不得启动正式 Web 健康检查。
5. VM13 `sudo docker compose -f docker-compose.dev-web-vm13.yml config --quiet`；`EVENTGRAPH_APP_IMAGE` 设置为完整 `ghcr.io/jboone1989/eventgraph-app@sha256:...`，**先完成缓存和摘要校验**，再用 `--no-build --pull never` 启动 `web` 单个容器，监控 Ferro CPU/Swap。镜像传输不要由原 cn-dev 开发部署任务重复运行。
6. VM13 `curl -fsS http://127.0.0.1:13000/api/health` 为 200、`/en/explore?story=3d1ae73d-271c-43c0-870b-290d4af78c26` 页面正常，再用浏览器 390px/1440px 测试英语来源名、事件时间滑块与原始证据链。
7. 最后才新增 EventGraph 开发预览入口（独立域名/已有 Cloudflare 管理层的独立路由），不得改 Ferro 既有 Tunnel 端口和域名。原 cn-dev Web 暂保留作为回滚，等 VM13 实际验收通过再评估停用。

## 最小回退

VM13 停止**仅** `eventgraph-dev-web-vm13` 的 `web`，移除新增反向 SSH 转发；cn-dev API、Worker、Graphiti 和数据库独立继续运行。无 DB 迁移，不涉及数据回滚。生产 VM09 / Ferro 完全不受影响。

## Ferro 负载再分配的边界

VM13 `ferro.service` 的 `run_content_cognition_worker.py` 约占满一个 CPU 核；其 Supervisor 同时启动 neural、reflect 和 self-repair Worker，而 content-cognition 还持有实时 HTTP/Agent Network、发布逻辑及基于本地文件的调度/状态。**不能将整个 worker 直接在 cn-dev 再启动**：可能重复出稿，且两个主机的文件状态不一致。

可后续把**无状态的研究/计算任务**通过现有 Remote/Agent 接口委派给 cn-dev；Ferro 状态、唯一调度器和出版入口仍在 VM13。此拆分必须先证明现有任务接口可承载，不额外建立一套分布式调度系统。

## 当前交付状态

此 PR **提供独立 Compose 和部署路径，不代表已切换预览站点**。2026-10-25 cn-dev 曾发生 502，后验证最后正常镜像 `c0f0c1a1...` 的 API/Worker/Web 已恢复健康；VM13 确认 2 核、3.6 GiB 内存、可用约 1.8GiB、Swap 已占约 1.8GiB。只有健康、网络/镜像测试和 Ferro 负载观察完成，才可改变开发入口。规划依据参见 [event-impact-tracing](../specs/event-impact-tracing/spec.md)。
