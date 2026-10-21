# EventGraph Explorer + Story — Agent 可领取任务表（DRAFT）

> 先读 [spec.md](./spec.md) 与 [plan.md](./plan.md)。**这是一份待批准的任务拆分，不是执行清单已经完成。** 不要因为现有 UI 或 CI 为绿，就自动勾选后续步骤。每项要记录实际 commit/PR/CI/开发网址/截图证据。

## 领取规则（所有 Agent 通用）
1. 从 GitHub develop 最新 SHA 建 **一个 feature 分支**；核对 docs/spec-review.md、AGENTS.md 及固定批准版 spec.md SHA。无批准版本时，只做分析、验收与独立 Spec 审查，不提前实施大功能。
2. 先搜索当前仓库、AIHOT 上游、Graphiti/官方能力，再改。每个 PR 做下面同一阶段一组相邻任务；禁止顺便整理 Provider、Graphiti、大型 CI 或重建图谱。
3. 改动前写下**失败的可复现条件**；改动后补对应 E2E/后端契约测试。Mock 单元测试 ≠ 真实开发站数据验收。
4. 在 PR 中输出 EG-ID→文件行→测试/真实截图→风险与未验证项→准确部署 SHA。需要另一 Agent 审核可直接检查，不必请用户来回转述。
5. 每完成一个 PR，经 CI/Review 后合并 develop、删除 feature 分支；每周计划外不得合并 main 或部署生产。

## S0 / 入口与基线恢复（最高优先级，先交付读者可打开的页面）

