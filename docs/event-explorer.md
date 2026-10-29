# EventGraph Explorer — 双时间回放与验收边界

Issue: https://github.com/jboone1989/EventGraph/issues/61

## Search Before Build / 复用记录

- 上游 AIHOT：保留原有事件归组、`storyReports`、`publications` 来源视图，不重写采集和事件树。
- EventGraph `EventTimeMachine`：保留原排序分组、拖动、前后阶段和播放，补受控状态与首次发现时间。
- EventGraph `KnowledgeExplorer` / `RelationEvidence`：沿用已有关系图和原始来源证据 UI，不再复制一个图谱组件。
- EventGraph `knowledge_service/server.py`：使用 Graphiti/Neo4j 已有的 `created_at`、`expired_at`、`valid_at`、`invalid_at`，没有单独构建另一套关系数据库。
- API 复用 `/api/site/knowledge/stories/:publicId`，以可选 `asOf` / `clock` 扩展，不破坏默认当前快照。

## 时钟及历史真实性

- `clock=known`：报道列表按 `publications.discovered_at`；Graphiti 关系按 `created_at <= asOf` 且未在当时过期；来源 Episode 创建晚于该时点的会被过滤。**仍须对历史修订、内容覆盖进行进一步审计，不能声称完整的时间旅行快照。**
- `clock=valid`：报道按来源 `published_at`；Graphiti 事实使用 `valid_at/invalid_at`。这是事后根据有效时间回顾，不代表当时已获知。
- 两种模式读取都必须满足**当前**公开权限：撤稿、待发布、非编辑信源不可因查询过去而重新公开。
- 缺失历史时间戳时不推断，Graphiti 不可用时不给当前关系伪装成历史关系。
- 当前 AI 综述、热度、报告全集不是历史数据；页面明示其仍是当前状态。
- 事件页目前最多加载 100 篇报道，因此回放可能不是完整起点，必须保留提示。

## 联动验收

1. 在开发版一个有多篇来源的真实事件里，选中 T1，来源列表只包含 T1 前已发现（或发布）的报道。
2. 移到 T2，新增来源与事件进展才显示；关系由 Graphiti 按同一 `asOf` 重新查询，证据可打开原始 URL，并同时区分报道发布时间与本站首次收录时间。
3. 事件进展只显示代表报道在所选时点前已发布/收录的条目，不展示当前总报道数或后见之明的事实标题；当前事件归组可能后续修订，因此这部分是有边界的重建，不是完整历史快照。
4. 模拟 Graphiti 不可用，图谱明确降级，事件报道依旧可读。
5. 移动端（390×700）单页面切换时间、关系与来源，支持键盘和触摸。
6. 中英文切换行为一致，时间语义不混淆。执行 Typecheck、Web/Backend tests、Python compile 和实际浏览器验收。只允许合并到 develop.

## 数据审计待办

跨 Story 案例实验同样复用 `clock` / `asOf` URL 与既有时间控件：`known` 按每篇证据的 `discoveredAt`，`valid` 按来源 `publishedAt` 截断；显式未来发布的报道两种时钟都不提前显示，缺发布时间不猜测。非法、仅日期或无时区的截至参数回到最新，避免把不可解析时点伪装成空历史。站点、证据计数和端点失去证据的联系同步过滤。`known` 还要求人工联系的 `curatedAt` 不晚于截至时点；只有 ISO 日期而无时刻的标注，保守地等该 UTC 日期完整结束才显示，不伪造当天具体小时。`valid` 是事后回顾，保留后来的策展日期，不声称当时已知。

StoryRoute 每站只携带最多六条、精选优先的来源，不代表全部成员。历史案例只把当前可展示的站/报道/来源计数标为下界，隐藏单来源推断；不从该子集重算后端的站级总来源数或真实首次收录时刻。站点仍按后端真实首次收录排序；在 known 回放中，只要权威 `timeRecorded` 已早于截至时点，即便当前最多六条精选来源都无法展示该时点前的成员，也保留站点并明确标注“有限来源无可展示证据”。这只证明本站当时已经记录过该站点，不补造被截断证据；无可展示证据也不能反推当时不存在报道。完整历史修订与被截断证据仍不在这次修复范围。

历史案例不显示当前摘要或没有策展日期的负例说明；当前案例标题/轨道标签、已修订事实标题仍只是当前编排，页面明确说明这不是旧版本快照。“回到最新”恢复当前全部公开数据及负例。撤稿内容仍无法通过历史视角恢复。此修复覆盖 `event-evolution-experiment` FR-02/FR-04，FR-08 读者对照实验及 giscus 真实发帖仍另待验收。

双时间过滤是对现有记录的**有界重建**，不等于可还原过去所有版本：Graphiti 的关系可能经后来的 Episode 更新、实体归并，PostgreSQL 的原始发布/修订字段亦可能覆盖旧值。要做金融 Agent 的严格历史决策复盘，需要额外验证历史修订快照或建立追加式变更账本；未经验证不得声称全量点时一致性。

