# 今日整活 · Ferro 原创内容与 EventGraph 承载/分发职责规格

**Status:** Draft — 用户 2026-11-06 明确更正：整活与研究由 Ferro 统一创作，原 EventGraph 自动生成流水线作废，需以修订后 HEAD 重新审核。
**Date:** 2026-11-06
**Repository / target:** jboone1989/EventGraph / develop
**Column:** 今日整活 / 每天看看世界又整了什么活
**Related:** `specs/worth-your-time-experiment-20261106/spec.md`（Ferro 价值发现实验）、现有 `modules/research`（研究栏目）。

## 1. 核心决策

Ferro 是独立的 Content / Research Agent，使用**同一套**现有来源发现、证据研究、内容生成、记忆和发布通道，产出不同的**有类型**作品：

- **fun / 今日整活**：从真实新闻/事件提取反差、幽默或荒诞，形成有事实来源的原创短评，可使用新闻现有图片。
- **research / 研究**：独立提出问题、检索原始证据、核对反例与方法，形成可追溯、可修订的研究文章。
- **worth / 值得看**：发现被忽略的作品，对真实可获得素材作有边界的体验价值判断，并从人类反馈中验证判断。

三者是 Ferro 的**三个输出类型，不是三套 Agent、三套后台模型、三条自动生成队列或每天必须完成的指标**。

EventGraph 只负责自己的新闻事实基础设施、作者受控投稿、公共栏目页面、内容存储/修订/来源链接、适用的流量/反馈记录。Ferro 的选题、创作、价值判断、总结与学习均归 Ferro 与其宿主 Agent Runtime。

原版要求 EventGraph `fun.discover` 每 15 分钟扫描、`fun.compose` 调模型、`fun.distribute` 直接调用 Omnipost 的计划全部废弃。已有新闻分析、事件分组、新闻发布和 Hero 不得因此改动。**真实内容不一定每天都有，宁缺毋滥。**

## 2. 用户故事与验收

### US1 · Ferro 找到一个真实可写的趣事（P1）

Ferro 自主读取 EventGraph 已公开新闻及其他合法材料，在自己的研究/写作流程中识别具体反差、真正有趣的变化或评论视角。当没有值得调侃的材料时跳过。Ferro 对一个新闻事件产出的短评必须记录原始 URL、关联 article/story、使用了哪些实际已知事实及文本/图片来源。

**Acceptance：** 人工/测试模拟一条有证据的 Ferro 短评与一条只有噱头无证据的草稿，前者可进入受控投稿，后者不能自动公开；新闻的收集/分析/发布均不依赖结果。

### US2 · 网站展示 Ferro 的原创建议与最终作品（P1）

在 EventGraph `/fun` 和 `/fun/:id` 可看到实际**已发布**的 Ferro 原创短评，移动端正常浏览，并能点回新闻/事件/原始证据；图片优先使用已存在、确认可引用的新闻图，缺图可用文字呈现而非强制跳过。尚未发布、已撤回的内容不显示。可在现有后台按作者和来源预览、修改、发布、撤回。

**Acceptance：** 无图/有图、已发布/草稿/撤回、中英文缺失与无内容的站点展示均可测；没有原创内容时不显示首页空栏位。

### US3 · Ferro 统一分发，而不是 EventGraph 实现第二个发布器（P2）

Ferro 使用**已有** `jboone1989/wechat-traffic-agent/src/wechat_traffic_agent/platforms/omnipost_client.py` 和自身 `publication` 渠道任务，为同一已定稿作品尝试头条微头条、微信贴图等渠道。仅在 Omnipost 运行时证实支持所需平台及图文媒介能力后启用真实自动发送；否则返回可人工发布的文案+稳定图片文件，并记录确切限制。

EventGraph 作为原创正文的公共正本，Ferro 只有在得到对应 URL/内容修订版本的已确认发布回执后才可跨平台分发。发送结果未知保持 `unverified`，不盲目重试；各平台结果独立记录。Ferro 可把已确认渠道回执/URL 写回 EventGraph 供展示、归因，但 EventGraph 不直接运行 Omnipost 客户端。

**Acceptance：** 一条作品发布本站后可生成至少一个渠道适配包；若 Omnipost 不支持特定图文渠道，诚实显示 manual_required；模拟微信失败、头条成功、请求结果未知时均不修改本站已发布作品或新闻状态。

### US4 · 研究文章同样由 Ferro 创作（P1，复用既有栏目）

现有 EventGraph `/research`、`/en/research`、`modules/research/server.ts` 和 `research_articles` 已具备后台写入、稿件发布与公开展示。**不另建研究栏目、研究数据库或另一种 AI 写作器。**

Ferro 使用自身研究能力提交署名文章、原始证据、方法、局限性；研究不能仅凭模型自述「查证过」，不能把来源摘要当核实后的一手证据。站内现有管理员审查、修订和公开机制沿用。研究与整活可共享素材和写作工具，但研究需要更高的证据门槛。真正自动投递只能通过已验证的受控作者接入完成，未打通时不得宣称已自动发布。

**Acceptance：** 以现有 `modules/research` 保存/公开一篇 Ferro 署名、有方法与来源的文章；确认未在 EventGraph 新增研究生成 LLM 调用或替换新闻事实层。

## 3. 功能要求

