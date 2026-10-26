# EventGraph · 2026-10-25—26 产品讨论完整研究纪要与执行地图

> **状态：持续研究 / 已确认边界 + 待审定实施方案。** 文档补回此前跨会话讨论中被单一可视化 Spec 漏掉的新闻解释、公共讨论、流量增长和长期事件研究。
> **它不是统一实施授权，也不替代各条产品需求的 Spec。**本纪要是对已经能核实的讨论结论与仓库文件的结构化恢复，并非逐字聊天记录。**** 真实的用户决定优先于后续模型建议，新的争议在 GitHub 历史中追加，不覆写旧立场。
> 权威入口：[长期产品论题](product-thesis.md)；已批准的增长边界：[005 新闻获客—深读—复访](../specs/005-news-growth-funnel/spec.md)；影响证据：[事件影响追踪](../specs/event-impact-tracing/spec.md)。待批准的三个子规格：[新闻解释层](../specs/news-explainer/spec.md) · [长期演化实验](../specs/event-evolution-experiment/spec.md) · [公共讨论](../specs/public-discussions/spec.md)。

## 1. 为什么研究（同一个产品，不是互不相干的三项功能）

用户批评目前新闻主要是离散的消息与实体关联，读者得不到足够的信息密度，也很难回答“这与我有什么关系”“新新闻意味着什么”“未来该留意什么”。新闻网站依然需要 SEO/AdSense 所需的**独立内容和首页流量入口**，不能为了创新把入口删掉；但只保留新闻列表又无法在长期视角解释事件如何演变。

本轮讨论可以看成一个贯通的阅读闭环：

`首页/搜索 → 独立新闻页（5W1H） → 重要性 So What → 有依据的 What Next → 同一事件的后续 /story → 跨事件历史研究 /explore → 可选择的 GitHub 公共讨论 → 关注/复访`

不是强迫每个人经过所有阶段。**新闻是入口，证据是底座，变化与解释是增量价值，公开讨论是可选的观点层。**

## 2. 已确定、不因新研究而改变的产品边界

- **首页 `/` 不重构**。保留现有精选/全部新闻流与导航，使它继续成为流量来源；已有 `/hot`（导航写“事件树”，实际上是过去约 48 小时的事件热点榜）不因长期研究而变成事件图。
- **新闻 `/items/:id`、`/en/items/:id` 保留独立 URL 和既有收录规则**。不批量 `noindex`，不把新闻统一 canonical 到 Story；`/story/:publicId` 保留公开证据、发展和主题链接，`/topics`、本地关注、日报是复访工具。见 [005](../specs/005-news-growth-funnel/spec.md)；**允许索引与适合放广告是不同判断**。
- **EventGraph 保管事实与证据**：PG 新闻、来源/版本/时间，Graphiti/Neo4j 时序实体关系；Ferro 或其他作者可给出署名研究和假设，但假设不能自动成为事实或因果。已有 MCP/Agent 供稿能力优先复用，不能因为研究需求改写 EventGraph 的供稿框架。
- **Search Before Build / Spec-first**：产品讨论先查现有仓库、AIHOT 上游、官方文档、成熟开源，Opus 独立反方；用户批准已确定 Spec 后再实现到 feature→develop；本纪要本身不等于完成、测试或部署。

## 3. 新闻解释：5W1H + So What + What Next（此前讨论，必须保留）

这是对**新闻详情阅读价值**的提升，**不是**要求首页换版，也不是另造新闻引擎。此前讨论明确提出采用三个可区分的层次：

| 层次 | 读者问题 | 内容边界 | 未知时怎么办 |
| --- | --- | --- | --- |
| **5W1H** | Who / What / When / Where / Why / How：谁、发生了什么、何时何地、为什么、如何发生 | 只陈述被来源支持的要素；尤其 **Why** 是发生原因或来源归因，不是编辑任意补充动机 | 缺证据的元素标不明或不显示；不为凑齐六项制造“原因” |
| **So What** | **Why it matters**：为什么重要、相较此前改变了什么、谁可能受到哪些已知影响 | 区分已确认结果、客观适用范围/企业暴露、来源解释、尚待验证假设；不将同步价格变化宣称为因果 | 影响没有可信证据则说仍待核实；不硬造行业/投资结论 |
| **What Next** | 下一步该关注什么 | **已公布**的生效/投票/发布/会议日期、尚待确认的问题、可以观察的公开指标、明确的信息缺口；用“待关注”而非“必然发生” | 没有已知下一节点就不虚构预测；不能让模型写想象出来的后果 |

