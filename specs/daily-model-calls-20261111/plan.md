# 模型每日调用统计：实施计划与 Search Before Build

**Spec:** `specs/daily-model-calls-20261111/spec.md`
**Target:** develop；必须等本 Spec 独立 PR 审核并由 owner 合并后的固定 SHA 才能开实现 PR。

## 已确认可复用资产（develop，2026-11-11）

1. PostgreSQL `receipts` + `receipt_attempts`（`database/migrations/0001_core.sql`、`0022_receipt_attempts_budgets.sql`、`0033_receipt_budget_index.sql`）；调用回执 `packages/backend/src/providers/receipts.ts`。现有原始事实源，而非新建 telemetry 表。
2. `packages/backend/src/admin/runs.ts::routingEffectOverview`：UTC-day 按 provider/stage 汇总，但只含 routing 标记；可以复用处理日期/状态和汇总模式，**不可**拿它的 total 代替全量。
3. `packages/backend/src/providers/{llm,embeddings,graphiti-proxy}.ts`，`providers/registry/runtime.ts` 的 provider 模型调用与测试入口；`providers/deepseek-web.ts` 是工具调用应排除。
4. `apps/api/src/routes/admin.ts` 的 `adminHandler`、`apps/web/app/routes/admin/layout.tsx` 导航和 `apps/web/app/features/admin/ui.tsx` 的 `AdminPage`/`Card`/`Stat`/`DataTable`/`FilterChips`/`Pager`。
5. `docs/admin-ui-reuse.md` 产品与组件复用合同，`specs/utc-daily-runtime-diagnostics-20261106/spec.md` 中 UTC 日与历史回执保留的分离规则。
6. `apps/web/package.json` 当前已有 React 19 / React Router 8 / Tailwind 4、站内通用 Admin UI，但**尚未安装成熟图表库**。实现日趋势应优先引入 React 19 兼容的 **Recharts**（或记录充分理由的 Apache ECharts 等成熟替代），不可因为想省依赖就手写 SVG/Canvas/图表引擎。复杂表格功能优先评估 TanStack Table；简单统计表复用项目 DataTable/Pager，严禁为此自写第二套表格。
7. 实现前再核对最新 develop 是否已有同范围 PR，检查 AIHOT 上游是否已有稳定模型调用聚合实现、现有依赖与官方版本兼容信息，沿用现有 React Router / PostgreSQL API；不要重复造图表库、定时器或工作流。

## 最小实施

- 在 backend admin 增加只读 `modelUsageOverview`，按业务可识别的模型调用 purpose/入口筛选 `receipt_attempts JOIN receipts`；受限 1/7/30 UTC 日窗口按天 `date_trunc`/generate_series 聚合，缺日填充、每种状态/模型/阶段可验证。测试外部服务与非模型调用分类。查询计划达标前不加 schema。
- 在各模型入口现有 requestSummary 写入非敏感内部 modelInstanceId（已有 Graphiti/test modelId 则兼容读取）；对旧实例无法还原的行设明确归类。需确保同厂商多连接不合并、避免原始 prompt/key 泄露。尽量不改 receipt 核心语义，必要的模型预占/本地失败统计准确性先给证据。
- 在 `apps/api/src/routes/admin.ts` 添加管理员 GET，参数限制为允许日期/窗口/筛选/分页；在 `packages/contracts` 添加稳定类型。
- 在 `apps/web/app/routes/admin` 新增模型调用统计页并注册导航，复用现有 UI，展示每日总量、状态、模型/阶段、测试与业务、token 可用性、重试；每日趋势采用成熟的 Recharts 图表组件（若换其他维护中且兼容 React 19 的成熟库，提供选择记录），表格使用共享 DataTable/Pager 或成熟 TanStack Table。避免手写图表、表格引擎、日期控件、二次分页框架；仅编写必要数据转换/业务适配。
- 有索引必要性时基于真实 `EXPLAIN` 选择最小在线索引；当前 `receipt_attempts(service,origin,started_at)` 不等于支持 `origin+started_at` 全服务聚合，应核对真实计划/数据量，再决定是否新增专用时间索引。绝不为这一统计新建业务流水表。
- 后端 SQL/单元/API 测试 + Web 390px/desktop + 开发环境真实聚合验收。每条 Spec Acceptance 附可定位测试与截图/API 证据。

## 失败边界

- 旧 receipt 无注册模型 ID：归为历史未识别，绝不倒推出 UUID。
- 旧数据未保留、usage 缺失：明确标识数据覆盖/未知 token，不能当作 0。
- API 超时/连接失败：展示错误，不假装 0，不牵连导航/运营总览性能。
- 实际送达供应商与预占请求：口径为记录的模型请求尝试；未能证明的部分标注不确定性，不宣称厂商已计费。