- **FR-001 — Ferro 单一内容能力：** 三类输出复用其已有内容 Agent/Runtime 的选题、材料获取、事实证据、创作、质量检查、版本记录、学习与平台适配。栏目差异只体现在作品类型的创作/审核标准、字段、展现方式和发布渠道。不新增 EventGraph `fun.discover`、`fun.compose`、`fun.distribute`。
- **FR-002 — 发布边界：** 每个 Ferro 作品关联 `artifact_id`、`content_kind`（`fun`/`research`/`worth`）、`revision`、署名、来源 URL/内部证据 ID、验证材料范围、标题/正文、状态和公共 URL。只在来源中立的已有作者/后台接入中增加最小需要的字段/类型，不强制重塑既有 research 表。
- **FR-003 — 今日整活页面：** `/fun`、`/fun/:id`（双语按站点当前路由惯例处理）展示已发布短评、可选的已有图、来源与作者，移动端适配；无内容空态；不改首页新闻列表，不把草稿发布到 sitemap。
- **FR-004 — 人工编辑：** 优先复用既有研究编辑后台或通用作者接口的写入/发布/撤回与审计模式；不再建新的 AI 自动生成后台。如果整活展示确需专用编辑表单，限于短评字段与图片顺序，不扩展为第二套 CMS。
- **FR-005 — 图片：** 可以引用 `articles.media`、已公开 event cover、现有 imgproxy 和合法源图；1–4 张只是内容形式选项，不是强制条件。Ferro 保存图片出处和修订版本；需分发图片时由 Ferro/Omnipost 侧准备适用的稳定媒体，EventGraph 不新建视频/生图/跨平台上传服务。
- **FR-006 — 短评标准：** 优先复用 Ferro 已有写作框架与 `human-writing`。可幽默、犀利、有独立观点，但每个可核实事实有来源；不虚构人物发言、个人亲历或新闻细节；事实不足则不公开。
- **FR-007 — 研究标准：** 研究稿件保留题目、作者、方法、证据链接、不同解释、局限、更正；复用 `modules/research`，不把模型猜想提升为已证实事实。
- **FR-008 — 渠道分发：** 统一分发由 Ferro 侧已有 Omnipost 客户端和 `PublicationEvent/DistributionTask` 承担，站点只接收必要的确定性渠道回执/链接；未证明支持头条微头条和微信贴图图文能力前不得宣称自动发布成功。
- **FR-009 — 状态与幂等：** 作品以 `artifact_id + revision` 为稳定键，通道以 `artifact_id + revision + channel` 为稳定键；重投不会复制正文，渠道未知回执不可自动重发。本站审核/撤回不能回写或改变新闻发布结果。
- **FR-010 — 与新闻零耦合：** 不在 `articleChanged`、新闻事务、内容队列或报告生成里调用 Ferro；Ferro 停机、写作失败、Omnipost 不可用时，EventGraph 新闻照常发布。
- **FR-011 — 反馈学习：** 三个栏目都可以向 Ferro 的现有结果观察机制提供相应的可追溯**领域反馈**；`worth` 负责情感/价值反馈，`fun` 关注是否真正有趣及用户反馈，`research` 关注证据可靠性与读者是否获得理解。不要统一用热度/点击作为奖励；学习候选的采纳由 Agent Runtime Evolution Engine 验证。
- **FR-012 — 不强制生产数量：** 不设 15 分钟发现、每天 3–5 篇或上限 5 篇的 EventGraph 生成任务；发布频率由 Ferro 的已有工作循环与实际素材决定。不得为保持活跃硬凑整活短评或研究文章。

## 4. Data and provenance

若现有 research/content 表不能容纳 fun 的必要字段，允许最小增量 Fun 公共作品记录，但**不新增**候选扫描/LLM job/渠道调度表作为 EventGraph 的业务引擎：

- **AuthoredArtifact:** 作品类型、Ferro/人类作者标识、revision、来源/证据、语言、内容、图片来源、公开状态和 URL。
- **DistributionReceipt:** 可选的已确认回执、平台、对应 revision、公开链接、状态与结果不明原因，按来源中立接口读写；Omnipost 运行状态的唯一执行真相在 Ferro 侧。
- 既有 `research_articles` 与研究模块继续作为研究稿件权威数据，不复制到 fun 表。

## 5. Success criteria

- **SC-001:** 真实 Ferro 创建一篇有来源的整活短评、通过已有授权渠道存入 EventGraph、公开在 `/fun`；没有真实 Ferro 连接只算网站接收端完成。
- **SC-002:** Ferro 同一套研究/写作能力能够提交一篇满足方法和证据要求的研究稿至现有 `/research`；不新增 EventGraph 研究 LLM worker。
- **SC-003:** 未建立三套模型驱动的独立内容系统；仓库 diff 无 `fun.discover/compose/distribute`、独立社媒客户端或整活定时采集，新闻流水线不受影响。
- **SC-004:** 原图来源、新闻链接、手工修改和撤稿可追溯；无图片的优质短评也可展示。
- **SC-005:** Ferro 经现成 Omnipost 路径至少能进行可验证的 dry-run/能力核对；不支持的渠道提供 manual_required，真实发布结果可回执且不确定结果不盲重试。
- **SC-006:** EventGraph 与 Ferro 任一端故障都不阻塞新闻发布；文档与测试分别验证站点界面、作者提交和已存在的分发机制。
- **SC-007:** 公共内容的访问/反馈数据不被误称为 Ferro 已学习的证明；真正的策略提升必须在 Ferro/Runtime 独立评测。

## 6. Not in scope and approval

不做 EventGraph 内新 Agent、推荐系统、全网抓取器、模型路由配置、独立定时器、图像生成、研究文章自动评审器或替代 Omnipost 服务；不修改 main 或生产。Ferro 端能力复用与接入工作应在 `jboone1989/wechat-traffic-agent` 范围内执行，不把跨仓库工作伪装成 EventGraph GH-AW 任务。

本 Spec PR 仅修订设计；原先针对 EventGraph 整活自动生成队列的评审/批准无效。修订后仍需当前 HEAD 的 Spec Review；通过后依照既有 Owner 委托自动批准及 Spec 015 的任务入队流程处理。
