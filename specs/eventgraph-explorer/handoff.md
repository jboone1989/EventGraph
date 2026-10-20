# Agent 接手手册 — EventGraph Explorer + Story

> 更新：2026-10-20。**DRAFT，尚未由用户批准。** 必须先读 [spec.md](./spec.md)、[plan.md](./plan.md)、[tasks.md](./tasks.md)，以及 [Issue #61](https://github.com/jboone1989/EventGraph/issues/61)。这份文档记录证据和缺口，不把假设、自动测试或历史日志写成已交付事实。

## 确认过的交接基线

| 范围 | 已确认 | 尚未验收 |
| --- | --- | --- |
| 仓库 | jboone1989/EventGraph，develop=94bea405，PR #70 已合并；现有 Spec Kit 1.2.1 | 本文档 PR 尚未获批准 |
| GitHub CI | [Run 39275536534](https://github.com/jboone1989/EventGraph/actions/runs/39275536534) 第 2 次运行成功，部署脚本有 Release verified | CI 不代表浏览器中产品完整 |
| Docker 应用 | cn-dev 前次实际运行 Web/API/Worker 镜像 sha256:3cc0e2f28da6fa24634e02dd3fbd78aadb41d8a38f88b8931362ede3f0078f03 | 外部公网入口和真实事件图谱联动仍需重测 |
| 服务器 | LivingRuntime Remote device=cn-dev，project=aihot-dev，路径 /home/ubuntu/livingruntime-aihot；前次 aihot-ingress-1 已运行并映射 80/8080 | 从浏览器/公网访问，不应以 docker ps 替代 |
| 本地 Git | 此前本地 checkout 为 49451fb；镜像部署独立于 Git checkout | 不得推断运行镜像是旧代码 |
| Graphiti | knowledge 独立容器；此前 80 条真实入图文章版本在 2000/2035 查询返回 known/valid 0/60 edges，temporalSupport=bitemporal-v1 | 未证明中间时点修订、撤稿或精确历史事实快照 |
| 用户可见 UI | /story/:publicId（中英文）有 EventExplorer，仅在 timeline 非空时显示；/explore 路由当前不存在 | 独立工作台、真实 T1/T2 浏览器场景、画廊和 AI Story |

## 接手后的第一项工作：领取 EG-T01 ～ EG-T04

1. 确认 develop 最新 SHA；阅读 AGENTS.md、docs/spec-review.md、docs/event-explorer.md 和相关源代码。若此 Spec 还没有用户批准，只能做只读核查和建议，不擅自改产品愿景。
2. 从外网检查开发入口（此前用户使用 http://43.142.127.40:8080/；请验证是否仍有效），和开发机内 /api/health 对比。若入口故障，只使用现有 docker-compose.dev-ingress.yml/发布脚本的最小修复，不建立第二套代理或部署系统。
3. 从真正公开的事件选择 story.publicId、三篇时间不同且来源不同的报道，获取原文 URL、UTC 时间，及后来新增的 Graphiti 边。必须验证 /story/{id}、/en/story/{id}、时间轴、关系、证据；数据不足则标 BLOCKED-DATA。
4. 为一个真实事件记录 T1/T2 的浏览器截图、网络请求、关系边及来源差异。Mock E2E 只是交互回归，不能替代此验收。
5. 在 Issue #61 或阶段 PR 中列：已验证、失败、未验证、下一步，不以“CI 全绿”声明 Explorer 完成。先修读者看不到，再做 S1 全工作台。

## 多 Agent 协作纪律

- **审批规则**：本 PR 中的 Spec 是草案，不能由 Agent 自己认定为批准。用户确认并将文档合入 develop 后，开发 PR 引用批准的 commit SHA + specs/eventgraph-explorer/spec.md。修改已批准范围必须再次获批准。
- **交接协议**：一次只领取 tasks.md 中一个小范围；分支 feature→develop→main；按 Issue/PR 评论交接范围、EG-ID、当前 HEAD、测试/截图、未解决问题。Codex、Claude、ChatGPT 任意一方均可独立 Review，要求对准确 SHA 给 PASS／CHANGES REQUESTED／UNVERIFIED。合并后删 feature 分支。
- **复用与成本**：从 EventTimeMachine、EventExplorer、KnowledgeAtlasCanvas、RelationEvidence、Graphiti 和 publication 层开始；不要新建新闻引擎、图数据库、RAG、CI/CD、代理栈或 Provider 管理器。读页面不触发模型费用。
- **时序/隐私**：known=系统获知，valid=事后有效时间；当前已撤回/私有/未发布内容即使查询过去也不能出现。没留存历史修订就不能宣称能重放；数据截断要显示。重大 schema/Graphiti 改动单独审查，不自行重建或清除 Neo4j/Postgres 数据。
- **发布证明**：逐一核对 PR merge→CI→GHCR digest→实际容器镜像→内网健康→外部入口→真实 UI。开发应用镜像更新不等于独立 knowledge 容器同步，服务器 checkout 也可能是旧 SHA；明确区分。仅 develop 自动部署，main 遵守每周发布策略。
- **对用户报告**：只说已经实际验证的结果，并附链接、时间、commit、测试和剩余差异；一旦数据无法证实，直接写 UNVERIFIED，不做猜测性结论。

## 新 Agent 不应重复踩的坑

- Explorer 当前位于事件详情 Panel 内而非全站独立入口；单看首页找不到完整体验。
- 当前代码能做一部分时间联动，但真实事件的关系/修订/撤稿回放还没独立验收，且每次查询关系与文章来源数量受限。
- 当前 Graphiti、PostgreSQL 数据可证明一些历史时间过滤，但无法倒推出数据库从未记录的历史事实版本。
- 入口容器曾缺失，CI 部署脚本主要更新 Web/API/Worker；公网访问是单独验收，不可被内部健康检查替代。