## 混合版本开发环境的兼容性关卡

开发环境的 `develop` 推送工作流发布应用镜像，不一定同步重建独立的
`knowledge_service` 容器。旧 Graphiti 版本会忽略 POST 请求中的 `as_of` 字段；
因此时点查询要求 Graphiti 显式返回 `temporalSupport: "bitemporal-v1"`。
服务未升级时 API 只返回 `status: "unavailable"` 和空关系，绝不可把当前图谱当历史关系。
完整的图谱时序功能必须在开发机上部署匹配的 Graphiti 服务并验证后才算上线。

## 影响层与站级证据抽屉（impact-tracing P1）

Spec：`specs/event-impact-tracing-p1/spec.md`（PR #198 merge `b9a913c`，Issue #176 T07）。P1 只补三件
现有实现缺的东西：封闭的证据类型词汇（`packages/contracts` 的 `IMPACT_EVIDENCE_KINDS`：
`fact_station` / `related_reporting` / `market_observation`；"客观暴露/依赖"与"分析假设"两类永远只
以空态文案出现）、事实站的一跳类型化投影、站级来源证据抽屉。无新表、无迁移、无新查询、无模型
调用、无回填；渲染不触发模型调用。

- **字段透传**：`publicStoryRoute` 在同一条只读查询里补选 `facts.subject/action/object`（可空，null
  保持 null），`StoryRouteStation` 契约增加同名 `string | null` 字段；公开过滤与合并解析不变。
- **层归类**（`apps/web/app/features/story/impact-layers.ts` 纯函数）：每个站确定性归入唯一层，
  优先级 `conflict_event`（结构化 action 命中冲突词）→ `policy_statement` → `company_disclosure`
  （还须 action 明确为披露/停产/停工陈述）→ `logistics_observation` → `unclassified`。词典复用
  PR #134；**结构化 action 缺失时不得用标题共现顶替动作守护**，冲突/企业分类不命中。词典只决定
  "这条事实在哪个层被阅读"，错分可能性存在，层标签一律用"线索/陈述"措辞，绝不使用"影响/导致/
  生效"，政策站永不显示"拟议/宣布/生效/撤销"阶段标签（是机构言语行为，不是政策生效状态）。
- **抽屉**：影响工作台的"影响线索"页（手机端"来源"页同样可达）列出带层标签的事实站；每站与每条
  `related_reporting` 线索都有可展开抽屉：原文链接（`source_open`）、`/items/:id` 入口、修订号
  （`revision=null` 显示"原版/Original"，首版证据绝不隐藏）、occurred/published/discovered 三个
  时间（随时钟高亮依据侧）、`singleSource`/`revised`/`occurredAtMissing` 旗标、evidenceKind 标签
  与"有界重建"警示。事件页的 Story 路线面板同样带层标签与抽屉。
- **红线**：任何两个层之间不渲染箭头/连线/连线语义，跨层"链"只能以"断链说明"文案出现；Graphiti
  的泛化 `RELATES_TO` 不参与影响类型化；市场观测只来自 `market_snapshots`（数字共现如 "$117"
  永不进入）；站点仅在无可显示报道（缺原文链接或缺 published/discovered 必需时间）时隐藏，隐藏不
  反推不存在。图谱不可用时影响工作台照常渲染（route-only）。

### 只读 DB 复核 SQL（供任意审查者复跑，不进 CI）

```sql
-- T0（story 3d1ae73d…）事实站与唯一证据行：层输入字段 + 三时间 + 修订
SELECT f.public_id, f.title, f.subject, f.action, f.object, f.occurred_at,
       p.revision, p.published_at, p.discovered_at, src.name AS source
FROM facts f JOIN stories s ON s.id = f.story_id
JOIN fact_articles fa ON fa.fact_id = f.id JOIN articles a ON a.id = fa.article_id
JOIN publications p ON p.article_id = a.id JOIN sources src ON src.id = p.source_id
WHERE s.public_id::text LIKE '3d1ae73d%';

-- USTR 关税表态（story 7bdc9a83…）：政策层站，USTR 官方 + France24 两来源各自修订
SELECT f.public_id, f.title, f.subject, f.action, f.object, src.name AS source, p.revision
FROM facts f JOIN stories s ON s.id = f.story_id
JOIN fact_articles fa ON fa.fact_id = f.id JOIN articles a ON a.id = fa.article_id
JOIN publications p ON p.article_id = a.id JOIN sources src ON src.id = p.source_id
WHERE s.public_id::text LIKE '7bdc9a83%' AND p.visibility = 'public';

-- gCaptain 两稿的归组状态（T06 §6.1 背景案例；混淆控制证据）
SELECT a.id, a.grouping_status, a.title FROM articles a
JOIN sources src ON src.id = a.source_id WHERE src.id LIKE '%gcaptain%' ORDER BY a.created_at DESC;
```
