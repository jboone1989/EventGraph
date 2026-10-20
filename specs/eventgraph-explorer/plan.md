# EventGraph Explorer + Story — 最小实现计划（DRAFT）

> 与 [spec.md](./spec.md) 成套。**仅实施方案，不是已执行证明。** 当前批准基线待用户签署；实现前检查 develop 新提交并按当前文件重新核对。2026-10-20 核对基线 94bea405。对高风险历史数据问题，允许结论为 UNVERIFIED，禁止用 mock/当前快照冒充产品验收。

## 1. Search Before Build：已有能力与可复用边界

| 能力与职责 | 现成文件/接口（develop@94bea405） | 采用决定 |
| --- | --- | --- |
| 新闻与事件事实来源 | AIHOT 派生事件树；packages/backend/src/publication/*、apps/api/src/routes/site.ts、packages/contracts/src/site.ts | PostgreSQL 事实和当前公开范围的单一真源，不重新开发采集/新闻事件树 |
| 事件回放 UI | apps/web/app/features/story/EventTimeMachine.tsx、replay.ts | 保留受控滑块/播放、known/discovered 与 valid/published 时间分帧，不复制播放器 |
| 现有 Explorer 局部 UI | EventExplorer.tsx、TemporalKnowledgeAtlas.tsx，挂在 apps/web/app/routes/story.tsx | **已在事件详情页，有条件渲染** story.timeline.length>0；不等于独立可发现的 Explorer 工作台 |
| 交互图谱 | apps/web/app/components/KnowledgeAtlasCanvas.tsx、KnowledgeAtlas/KnowledgeNetwork/RelationEvidence、apps/web/app/lib/knowledge-atlas.ts | 复用 Cytoscape 画布、聚焦邻域、同对节点主连线与来源；禁止新建第二套引擎 |
| 后端时间过滤 | packages/backend/src/knowledge/graphiti.ts、temporal.ts，knowledge_service/server.py | 已有 known/valid bitemporal-v1 能力，必须继续 fail-closed。初步实际 API 实测仅证明 2000/2035 有界过滤，不等于修订版本严格历史快照 |
| 公开证据过滤 | packages/backend/src/publication/knowledge.ts、publication/scope.ts、story-evidence.ts；apps/api/src/routes/knowledge.ts | 必须从 publication 层过滤权限、撤稿和历史；不能直接把 Neo4j 原始结果作为公开 JSON |
| 网站路由与导航 | apps/web/app/routes.ts、/knowledge、/story/:publicId，以及响应式导航已有组件 | 优先增加最少路由与清晰入口，不另造路由框架；与 /en 对齐 |
| API/MCP | apps/api/src/routes/knowledge.ts、mcp.ts；packages/contracts/src/mcp.ts、site.ts | 新证据包优先在已有公共读取层与现有 MCP 工具上扩展；禁止新独立服务 |
| 发布 | .github/workflows/check.yml、scripts/ci/deploy-image.sh、docker-compose.yml、docker-compose.dev-ingress.yml | 只使用现有 feature→develop→main / GHCR digest / SSH/Compose；不得新造流水线 |
| 官方 Spec Kit | .specify/、.agents/skills/speckit-*、.claude/skills/speckit-*、docs/spec-review.md | 使用现成 spec/plan/tasks 和 analyze/converge；实现任务由任意 Agent 领取 |

已核对上游设计层的明确差别：上游 AIHOT 保留新闻采集/事件归组；EventGraph 自己已经引入 Graphiti + Neo4j 与 Explorer。**实施者在每个业务 PR 前必须再检查当前上游和官方 Graphiti 行为是否变化**；不要据此文档声称上游支持本文新功能。参考：[AIHOT](https://github.com/KKKKhazix/AIHOT)、[Graphiti](https://github.com/getzep/graphiti)、[GitHub Spec Kit](https://github.com/github/spec-kit)。

## 2. 审计基线：实现了什么、没实现什么

- GitHub develop: 94bea405（PR #70 已合并）。CI [39275536534](https://github.com/jboone1989/EventGraph/actions/runs/39275536534) 的第二次执行成功，镜像 digest sha256:3cc0e2f28da6fa24634e02dd3fbd78aadb41d8a38f88b8931362ede3f0078f03，SSH 部署日志有 Release verified。**此事实不证明真实页面可打开，也不证明 UI 符合整个计划。**
- 前次 cn-dev Remote：Web/API/Worker 已运行该镜像；独立 aihot-knowledge-1、Neo4j/PostgreSQL 在线；独立 aihot-ingress-1 后来恢复运行并映射 80/8080。但外部网络实测、真实事件 Story 页交互/移动端截图仍须在本次任务重新验收。
- 开发机本地 Git checkout 此前停留 49451fb，而 Docker 容器使用新 digest。**CI 是镜像部署，不是每次将仓库 checkout git pull 到服务器。** 不得因此误报镜像过旧；若要在开发机修改源码，先按分支流程同步工作区。
- 当前 /story/:publicId 内 Explorer 是一个 Panel 且仅当 story.timeline.length>0 才显示。apps/web/app/routes.ts 目前没有 /explore。手机的时间/关系/来源 Tab 已有，但统一工作台入口/桌面完整布局/抽屉仍与用户草案存在差距。
- 当前 TemporalKnowledgeAtlas 基于单次 graph.edges 在浏览器算一跳网络，不会跨事件真正追加邻域。当前关系上限 60，事件详情初载最多约 100 条；用户必须看到覆盖提示。
- GitHub E2E 包含 mock Graphiti 的 Cytoscape 3→2→3 节点回放。真实 Graphiti 80 条文章记录在 2000 与 2035 的 known/valid 过滤曾通过 API 验证，但**未有真实不同来源的 T1/T2 图谱/证据浏览器验收，也未验证复杂修订/撤稿完整历史回放**。
- S2 共享证据包、S3 Gallery/AI Story 未实现；不可写成“已经完成”。

## 3. 最小架构：一条数据通路

```text
URL /explore /story/:publicId
    -> SSR / existing API GET story (public publication scope)
    -> ExplorerState {storyId, asOf, clock, focusKey, relationKey}
    -> known/valid public Graphiti adapter [existing /api/site/knowledge/stories]
    -> publication permission/withdrawal filtering
    -> evidence + bounded fidelity/coverage
    -> existing EventTimeMachine + KnowledgeAtlasCanvas + RelationEvidence
    -> later: public evidence-bundle API/MCP + guided Story
```

推荐一个显式的客户端 ExplorerState，不能在两个组件分别维护不同 asOf。事件页和独立 Explorer 可以共享组件，不必共享全局 store；URL 的 story、asOf、clock 与选中节点（可选）应可深链接并验证输入。只需要小型公共 hook/adapter 时才创建，避免新增状态框架。所有实时来源数据仍由应用 API 提供。

**时序公理**：
- known: source.discovered_at <= asOf；Graphiti 边 created_at <= asOf 且当时未 expired；关联 Episode/证据也必须在 asOf 可见；**当前公开权限仍优先**。
- valid: Graphiti valid_at/invalid_at 的现实有效区间；发布日期只驱动报道播放，不自动成为图谱 valid 时间。
- 缺时间字段、修订历史丢失、实体合并：要么剔除并说明限制，要么返回明确不可复原。绝不虚构。
- 故障：不支持 temporalSupport=bitemporal-v1 时设置不可用；不返回当下关系；事件报道可继续看。
- 证据包只返回公共真实 URL/事实，包含来源时间、记录时间、有效时间、原始 revision 信息（若可得），以及 truncated/coverage/fidelity；所有数值来自真实来源，不发明所谓「置信度」。

## 4. 推荐分段实施（每个功能 PR 都可独立验收）

### PR-A / S0：恢复可见与真实验收（第一优先）
范围：只读核验 cn-dev 公网 ingress、/api/health、真实 /story/:publicId；检查首页/导航入口以及已有 Explorer 条件显示。若入口偶发失效，仅复用 docker-compose.dev-ingress.yml 和已有部署脚本作**最小可靠修复**；添加外网/入口级 smoke 检查，不添加第二套 CI 或改数据库。选择实际公开、至少三篇有时差的事件，记录稳定 publicId、完整页面与网络响应/截图。结果是一个可重复访问的开发深链接，而非仅 CI 通过。

### PR-B / S1：统一工作台与真实图谱/证据同步
范围：扩展现有 EventExplorer 和 /story 页，桌面用主探索区+证据栏；移动端用 Tab+底部抽屉；如果单页无法从首页发现，再建立 /explore(/en/explore) 入口。统一 asOf/clock/selectedRelation；不重复时间机。测试 slider/step/play/clock、空图降级与移动端布局。先复用已有站内搜索做事件入口，问答留到 S3。

### PR-C / S1：双时间真实性与证据安全验收
范围：独立检查当前 Graphiti 服务版本与 API、Graphiti 返回的 Episode 时间和版本字段、publication 条件及撤稿，补最少的 schema/响应字段和行为测试；**只有经证据证明现有时序语义不足时** 才讨论追加变更账本/迁移。真实事件两时点含后来关系、失效关系、更正和回撤边界；必要时给出未覆盖项目而不关闭 #61。不能为了测试造真实页面可见的假新闻。

### PR-D / S2：实体/跨事件聚焦探索与统一证据包
范围：沿用 /knowledge 的 centers/neighborhood、RelationEvidence、现有站内检索，实现搜索实体/事件后局部扩展和跨事件路径，不允许首屏一次渲染全部图谱。API/MCP 返回共同 publication 层的结构化证据包。保持现有图谱/实体页可用；对分页、覆盖范围、未知关系有明确说明。

### PR-E / S3：Gallery（独立 PR）
范围：基于真实公开内容和事件/实体索引建立画廊、精选路线卡，支持浏览和导航；不做 AI 生成的假封面或未验证关系。

### PR-F / S3：AI 引导式 Story（独立 PR）
范围：先检索真实证据，形成可审计路线的结构化结果，再复用现有 worker/provider 进行**可选**解释；采用原预算/凭据/发布策略，不在用户网页点击时调用付费模型，不向公共端暴露模型 key。AI 不能填补证据缺口或推断为已确认的因果链。

## 5. Review/Test 矩阵与发布规则

- 每 PR：搜索现成实现/上游/官方文档，说明不复用的原因；先对应 spec.md 的 EG-ID 及失败前证据，然后实现最小差异；Typecheck、Web/Backend 回归、E2E、独立 diff Review。
- E2E 可以使用本地 mock/fixture 验证交互，但真实 T1/T2 必须另由已公开数据验证；报告分别标 **mock PASS／real PASS／UNVERIFIED**。覆盖无 Graphiti、无来源、撤稿、UTC/同刻/缺失日期、篇数上限、中文英文、390×700、全键盘。
- 每个 PR 有「requirements→changed paths→tests→real runtime evidence」对照；Claude 可做 Reviewer，但不必须依赖 Claude；批准的 Spec SHA 不能被实现者自己改写。
- 合并到 develop 后，核对 CI green→GHCR digest→SSH deploy→实际 web/api/worker digest→/api/health→外部 ingress→真实页面行为。Web/API/Worker image 更新不意味着独立 knowledge_service 一定同步：检查版本契约和容器状态。
- 数据库迁移按 AGENTS.md／现有 migration check；无需迁移则一律不加。永不自动重建 Neo4j、删除 PostgreSQL/volume 或将 feature 直接合 main；main 仅在既有每周发布流程更新。
- 失败时优先修已经存在的反向代理/CI/digest 通路；不添加冗余监控容器、调度框架或覆盖生产。
