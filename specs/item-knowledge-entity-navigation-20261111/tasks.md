# 新闻详情 → 知识图谱实体导航：GH-AW Work

**Spec:** `specs/item-knowledge-entity-navigation-20261111/spec.md`
**Plan:** `specs/item-knowledge-entity-navigation-20261111/plan.md`
**Status:** Owner-approved; requires successful Spec Review and owner merge before automatic Work intake.

## Work Items

### T001 — 实现每篇公开新闻到实际 Graphiti 实体详情的完整导航
**Scope:** 先验证真实 Graphiti episode→实体关系及现有公开性/修订版本守卫；在 knowledge_service、backend Graphiti 客户端与 API 增加单条新闻的只读直接实体查询；在 item 详情加入中英文、移动端可用的实体 chip 链接；完成 API/Web 单测及实际新闻样例验收。只改本功能涉及的文件，不增加模型调用、数据迁移、队列或新的实体详情页。
**Depends on:** none
**Acceptance:**
- 给定已公开且当前 revision 已成功入图的报道，只返回该 article 当前 revision 的 episode 直接提及的真实 Entity key/name，包含无 RELATES_TO 事实边的直接提及；不会混入同一 Story 的其他报道或过去 revision，不能靠标题猜实体。
- 给定最新入图 revision 落后于文章当前 revision，返回 not_ingested 和空实体；文章不存在或未公开/撤回/隐藏时返回 404，不能通过接口泄漏；保留许可与现有公开出版规则。
- 接口状态区分 ok、empty、not_ingested、unavailable、disabled；Graphiti 4 秒内超时隔离，Graphiti 不可用时新闻页面正文仍可读且不会因实体区块变成 500/502；disabled 不渲染，empty/not_ingested/unavailable 使用 Spec 各自双语文案。
- 返回 Graphiti 稳定 key/name，按 key 去重，强制去掉空白名称和纯 URL 名称，按 Spec 的名称再 key 顺序固定排序；最多 50 条，totalCount 是过滤去重后的全量，超出时 truncated=true 并展示准确的另有 N 个提示。
- 中文链接到 /knowledge/entity/:key，英文链接到 /en/knowledge/entity/:key；使用现有 React Router Link，实体名可换行、390px 宽度不挤压布局、支持键盘聚焦；延迟请求可取消、不阻塞正文、不无限重试。
- 提供覆盖文章 revision、仅直接 episode、去重/过滤/截断、404/公开性、空/未入图/禁用/故障及中英路由的聚焦自动测试；不引入新数据库迁移、模型调用、队列或依赖。
- 核查真实示例 /items/up1qpo8b0p6x82s6sltvnqzbb 的 API 回包与可点开的实体详情，并提交浏览器或 Playwright 的中英/390px 验收证据；如样例尚未入图，报告真实状态，不硬编码实体、不声称功能已上线。