**Why（为什么发生）不等于 So What（为什么重要）**；**What Next 不是预测、交易建议、战争结果推演**。来源说“因为 X”属于带署名主张，不代表 EventGraph 已证明 X→Y。金融/政策/军事等领域尤其要严格区分报道、推测、指标变化和因果。

实施时先研究现有 `apps/web/app/routes/item.tsx`、`StoryFollowups`、`packages/backend/src/publication/items.ts` 和已有摘要/事实来源；不要在浏览器打开时调用大模型，不另建第二套文章实体或独立解释 CMS。优先用少量真实样本判定哪些字段可稳定提取，再确定是否需要离线 editorial worker 生成补充字段。生成策略、缓存/修订、文本质量、双语、来源可见性、无数据空状态和具体验收已另列 [新闻解释层草案](../specs/news-explainer/spec.md)，**仍待用户批准**。避免把 5W1H 做成六个空的模板栏目或覆盖原新闻正文。

其与长期研究的关系：新闻页介绍一个**当下切面**，`So What` 可链接有出处的已有过程/状态变化，`What Next` 可指向已确认的后续观察点；更复杂的分叉、汇聚留给 `/story` 与 `/explore`。

## 4. 事件演化：事件、状态、过程、决策与知识修订

用户的 Git 分支类比是为了帮助理解“今天只是历史发展的一个切面”，而**不是**要求复制 Git 的分支/合并数据模型。

- **Diff**：这一条报道相对此前可靠信息增加或改变了什么；
- **History**：在过去的某个时点，哪些事实与来源当时已能知道；
- **Blame/Provenance**：每项解释何时由谁提出、为何可信、后来如何更正。
- **多个独立的过程可能相互影响、分叉和汇聚**；线条相交或共享实体本身不证明因果。现实世界并非只有唯一根节点或唯一解释。
- **三类时间不要合并**：事实发生/状态生效；来源发表/本站首次收录；跨事件解释提出/公开。今天提出的关系即便引用过去事实，也不应出现在过去的“当时已知”回放中。
- Opus 独立反方提出的重要补充：决策是行动者在有限信息下作出的选择，不能等同于被动状态变化；历史结局并非当时已注定。“某某局势升级指数”之类不可测且无证据的变量不能硬塞。正式存在的制度过程可有稳定 ID；分析者事后串联的线索只能作为有归属、可撤回的解释。
- 保留证据有界回放的真实局限：现有 `known|valid` 不是完整的逐版本时间旅行。没有来源便明确未知，不能补画关联。

**载体决策**：初始研究放已有 `/explore`，案例含 2–3 个独立 Story 的轨道和人工标注的交叉出处；不要仅做单 Story 美化。先实验理解/错误因果归因，再考虑长期过程成为新的页面或数据实体。已有 `/story`、Cytoscape、TimeMachine、StoryRoute、Graphiti 先复用；第三方 vis-timeline、NewsLines 等检索与取舍见 [研究](../specs/event-evolution-experiment/research.md)。**这是验证方向，不是整个产品定位的全部。**

## 5. 公共讨论：GitHub Discussions + giscus（此前遗漏）

