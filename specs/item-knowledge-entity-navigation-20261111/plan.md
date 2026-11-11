# 新闻详情 → 知识图谱实体导航：实施计划

**Spec:** `specs/item-knowledge-entity-navigation-20261111/spec.md`
**Target:** develop
**Delivery:** 单个 GH-AW 原生 Work / 单个业务 PR；复用现有栈，不新增数据库迁移、模型调用、定时任务或依赖。

## 先核实、再改动

1. 在 `knowledge_service/server.py` 查看现有 Graphiti `Episodic` 与 `Entity` 的真实 Neo4j 标签、边及字段；确认 episode 名称 `aihot:<article_id>:r<revision>` 和 `graphiti_ingestions` 入图回执的映射。不得以推断标题/Story 关系替代 episode 的真实直接提及。若没有 `MENTIONS`，先给出运行时 schema 证据并选用只依赖当前 article episode 的受证据支持的替代关系；公开说明其覆盖局限，不编造实体。
2. 在 `packages/backend/src/knowledge/graphiti.ts` 复用现有 Graphiti 客户端和 4 秒超时，检查 `articles.revision`、`graphiti_ingestions`、`publications` 的读取条件。以当前文章公开性及版本为准，绝不合并已废弃 revision 或同 Story 其他文章。
3. 在 `apps/api/src/routes/knowledge.ts` 注册只读查询，使用项目现有 `hasItemPage` / publication 公开规则，返回 `ok | empty | not_ingested | unavailable | disabled`、稳定 `key/name`、`totalCount` 和 `truncated`。输入 article ID 最长 80；不存在/未公开 404；真实错误不伪装成空结果。
4. 在 `apps/web/app/routes/item.tsx` 复用既有路由、Link、样式和异步加载惯例，显示中英双语实体 chip，跳转现有 `/knowledge/entity/:key` 与 `/en/knowledge/entity/:key`。移动端自然换行、可键盘访问、不阻塞 SSR。
5. 按 Spec 的确定性规则排序、去重、过滤和截断；覆盖状态差异，并补上针对公开性、版本、Neo4j 无关系时的行为、超时与窄屏的测试。

## 验证与发布

- 聚焦测试：仅当前 revision 的直接提及、含无事实关系的实体、同名不同 UUID、过滤空白和纯 URL、50 条截断、撤回内容/404、Graphiti 错误/禁用/空与未入图、中文英文 URL 特殊字符。
- 浏览器与实际 API：检查 `/items/up1qpo8b0p6x82s6sltvnqzbb`；若当前未入图，明确记录真实缺口，不手工塞入 Jensen Huang。验证 390px 视口、键盘焦点、链接详情可达；报告证据和未做的检查。
- 交付路径：本 Spec PR 经独立 Spec Review 和 owner 合并到 develop；develop Check 通过后由 `spec-task-producer.mjs` 自动生成 T001 Issue + 原生 Work Graph；GH-AW Worker 创建唯一 `agent/*` 实施 PR；CI/审查通过后按原规则自动合并、部署 develop 预览。绝不提前修改 main/生产。
