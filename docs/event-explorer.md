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
2. 移到 T2，新增来源才显示；关系由 Graphiti 按同一 `asOf` 重新查询，证据可打开原始 URL。
3. 模拟 Graphiti 不可用，图谱明确降级，事件报道依旧可读。
4. 移动端（390×700）单页面切换时间、关系与来源，支持键盘和触摸。
5. 中英文切换行为一致，时间语义不混淆。执行 Typecheck、Web/Backend tests、Python compile 和实际浏览器验收。只允许合并到 develop。

## 数据审计待办

双时间过滤是对现有记录的**有界重建**，不等于可还原过去所有版本：Graphiti 的关系可能经后来的 Episode 更新、实体归并，PostgreSQL 的原始发布/修订字段亦可能覆盖旧值。要做金融 Agent 的严格历史决策复盘，需要额外验证历史修订快照或建立追加式变更账本；未经验证不得声称全量点时一致性。