此前已讨论过：**不自行开发用户注册、评论表、点赞/审核后端**；利用 GitHub 原生 Discussions 存放社区交流，并使用成熟的 [giscus](https://github.com/giscus/giscus) 把讨论嵌入站点页面。EventGraph 的新闻、Story、证据、纠错仍由自己的公开阅读层负责，**社区观点不写回 facts/Graphiti 作为事实**。

### 页面与讨论的关系

- **以事件为讨论单位**：同一事件下的不同新闻页、中文/英文页面理想情况下共享一个 Discussion，而不是按每个 URL 自动创建多个孤立讨论。优先使用 canonical Story publicId 作为稳定映射键（例如 giscus `specific term`），不要用随译名、文章标题或语言变化的标题作为身份。
- 先核实已经存在的 `story` ID / 合并别名语义；如果一个新闻尚未归组/已转移 Story，要在具体 Spec 中定义回退/重定向行为，不能强行生成一个不存在的事件讨论。
- 读者在**新闻详情页和事件详情页**可以查看/参与对应的讨论；研究页若展示讨论也只是链接现有相同事件讨论，不复制观点存储。不能为了讨论改首页。
- GitHub 登录是发言门槛：**游客可读，发言者须 GitHub 账号授权**。网站本身不引入登录系统。Giscus 有按特定字符串、pathname、URL 或 discussion number 的映射方式，具体使用哪种要验证是否精确复用同一条讨论。按 Discussion ID 映射不支持自动创建，不能假设它自动工作。
- 讨论有 GitHub 原生分类、锁定、报告/管理和管理者删帖权限；**不是“只有作者本人才能删除”**。应该解释作者管理本人内容与维护者的审核权是两回事，不杜撰 GitHub 权限。
- 不给每条新闻预创建讨论造成空帖与垃圾；依 giscus 官方方式在首次评论时创建或仅对已有事件讨论开放（要通过真实测试确认），后续运营分类和最低内容审核需在正式启用前配置。

### 已核实状态与待验证

2026-10-26 GitHub REST `repos/jboone1989/EventGraph` 显示 **`has_discussions: true`，仓库公开**。这不证明 giscus 已安装、类别已配置或网站评论已运行。正式实施依 [GitHub 公共讨论 Spec 草案](../specs/public-discussions/spec.md) 核实 giscus GitHub App 安装、repository/category ID、站点 CSP、移动端、懒加载、两种语言一致、GitHub 授权体验及审核权限。官方资料：
- [giscus 官方](https://github.com/giscus/giscus)；[页面映射/配置](https://giscus.app/)
- [GitHub Discussions 管理](https://docs.github.com/en/discussions/managing-discussions-for-your-community)
- [GitHub Discussions Moderation](https://docs.github.com/en/discussions/managing-discussions-for-your-community/moderating-discussions)

**重要的开放问题**：只有部分读者有 GitHub 账号，这会限制互动转化。首轮以“讨论可读、入口可理解、不会干扰新闻 SEO/速度”为准，发言增长不作无依据承诺；不因为这一限制就转向自建账号系统。

## 6. 事件详情页去重与事实阶段质量（2026-10-26 新增）

**用户已同意纳入整体规划，并要求 Claude Opus 独立审核**，并未批准直接改业务代码、数据库或生产。详见单独 [事件详情页精简 + Fact 归组诊断 Spec 草案](../specs/story-detail-dedup/spec.md)。

- **真实发现**：VM13 开发预览的 OKX-ICE 代币化股票异议 Story（publicId `93a28e20-4a3b-4f3e-89ee-e07deb8897ea`）有 **11 篇报道、3 个来源**，当前 Story 页重复呈现同批报道的时间回放、事件进展、Story 路线、完整来源索引与报道时间线。StoryRoute 基于 Fact 生成 **11 个站点**，但很多站点是多家媒体对“异议数 9→16→22”的相似报道，是否真正属于同次发生仍待逐条原始证据诊断。**不允许仅凭标题和数字自动将不同事实合并。**
- **最小设计方向**：普通事件页只保留一份概览 + 关键变化/发展阶段 + 一处完整来源时间线；从既有 `/explore?story=` 深链进入完整时间机器/图谱/多维证据。移除或折叠重复完整来源索引与嵌入的全功能 Explorer，空影响分类默认不占版面。证据始终可追溯，并保留 `/story` URL、SEO、中英展示和全部公开原文。
- **先事实诊断，再选改法**：现有 `publication/story-route.ts` 每 Fact 一站，`publication/stories.ts` 已生成按 Fact 聚合的 developments，`events/group.ts`、`relate.ts` 已有 SAME_OCCURRENCE/SAME_STORY 与人工纠正。需要先核对同次发生与多次独立发展，决定到底是 UI 多次渲染、Fact 归组错误，还是事实不同但阅读阶段可以归并。不能为让站点数量好看而篡改底层 Fact。
- **Claude Opus 5.5 独立反方已返回实质意见**：[评审记录](../specs/story-detail-dedup/opus-review-2026-10-26.md)。它明确指出：11 篇报道/11 个 Fact 不能直接视为分组错误；Story 页移动端 Explorer 先于综述，才是最明显的阅读优先级问题；删除重复来源区之前要把原文直链、修订/单一来源/时间口径信息集中进唯一报道时间线。这些是已接受的方案修订，不等于实施或 GitHub CI 审查通过。
- **同整体产品策略的连接**：新闻页 5W1H + So What + What Next 与 Story 页“概览、重要变化、下一步观察”需要共享证据，但**不能通过复制三组新卡片再制造新的重复**；首页、热点榜和新闻 SEO 获客不变。GitHub Discussions 仍是独立评论层，不干扰事实/事件去重。

## 7. 流量、内容质量与留存不能丢

沿用 [005](../specs/005-news-growth-funnel/spec.md) 的路径和度量：Search Console 具体 URL 的展示/点击/CTR、读者从新闻到 Story 的二跳、真实返访、AdSense 合规广告的后续收益。首页不为复杂可视化改版；文章页是 SEO 首入口，Story/Explore 是理解价值，GitHub Discussion 是补充的读者参与渠道。**可被索引不等于获得自然流量，也不代表广告合规**。

讨论层不能给新闻内容造“热闹”的虚假反应；它对搜索引擎是否增加可索引正文价值未经验证，不能把第三方 iframe 评论视为 SEO 保证。多语言文章保持独立价值；真实信息和来源优先于栏目丰富程度。

## 8. Search Before Build 结果如何映射到三条工作流

| 工作流 | 首先复用 | 不重复造什么 | 下一步审定文件 |
| --- | --- | --- | --- |
| 新闻解释 5W1H + So What + What Next | `/items`、现有 editorial 摘要、StoryFollowups、publication 事实/来源、已有模型 Provider/worker | 第二套新闻采集、文章数据源、无证据模板引擎、页面打开时 LLM | [新闻解释草案](../specs/news-explainer/spec.md) + [005](../specs/005-news-growth-funnel/spec.md) |
| 跨 Story 演化 | `/explore`、StoryRoute、TimeMachine、Cytoscape、Graphiti | 第二套关系图数据库、因果引擎、通用时间轴库或前端浏览器推理 | [实验 Spec 草案](../specs/event-evolution-experiment/spec.md) |
| 社区讨论 | GitHub Discussions + giscus、既有稳定 Story ID 与页面路由 | 自建评论 DB、账号系统、通知/审核后端 | [GitHub Discussions 草案](../specs/public-discussions/spec.md)；实施前核对官方配置/权限 |

### 三条路线不是一个 PR 一口气实现

1. **先保存完整研究/约束**，防止下一轮只记得最近的可视化讨论；让 Opus 根据相同原始仓库与研究纪要独立审查并保留意见。
2. 新闻页的 5W1H/So What/What Next 应重点评估**真实信息增量、低质量模板风险、可索引页信息密度、双语**；不和多轨可视化绑在一起开发。
3. GitHub Discussions 是独立且成熟的集成，优先原生配置、低成本 UI，不等待新的因果模型才能讨论；上线、授权、类目和审核需真实验收。
4. 跨事件长期演化先验证证据和读者理解，后续才评估可规模化的过程组织和独立、可索引态势页。
5. 所有实施仍走事先批准 Spec → feature PR → develop → 独立 Reviewer + CI + 实际浏览器验证；生产 main 按既定发布计划，不能因为本文而擅自部署。

## 9. 这次恢复后仍应保持开放的问题

- 新闻版 `5W1H` 是否一次生成全文中的结构化小节、还是以已有摘要+事实增量片段呈现？哪种最能提高信息密度而不变成空标签？先用真实文章样例评估。
- `So What` 是面向普通读者普遍重要性还是可选的投资/企业/监管者视角？不要求用户交出私人信息。
- `What Next` 的可核实“下一节点”来源、过期/改期更正和自动刷新如何处理？
- 多个 News Item 未归入 Story 时是否展示公共讨论？讨论在 Story 合并、更名、语言页面切换时如何保持归属？
- 多轨工作台经验证有价值之后，需要到什么程度才应把长期过程作为稳定公开对象？要避免后见之明回填。
- 讨论作者权限、维护者审核权限、评论跨语言体验和 GitHub 授权转换需要测试；本纪要不宣称已经实现。

## 10. 状态快照（截至本文件写入）

- **已有事实**：EventGraph `develop` 中有首页/独立新闻页/Story/Explorer、Graphiti/PG、已有基础 time machine、研究页面及 [005](../specs/005-news-growth-funnel/spec.md)。
- **本次用户确认**：首页保持，研究能力可走既有 EventTree 或新页面；最终讨论倾向以 `/explore` 做小型跨 Story 研究；**Search Before Build 是前提**。用户特别要求完整保留 5W1H + So What + What Next 和 GitHub Discussions 的较早讨论。
- **尚未证明实施**：新闻三层解释内容、giscus 集成、跨 Story `?case=` 均未在此次调研中验收或部署；前述内容是规划/草案。已有 Discussions 仓库开关不等于 giscus 网站已上线。

> **防遗漏约束**：以后讨论 EventGraph 重大产品方向，必须同时核查本纪要第 3、4、5、6、7 节，并分别说明对新闻解释、事件研究、公共讨论、事件详情去重、流量/SEO 的影响；只谈新视觉页面不算完成产品方案回顾。
