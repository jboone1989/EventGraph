# 新闻详情 → 知识图谱实体导航

**Status:** Draft
**Branch:** develop
**Date:** 2026-11-11
**Owner request:** 每篇新闻列出该新闻直接相关的 Graphiti entity；点击进入现有实体详情页面。验收样例：`/items/up1qpo8b0p6x82s6sltvnqzbb`。

## 目标和边界

当前新闻详情 `apps/web/app/routes/item.tsx` 显示事件与标签，但没有通往知识图谱实体的入口。现有 `/knowledge/entity/:key` 及 `/en/knowledge/entity/:key` 已提供实体档案、事实关系、原始出处和相关事件。**最小新增**“关联知识实体 / Related entities”区块，把新闻读者带进同一知识网络。

只复用现有 `publications`/Graphiti/Neo4j/知识图谱服务，不增加模型调用、不重新抽取实体、不增加数据库迁移、不重做知识图谱或事件页。保持现有新闻页面与 Graphiti 故障隔离，不因本功能使新闻 SSR/详情页发生 500/502。

## 需求

1. **准确关联（FR-01）：** 以当前新闻的 `article_id` 和已经入图的 episode revision 为准，查询该条新闻 Graphiti episode **直接提及**的实体（Graphiti Episodic→MENTIONS→Entity），而不是猜测标题或从所属 Story 的全部文章合并实体。包括没有事实 RELATES_TO 边的独立提及实体。先查明现有 Neo4j/Graphiti 的真实关系类型和结果字段；不得假设虚构关系。若真实 schema 无 MENTIONS，可在实现前记录证据并采取仅当前 article ID 证据支持的关系端点降级，明确覆盖局限。
2. **身份准确（FR-02）：** 返回实体使用 Graphiti 自身稳定 `uuid/key` 和 `name`，按 key 去重，名称为空、原始 URL 标签等垃圾实体可过滤；**禁止**用相似名称拼接 UUID、复制名字制造“实体”、用标题里关键词冒充已入图。相同实体在多个新闻保持同一实体详情地址。不要给没有证据的实体强行贴人物/公司类型。
3. **公开性（FR-03）：** 只向已公开且允许展示的新闻返回关联；撤回/未公开、被隐藏的内容不得通过关联接口泄漏。与既有 `hasItemPage` 和公开知识图谱出版规则保持一致。摘要许可受限的新闻不得因为图谱绕开许可。
4. **接口（FR-04）：** 复用 `knowledge_service/server.py` 和 `packages/backend/src/knowledge/graphiti.ts` 的 Graphiti 通讯，在现有 `apps/api/src/routes/knowledge.ts` 下增加单篇报道查询，例如 `GET /api/site/knowledge/items/:id/entities`。返回类型化结果 `{ status:'ok'|'empty'|'not_ingested'|'unavailable'|'disabled', entities:[{key,name}] }`（不存在的新闻仍应 404），限制 ID 长度、实体数量及超时；Graphiti 不可用不能抛成新闻页 500。
5. **页面（FR-05）：** 在 `apps/web/app/routes/item.tsx` 的正文解读/所属事件附近增加可读的“关联知识实体 / Related entities”，复用现有组件/样式：紧凑的名称 chip/链接按自然行换行，名称不会挤掉邻居，390px 窄屏可点击/可键盘聚焦。用路由 Link 导向 `/knowledge/entity/${encodeURIComponent(key)}`，英文版导向 `/en/knowledge/entity/${encodeURIComponent(key)}`；不跳首页或图谱检索页，也不新建实体详情页。
6. **失败与空状态（FR-06）：** 数据读取不阻塞新闻正文或移动端 preview；客户端请求可异步按需加载且可取消。未入图显示“尚未建立知识实体关联”；Graphiti 错误显示“知识图谱暂不可用”（或轻量重试），**不得**把故障伪装成“没有关联”；空结果不做模型请求。若需要异步渲染，遵循 `StoryFollowups` 的 IntersectionObserver 模式以避免额外首屏成本。禁止重复请求/无限重试。
7. **真实验收（FR-07）：** 以用户示例新闻为端到端样本核对实际返回的直接关联 entity、稳定 UUID 和可打开的实体详情（例如 Jensen Huang，必须由本条新闻的真实图谱返回才能出现，不能硬编码）；对普通入图报道、尚未入图、已撤回、Graphiti 500、中文/英文、390px 桌面/手机至少覆盖正反例。若样本尚未入图，记录真实缺口，不把名字猜出来塞到 UI。

## 非目标

- 不影响现有 Graphiti ingest 调度/每日新闻队列/动态模型路由。
- 不在每条新闻都自动回填 Graphiti，不增加付费 LLM 兜底。
- 不因共同出现就展示关系线，更不推断因果或证实报道中的争议性指控。
- 不在部署生产时自动更改 dev/prod 数据或隐式合并 main；按现有 feature→develop→main 发布门禁。

## 实现约束与验收

- Search Before Build：复用 `apps/web/app/components/ui`、`KnowledgeAtlas`、`itemAvailability` 等既有能力；不自写通用图引擎或组件库。
- 小函数、显式类型、无需新增依赖；防止实体 API 泄露仍未公开的 report；有明确 cache TTL 但异常不作成功缓存。
- 单测验证 direct episode 过滤、UUID 去重、标题/实体名特殊字符、安全公开规则、未入图/空结果/故障；Web 测试验证中英文路由、触屏换行、加载/故障不阻塞正文。
- 真实部署以 develop 预览为准，CI 和代码审查通过后自动合并；附页面截图或 Playwright 结果、API 回包和可点击实体详情的链接。未拿到真实浏览器/真实 Graphiti 证据时不能宣告“已上线”。

## 交付任务

1. 校验 Graphiti episode→Entity 实际 schema、公开性/修订版本数据，并冻结接口返回结构。
2. 新增只读 Graphiti 实体关联查询及 API；复用已有权限/公开性守卫。
3. 在 item 页面添加双语可点击实体区块，与新闻解读/所属事件并列，响应式适配。
4. 补自动化测试并运行真实示例/异常/移动端验收；走现有 spec-review→GH-AW Worker→CI+review→develop 预览流程。
