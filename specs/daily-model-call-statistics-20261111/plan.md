# 每日模型调用统计：实现计划（Spec 阶段）

## Research First（2026-11-11，develop）

- 现有事实表：`database/migrations/0022_receipt_attempts_budgets.sql` 的 `receipt_attempts` 记录单次尝试，并含 status/service/model/started_at/origin/usage；已有 `service, started_at` 索引。先使用已有记录，不新增计数器、日报快照表或定时任务。
- 现有写入：`packages/backend/src/providers/receipts.ts` 的 `paidRequest` 保存尝试，`llm.ts`、`embeddings.ts`、`graphiti-proxy.ts` 使用它；`rejectReceivedResponse` 将无效回执改失败。
- 现有只包含自动路由：`packages/backend/src/admin/runs.ts` 的 `routingEffectOverview` 按 `request.routing.stage` 过滤，**不能复用为全站模型请求总量**，但可复用 UTC 日期与聚合设计。
- 现有读写链：`apps/api/src/routes/admin.ts` 的 `GET /api/admin/runs` + `packages/contracts/src/admin.ts` + `apps/web/app/routes/admin/runs.tsx`；管理端鉴权、服务端数据读取、20 秒刷新均已有。
- UI 复用：`apps/web/app/features/admin/ui.tsx` 有 `AdminPage`、`Card`、`Stat`、`DataTable`、`Select`，见 `docs/admin-ui-reuse.md`。
- 实施前继续核查 `registered_models` 探测/测试是否经过 receipt，以限定覆盖声明；核查索引基线、真实 7/30 天查询性能。无需新日志基础设施。

## 最小方案

1. 在后端 admin/runs 的统计模块增加单一复用的 UTC 日聚合查询，按 7/30 日窗口过滤 `receipt_attempts`，仅计 `origin='live'`、`model IS NOT NULL`。按天汇总；对所选日期再按实例标识（存在时）或 provider/model 分组，避免一次返回 30 天全部明细。输入日期严格验证仅允许窗口内 UTC 日，不插入 SQL 字符串。
2. 尽可能复用 `GET /api/admin/runs` 的聚合/管理路由；如把历史统计与 20 秒实时刷新放在同一重接口会产生明显数据库负担，可使用同一 adminHandler 的独立只读 endpoint，且只查询选定日期的模型明细。选择以测试/执行计划证明，不另建管理服务。
3. 给今后新注册聊天模型尝试补充`requestSummary.modelId`，让相同厂商/模型名的多账号实例可追踪；不回填历史，不使用凭据做统计分组键。
4. 将今日卡片、7/30 日趋势和单日模型表插入运行页现有卡片与失败明细之间；复用既有 UI 和刷新/空态/失败态处理。趋势可用可访问的条形呈现，禁止为一张简单图擅自新增大型依赖。
5. 通过测试验证时区边界、重复重试、不同模型实例、unknown/failed/received/pending、零记录/API 错误、用户切换日期、390px 页面。不把成功率按新闻篇数计算。
6. 向用户可见的描述明确：这是**已记入回执的模型请求尝试次数**；手动测试/探测与模型配置前置错误未覆盖时必须标记出来。不能为了追求“全量”修改无关模型探测流程。

## 约束与交接

- 不改变自动路由或手动重试，避免与 `specs/auto-success-only-routing-and-actionable-failures-20261111` 交叉。
- 不使用 `receipt.status` 代替 `receipt_attempts.status`；不按本地自然日聚合。
- 性能未证实前不要新增索引/迁移，若有证据再在单语句在线迁移中追加。
- 实现 PR 固定引用**已合并并批准**的本 Spec 的不可变 SHA，逐项对照 `tasks.md` 验收。
