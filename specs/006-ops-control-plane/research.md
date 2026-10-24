# 006 · Research First / Claude 独立反方与开源参考

## 仓库第一手证据

- `packages/backend/src/providers/registry/selection.ts`：旧自动池仅 NVIDIA 免费模型，导致 paid Zhipu 没有自动 fallback；`packages/backend/src/editorial/models.ts` 读取单步骤的 admin/env/default 选择；后台添加 provider != 路由切换。
- `packages/backend/src/providers/registry/connections.ts`：模型能力验证 24h 有效，配置指纹变化使旧记录失效。
- `packages/backend/src/providers/registry/retest.ts`：原窗口 22–30h，模型挂掉或 cron 停机可永久不可路由；本次补宽窗口及 6h 失败冷却，测试 paid probe 上限 3。
- `packages/backend/src/jobs/content.ts`：非 `BudgetExceededError` 的 Provider 路由错误会递增文章尝试次数，最多耗尽失败。
- `packages/backend/src/admin/runs.ts`、`apps/web/app/routes/admin/runs.tsx`：原统计只展示 pg-boss 当前队列，业务级 new/failed 不足；blocked 是正常预筛过滤而非阻塞队列。
- `apps/web/app/routes/admin/layout.tsx`、`apps/web/app/routes/admin/index.tsx`：分组导航、SSR React Router 已存在。
- `industry/sources.json`、`scripts/sync-news-sources.ts`：同步是一次性显式动作；种子添加新源而不覆盖已有配置。仓库 52、库 49 的偏差需补账。

## 官方 / 上游可复用而非替换

- [React-admin 官方 Layout](https://marmelab.com/react-admin/Layout)、[List](https://marmelab.com/react-admin/List.html)：按资源组织导航、响应式移动列表与状态过滤。**仅借交互原则**；EventGraph 已有 React Router/Auth/组件/API，不引入 MUI 全家桶。
- [Refine 官方文档](https://refine.dev/blog/how-to-create-react-admin-dashboard/)：资源模型、数据状态与 CRUD 工程原则；不在现有应用再搭一套框架。
- [pg-boss 官方](https://github.com/timgit/pg-boss) 与 [expiration/heartbeat](https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md)：既有 Postgres 队列是合适基础，支持事务入队及 retry；不要换 Redis/BullMQ/Temporal。
- [Sidekiq Web UI/Job Lifecycle](https://github.com/sidekiq/sidekiq/wiki/Job-Lifecycle)：待执行/执行中/重试/失败区分清晰，可借鉴其后台可操作性，但不能装 Sidekiq 来管 pg-boss。
- [智谱 BigModel 官方 API 文档](https://docs.bigmodel.cn/cn/api/introduction)：OpenAI-compatible 兼容与计费/限流须分清。NVIDIA 托管 GLM 与智谱直接付费 API 是两个独立 Provider；不要把同名模型当成同一运行实例。
- [日本央行 RSS 公告](https://www.boj.or.jp/en/tips.htm)、[印度央行 RSS](https://www.rbi.org.in/Scripts/rss.aspx)：官方链接可追溯，加入配置后还需采集预览。

## Claude Devil's Advocate（独立，只读）

2026-10-25 使用原生 Claude Adapter 检查 `origin/develop`（0a27287）；重要意见：
1. **阻断级**：先修 Provider 恢复而不是先做后台外观；付费智谱没有自动参与选路，NVIDIA 显式阶段选择绕过 paid GLM；能力测试过期后可能不可恢复；路由错误耗尽 article attempts。
2. **重要**：计费限额、短队列 `expireInSeconds` 和模型长调用可能导致队列超时，需要真日志核对再改，别随意调大并发。
3. **重要**：后台缺少文章级积压；当前十余管理入口不能证明无人使用，不能盲删。
4. **重要**：RSS 配置与生产/开发同步需分开验证、避免新信源增加已存在积压。

Claude 未获取运行环境 DB 凭据，其生产具体故障数没有独立核实；ChatGPT 用连接的只读数据库另行验证了 development/provider/production 差异。这次反方报告不是代码 PR review，代码仍需独立 CI/Claude PR review。

## 拒绝做的事

- 直接替换 React Router/MUI/Refine/Appsmith/Ant Design Pro 作为后台框架；
- 引入第二个 Queue/cron/model retry 系统；
- 创建非授权付费自动模型探测、生产批量处理；
- 在没有稳定官方 Feed URL 时批量加入未经核验的亚洲新闻；
- 仅凭导航存在便删除 SelectBench、审计等有业务作用的页面。
