# 006 · EventGraph 运营后台、GLM 任务恢复与亚洲信源

> 2026-10-25。用户已确认要重点处理：后台专业化、付费 GLM 实际运行、积压清理、亚洲与高价值信源接入、删掉无价值页面。新会话先读本文件和 research/plan/tasks；延续 Spec 005 三个商业目标：获客 → 点击/深读 → 回访，AdSense 只作为合规商业终点。

## 已核实的事实（不要和推断混淆）

- 开发 PostgreSQL：49 个信源，2 个 provider 连接、15 个模型、7 个显式模型阶段选择；**1 个付费智谱 GLM-5.3 Flash**，model UUID `98ac1a72-6321-4405-a12b-3a549ed00c68`，enabled=true、route_enabled=true、probe 已配置，最近有效验证时间 2026-10-23 06:30（检视时已超过 24h）。
- 开发环境 7 个阶段配置实际全部选中 **NVIDIA** 模型（预筛、评分、英文、结构抽取对应 NVIDIA z-ai/glm-5.3-flash；digest/report/groupReview 对应 NVIDIA DeepSeek）。仅仅把付费 GLM 加入连接，不会自动改变这些显式模型路由。
- 开发库失败/被阻断记录中：`Model cannot route text: Configuration changed: model; retest required` 约 352；`No eligible configured model for prefilter` 约 313，`receipt outcome unknown` 若干。这是实际内容状态，不等于所有独立任务数。
- 生产库 Provider 连接/注册模型/阶段选择无记录；`articles`: `new 21`、`failed 200`、`blocked 331`、`analyzed 1796`、`skipped 8525`。**注意 `blocked` 是预筛拒绝的正常业务终态，不是等待队列**；不可再把 331 称为异常积压。生产 Graphiti 的历史失败 pgboss.job 很多（约 584），要按是否仍活跃/关联当前任务区分。
- `selection.ts` 自动模型池只选 NVIDIA 免费试用，`retest.ts` 只检查狭窄 22–30h 有效窗口，旧检查或曾失败的检查可能永远不恢复；`jobs/content.ts` 将可恢复路由错误算成文章失败次数。
- 现有后台有来源、模型、队列、分析和审计功能，只是流程分散、默认落地页为信源、移动端导航过密。**没有后台页面使用数据，不可凭感觉物理删除路由。**

## P0 · 让任务可靠处理

- 可恢复的“Provider 模型当前不可路由/等待重测/暂无已验证候选”不计入文章 `processing_attempts`，保留明确原因和下一次恢复时间。配置格式本身不合法、明确拒绝等其他错误仍按既有逻辑处理。
- 明确设为 route_enabled 的付费模型能在免费已验证候选不可用时被自动模型池选择；这是一种 **可计费的显式 opt-in**，不自动改变已有阶段绑定。显式 NVIDIA 绑定失效时要在后台突出“阶段仍指向旧模型”，不能暗中把全部步骤切换付费模型。
- 自动重测要容忍错过 24h 窗口或曾经失败的能力校验，失败至少冷却 6h，每轮最多 3 次真实探测；`MODEL_CALLS_ENABLED` + `MODEL_PROVIDER_REGISTRY_ENABLED` 必须启用。不能绕过收费回执/预算熔断。
- 旧 failed 内容**不因代码部署自动批量重新触发付费调用**：开发环境先通过测试后，从现有后台分组重新入队，控制每批数量，观察真实通过率和成本；生产不擅自放量。
- 未经 operator 显式确认不自动改开发和生产的模型阶段设置。阶段选择与已启用模型/是否通过校验必须一目了然。

## P1 · 有效信源实际进入内容链路

- `industry/sources.json` 从 52 个配置开始，本轮只加入有官方可追溯 URL 的 **BOJ** `https://www.boj.or.jp/en/rss/whatsnew.xml` 和 **RBI** `https://rbi.org.in/pressreleases_rss.xml`，初始回填 3 条/源、只保留摘要和原文链接。
- 新增配置不等于已在开发/生产 DB 中采集成功；验收必须逐一预览并核对成功/失败、实际发现、文章入库、是否入事件，以及 worker 运行和 `COLLECT_ENABLED`。
- 当前没有在 `develop` 与生产库证实“最近大量亚洲源已接入”；继续找来源清单/历史分支并核对，不要把用户记忆当作错误。
- 可补日本 METI、韩国 BOK、MAS 新加坡等**官方提供稳定 RSS/API 且能够成功采集**的来源；拒绝臆造 URL/直接复制所有媒体 feed；重大金融/AI/加密公告优先一手来源。

## P2 · 操作型后台设计

- 默认后台首页直接回答：**worker 是否在线、哪类文章等待、哪个模型不可路由、积压原因、下一步操作**，而不是空白欢迎页或配置列表。
- 主导航按任务重排：运营（运行/流量）、内容（信源/诊断/编辑）、模型（Provider/阶段/评测）、其他（审计/反馈/设置）。不要重建框架，复用 `AdminPage/Stat/Card/DataTable`、React Router 和现有鉴权。
- 运行页分清 pgboss.job created/retry/active、article.processing_state new/failed、正常业务 `blocked` 预筛过滤；相互不重复加总。
- 390px 手机和 1440px 桌面实际验收，检查主要操作是否容易找到、导航是否遮挡、数据表是否横向溢出、空/错误状态是否可读。暗/亮两模式尽力核验；没截图/浏览器证据不宣称完成视觉测试。
- 模型页面后续要把 `capability → 当前模型 → Provider → 最近能力测试 → 不可路由原因 → 重新验证` 变成一眼可见的表，不新造 Provider 引擎。

## P3 · 精简而不误删

- 首轮将低优先级工具收入“其他/更多”，保留旧路由、API 和历史记录；SelectBench、审计等仍承担真实职能，不能因为非首页入口就删除。
- 后续有明确用户确认/真实使用情况时，成组删除不需要的路由、测试、导航、API 和文档，不留下死链接。未经证据不要物理删除，以免破坏现有功能。

## Release

该 PR 仅针对 `develop`；生产按约定 `develop→main` 发布，不直接改 main，不主动激活大量付费请求。不以 PR CI 或源码变化冒充线上已修复。需要审批运行策略/模型费用/来源部署时应与现有后台授权流程一致。