- [x] **EG-T01 — 核对真正开发入口**（EG-01/02）。使用实际开发服务器入口、外部 HTTP 及 /api/health；检查 80/8080、ingress upstream、web 页面 SSR、API 结果。对照 Docker digest=sha256:3cc0e2f28da6... 和 develop=94bea405；**不要把本地 Git checkout 49451fb 误认为运行镜像旧版**。记录入口 HTTP 状态、URL、时间及失败链路。
  - 证据：[Issue #61 S0 验收报告](https://github.com/jboone1989/EventGraph/issues/61#issuecomment-6285190395)（2026-10-20）：外网入口 http://43.142.127.40:8080/（80 同站）与 /api/health 正常，运行镜像 `sha256:3b987d4f…`（CI run 39376729411 发布）。
- [x] **EG-T02 — 确保 ingress 随正常部署保留**（EG-01/16）。核对 aihot-ingress-1、docker-compose.dev-ingress.yml 与 scripts/ci/deploy-image.sh 的现状；仅在能重现消失/重启问题后，补已有 Compose 流程的最小持久化/启动/外网 smoke，不新建服务或 CI 引擎。测试部署后 80/8080 能访问；服务故障不可被内网 /api/health 掩盖。
  - 证据：[PR #74](https://github.com/jboone1989/EventGraph/pull/74) 复现并修复 ingress 在客户端中断响应时的崩溃（develop `ff336c3`），部署后 80/8080 外网 smoke 通过。
- [x] **EG-T03 — 验证现有 Explorer 可见性**（EG-01/10）。在一个真实公开的事件 /story/{publicId} 和 /en/story/{publicId} 中找 Event Explorer；确认只有 timeline 非空才出现，检视首页/导航是否有入口，记录两张真实屏幕截图（桌面/390×700）、网络请求、被截断的来源范围。
  - 证据：[Issue #61 S0 验收报告](https://github.com/jboone1989/EventGraph/issues/61#issuecomment-6285190395)：真实事件中英两页 Explorer 可见、桌面/390×700 截图与网络请求齐全；全站无 Explorer 导航入口（由 EG-T05 补 /explore 解决）。
- [x] **EG-T04 — 建立真实验收样本清单**（EG-03/09）。用 PostgreSQL 当前公开事件选择至少 3 篇不同来源/不同时间报道，Graphiti 有后继边的真实事件。记录 publicId、可公开来源链接、T1/T2（ISO、时区）、known/valid、预期关系/证据；不能用 E2E fixture 假造真实站事件。若无足够样本，标 BLOCKED-DATA 并提供缺口与安全的补采建议（遵守付费闸）。
  - 证据：[Issue #61 S0 验收报告](https://github.com/jboone1989/EventGraph/issues/61#issuecomment-6285190395)：17 个 ≥3 源真实事件（主样本 `e5fbc143…` Gemini 9 源，备用 `4b6afb0b…`、`c7f5a711…`），含来源链接与时间字段。

**S0 完成判据**：实际外部地址和两条真实 story 深链能打开，可在中英文找到 Explorer，截图和 HTTP 证据附到 PR/Issue；S0 本身不代表历史真实回放完成。

## S1 / 统一工作台 + 双时间真实数据（主产品验收）

- [x] **EG-T05 — 入口/信息架构**（EG-06/10）：借用现有 EventExplorer，在事件页提供明显主入口；创建可发现的独立 /explore、/en/explore 工作台（先复用现有站内事件/实体搜索，别新做 LLM 服务）。桌面聚焦图谱+时间条+证据侧栏；手机单视图 Tab+底部抽屉。支持公开事件深链/返回。 ✅ PR #75（6afe457）；真机验收 15/16（cn-dev 外网，落地页/工作台/事件页入口/实体搜索，zh+en 截图）；工作台自链接缺陷已修（#76 f2c12ce）
- [x] **EG-T06 — 同一时间状态**（EG-03/04）：维护唯一 asOf/clock/selectedNode/selectedRelation；按钮/滑块/播放/暂停/回最新驱动事实、证据与时间列表；无时点当前综述必须独立标「当前信息」。复用 EventTimeMachine/TemporalKnowledgeAtlas，不复制引擎；增加时间切换竞态的旧证据隐藏测试。 ✅ PR #75；时间交互写 URL（真机验证 replaceState）；竞态测试 e2e "a late stale graph answer never replaces the newer time state"
- [x] **EG-T07 — 证据详情**（EG-05/07）：关系边点击展开 RelationEvidence、原文 URL、原始来源、发布时间/发现时间/事实生效/系统记录时间（可用才显示）、版本和撤稿状态；未证实关系不能标“已证实的因果”。证据抽屉与图谱同一 asOf，键盘可操作，中文英文等价。 ✅ PR #75；真机验证证据外链可点（t10-browser 最新帧 + 各时点来源 tab 外链格式）
- [x] **EG-T08 — 图谱与手机**（EG-06/08）：实体居中、一跳拓展、点击高亮、主边合并、返回中心、连续切换视图不闪烁或失焦；390×700 禁止横向滚动；Graphiti 离线和 0 边时清楚降级。 ✅ PR #75；真机 390×700 两页零横向溢出、底部导航齐全；离线降级 e2e "the workbench degrades clearly when the graph service is offline"
- [x] **EG-T09 — 后端时间合同检查**（EG-09）：审查 packages/backend/src/knowledge/{graphiti,temporal}.ts、publication/knowledge.ts 与 knowledge_service/server.py；known/valid、Episode 创建时间、撤稿、revision、实体合并、缓存。只补有证据的最少字段/修复；检查 temporalSupport=bitemporal-v1，未支持时不可回当前图。 ✅ PR #76：四层审查符合契约（parseGraphTime→路由→publicStoryGraph 隐私门→graphForStory→server.py 双钟边过滤；缓存拒绝不落值、时间读不缓存）；唯一有证据修复=revision 回退（graphForStory/graphForArticle 请求已摄取 revision，单测红→绿）；独立评审 PASS（PR #76 comment 6287855430）；部署验证 cn-dev 受影响故事 60 边满额返回
- [x] **EG-T10 — 真实 T1/T2 验收**（EG-03/05/09）：在刚选真实公开事件中，T1 不能看到 T2 后发现的来源/新增图谱边；T2 能看到新增边、证据可点原文。检查真实数据撤稿/修订/invalidated 边的权限与过去视图；若数据库缺历史快照，把不可证明列在报告而非勾选 EG-09。附页面/网络/必要的数据检查与差异说明。 ✅ 3 事件×5 读取数据探针 + 4 读取浏览器级验收（e5fbc143 等）：known 钟 discovered≤截止、valid 钟 published/validAt≤截止、截止真实截断；已知诚实边界：收录滞后使 known@T1 空（fail-closed 不补齐）、当前读 LIMIT 60 截断（bounded）、早于首帧深链 clamp 并显示「无法恢复此前资料」（#76，SSR 1/0 验证）；撤稿/invalidated 的历史视图权限在 EG-T09 审查内（editorial_rejected=false 全程过滤、invalidAt 历史视图抑制）
- [ ] **EG-T11 — 浏览器回归与双语**（EG-03~10/16）：真实服务的桌面/390×700 截图；中英两套路径；时钟切换、持续拖动、边证据抽屉、键盘、触屏、图谱离线、empty graph、missing date、truncation；继续保持 e2e/explorer.spec.ts（mock）但不可替代真实验收。

**S1 完成判据**：用户不通过代码也能从入口选事件、回到过去、见到正确的关系变化与来源；**对当前无法恢复的修订历史诚实注明 fidelity=bounded**。有任意未验证关键时间一致性，Issue #61 保持打开。

## S2 / 跨实体探索与证据包（S1 真实验收后）

- [x] **EG-T12 — 实体/主题中心搜索**（EG-11）：按需复用 /knowledge 的 centers、neighborhood、现有 public 搜索与当前 AtlasCanvas；一个中心开始、最多一跳，按需下探；不能一次把完整 Neo4j 节点塞进画布。 ✅ /explore?entity=<key> 实体模式：复用 centers 搜索（结果链接留在工作台内）、neighborhood 一跳聚焦画布（KnowledgeAtlas initialKey）、entities 配对事实抽屉；e2e "an entity deep link opens the focused atlas inside the workbench"（桌面+手机）
- [x] **EG-T13 — 时间/关系过滤与连续探索**（EG-11/12）：同一 asOf 过滤图谱边/文章，保留选中关系和相邻探索上下文；支持关系类别和有真实定义的关联强度；先核对数据，不能根据 UI 猜字段。 ✅ 实体模式共用同一时间条（known/valid 钟 + 截至时点，写 URL 深链）；KnowledgeAtlas 接受 time 参数，切换时点重置累积网络（跨时点事实不混读），neighborhood/entities 请求带 asOf+clock；关系类别 chips（来自真实数据的 predicate，非猜测字段）过滤画布。e2e "entity exploration honors the shared time state"、"predicate filters narrow the focused canvas"
- [x] **EG-T14 — Evidence Bundle 契约/API/MCP**（EG-13）：从 publication 层生产一个结构化有界公开证据对象（包括对象标识、relation、source URL、时间、clock、asOf、revision、coverage/fidelity）；在现有 API/MCP 上只加必要出口；网站和 Agent 读同一过滤结果，撤回内容不泄漏。 ✅ publication/knowledge.ts `publicEvidenceBundle`（schemaVersion 1，story/entity/relation 三态，edgeLimit 60，撤回内容不出现）；HTTP `/api/site/knowledge/bundle`（exactly-one 校验→invalid_object 400，时间门→invalid_graph_time，缓存 30/60s）；MCP `get_evidence_bundle`（exactly-one→invalid_request；agent.ts 文本输出与结构化输出同源）；工具名同步 contracts/mcp.ts、agent 页工具表、llms.txt、architecture.md。测试 tests/evidence-bundle.test.ts（4 项）+ mcp-graph.test.ts bundle 用例
- [ ] **EG-T15 — 一致性/资源验收**（EG-11~13）：跨事件关系的原文匹配、撤稿重新读取、分页/截断、无数据和不可用、移动端性能；测量实际请求数和内存。不得为了 UI 出效果向未公开 Neo4j API 开口。
  - 本地已测（Playwright 探针，dev 栈）：落地 /explore 1 个 API 请求（centers 目录）+ heap 18.4MB；story 模式 1 个 scoped 图谱请求（asOf+clock）+ heap 19.6MB；/knowledge 1 个请求；0 模型调用；e2e 桌面+手机 22/22（390×700 无横向溢出）、离线降级与撤回不泄漏在测试内覆盖。未向未公开 Neo4j API 开口（仅扩展现有 `/entities` 端点的 as_of/clock 参数）。**待合并部署后在 cn-dev 真实数据补测**：跨事件关系原文匹配、撤稿重新读取、截断/无数据探针。

## S3 / Gallery 与 EventGraph Story（独立路线，各自 PR）

- [ ] **EG-T16 — 真实探索画廊**（EG-14）：只用公开有证据的事件/实体生成浏览卡，能直接定位到时间轴或关系，图片/摘要基于真实已收录数据；无资源时不制造假封面。
- [ ] **EG-T17 — 结构化 Story 路线（先不加 LLM）**（EG-15）：对一个实际问题建立研究来源检索→可靠关系→逐站路径的可重现结构；每站必须有证据 URL、时间、对象和不确定性，无足够来源时断路/提示无解。
- [ ] **EG-T18 — 可选引导和 Agent 交付**（EG-15/16）：如确实需要模型生成说明，沿用 worker/Provider 与 budget/receipts 机制，访客浏览不发起模型调用。API/MCP 输出与站点证据包一致；测端到端故事跳转/原文核查。
- [ ] **EG-T19 — 全产品验收**（EG-01~16）：真实开发外部入口，知名主题示例+另一个任意事件，桌面/手机/中英；现场演示从事件时间、关系证据、实体延伸到 Story，记录所有已知历史缺口；不得在完成 P2 时抹去早期的未验证结果。

## 每个 PR 的最小提交说明模板

```text
Source of truth: specs/eventgraph-explorer/spec.md @ <approved commit SHA>
Scope: EG-Txx; EG-xx. Related Issue #61 or scoped follow-up Issue.
Research-before-build: what already exists; upstream and official evidence.
Before: failing behavior + public reproduction path (no private data).
Changes: exact paths; what intentionally not touched.
Tests: commands + results; mock vs real separately.
Review: PASS / CHANGES REQUESTED / UNVERIFIED, reviewer and SHA.
Development: GHCR digest; web/api/worker + knowledge version; external HTTP; real UI screenshot.
Outstanding: historical fidelity, truncation, privacy, deferred UX.
No merge to main, no unapproved database/Neo4j change.
```
