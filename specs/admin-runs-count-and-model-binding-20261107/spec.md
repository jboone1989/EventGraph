# 运行与积压：导航计数一致 + 停用模型绑定防错

**Status:** Owner-approved (owner-delegated Spec Review of 97f6c30e1a1191f0285d4a50a30dd3c284c94e85)
**Target:** develop
**Delivery:** 已有 Spec Review → 自动 Owner-approved → develop → GH-AW 原生 Work Queue/Projects → Worker PR → 既有 Check/Docker/E2E/独立 Review → 自动合并。禁止直接改 main / 生产。

## 1. 用户目标和现场证据

2026-11-07 管理员在 `/admin/runs` 看到侧边栏“运行与积压”徽标 **7**，页面“待处理 0 / 正在处理 0 / 处理失败 59”。失败明细里的 `events.group` 错误为 `Model cannot route text: Model is disabled; Routing switch is off`。管理员需要：(a) 入口与所见状态不矛盾且可解释；(b) 不再允许停用模型被当作可用模型绑定给工作流；(c) 让原本失败的真实归组任务在修复配置后能够恢复，而不是重试同一个必败配置。

当前 develop 代码证据：
- `packages/backend/src/admin/navigation.ts` 的 `runs` SQL 按**未完成新闻篇数**计数；`apps/web/app/routes/admin/layout.tsx` 说明该徽标不是失败任务数。
- `packages/backend/src/admin/runs.ts` 的 `allFlowItemsOverview()` 汇总新闻、pg-boss job、cron、模型回执、信源、消息投递；`apps/web/app/routes/admin/runs.tsx` 的失败数由 `flowItems.filter(status==='failed')` 得到，按执行单元计数，20 秒刷新。两个数字不是同一集合。
- `packages/backend/src/providers/registry/connections.ts` 的 `routingState()` 明确区分模型 `enabled` 和 `route_enabled`；`runtime.ts` 因不可路由抛 409；`editorial/models.ts` 的 `validChoice()` 对 `model:` 仅检查存在；`admin/models.ts` 的固定模型绑定检查适配器/视觉，但对普通文本模型未验证路由状态。绑定 UI 的 `usable()` 同样只查模态。
- `packages/backend/src/events/group.ts` 的 `modelFor('group')`、`modelFor('groupReview')` 使用上述绑定，失败会落到 `grouping_error`，并由页面展示。
- 已有独立任务 [#477](https://github.com/jboone1989/EventGraph/issues/477) 处理失败表单条/批量重试与 Graphiti 归属。本 Spec **不得重复实现 #477 的行操作、复选框、批量 API 或新队列**。
- 管理后台完整需求/复用合同见 `specs/reuse-first-admin-components-20261107/spec.md`（PR #487）；其落地任务 #488 在运行，应核实有无合并，不得假称新审核标准已经生效。

## 2. 产品规则 A：导航计数必须和明细对应

1. `/admin/runs` 导航徽标明确代表**当前 UTC 日所有流程的失败执行单元数**（全类型、全页、未选筛选条件），不能再隐式代表另一口径的未完成新闻篇数。页面“处理失败”主卡片与全流程失败表的行数应来自**同一权威明细/聚合定义**；1 篇文章的不同执行单元可各计一次，但不能将这种计数标注为“失败新闻篇数”。
2. “待处理/正在处理/失败”三态互斥，对每个执行单元只计入当前状态；恢复后必须显示真实新状态。完成且已成功的旧记录不能继续产生误导性的可操作失败提醒；涉及回执未知/待确认时沿用原有安全含义，不应当作已确认失败。
3. 徽标数字不变更页内任务筛选语义：页面按类型过滤时仍显示相应过滤结果，但徽标作为全局数不随局部筛选改变。页面解释“按执行单元计数，与新闻篇数不同”；侧边栏 title/无障碍文本说明“UTC 今日失败执行单元”。
4. 导航与页面应由一致的共享服务端统计实现/契约产生，避免各自硬编码不同 SQL。若异步刷新造成瞬时差异，页面同一次刷新完成后徽标也应同步更新；导航到该页或重试后不得长期保留旧徽标。不能为对齐而写死 59、重复读全量重型统计、建立新轮询服务或新数据库表。
5. 没有失败时按原后台约定隐藏 0 徽标；空表展示明确空状态。长标题、错误、模型与操作列继续使用现有 `DataTable`/布局；不覆盖 #477 的 UI 改动。

## 3. 产品规则 B：工作流不能绑定不可路由的模型

1. 在默认模型、`group`、`groupReview` 等所有可用固定绑定写入入口中，**服务端**验证模型与连接实际启用、路由开关、凭据、适配器和工作流输入能力；不能只检查 ID 存在。拒绝时显示可定位的具体原因（如“模型已停用”“路由关闭”），不能保存后才在任务里报错。必须遵守模型内部 UUID 身份，多连接同名模型不能混为一个。
2. 工作流绑定选择列表直接由现有注册模型/连接数据生成：不可用模型显式标注且不允许作为**新**绑定保存；若数据库已有失效绑定，仍显示原绑定及具体原因，并提供选择另一可用模型的路径，不能悄悄删除绑定、自动切换到收费模型、替用户开启停用模型。
3. 在编辑/停用正被工作流引用的模型或连接时，必须检测现有 `provider_workflow_models` 等绑定依赖，并明确警示/阻止**悄悄造成新断链**，要求先由管理员改绑；现有已停用/损坏配置应允许查看和修复。不要新增 `deleted_at`、迁移、另一套注册表、自动任务或隐式 fallback。
4. 固定绑定与 `auto` 必须保持区分：本次不更改免费自动路由的筛选、UUID 级熔断、明确 HTTP 拒绝才安全 fallback 的既有规则。不推断用户要启用自动路由；用户明确选固定模型即按固定模型运行。
5. 被禁用模型的既有错误不能被当作供应商 429/超时；后台应展示“配置不可路由”的原因及对应绑定，配置变更后从现有安全重试入口重新入队，不制造无上下文模型请求。旧失败记录仅按既有成功/UTC 归档规则消退，不能为了让数字变好直接清空审计记录。

## 4. 完整交互/可访问性/边界

- 管理员进入 `/admin/runs` → 看统一失败数 → 点击失败态查看可恢复的条目 → 识别是哪个流程、哪个配置错误 → 到工作流绑定页看当前模型状态 → 选择已启用且可路由模型并保存 → 返回重试现有任务 → 待处理/执行中/成功或新失败状态与导航、明细一起刷新。
- 保存中/数据已变更/权限不足/没有可用模型/缺凭据/API 请求失败须有可操作反馈；不得乐观显示“保存成功”。已存在不合法绑定必须可见而非从选项中丢失。
- Desktop 1530px 与 mobile 390px：绑定选项与错误文案可读，操作可以点击；长模型名/UUID 不压缩保存按钮和其它字段。复用已有 `AdminPage`、`Select`、`Button`、`Badge`、`DataTable` 及既有测试，不自行另造。
- 禁止修改事件归组业务判决、模型自动路由偏好、计费/额度规则、Graphiti 任务重试、pg-boss 架构、UTC 清理机制或生产部署。涉及 #477 交叉改动应以最新 develop 已合并版本为准，避免覆盖。

## 5. Given / When / Then 验收

1. **Given** UTC 今日有 7 篇未完成新闻但 59 个失败执行单元，**When** 进入运行页且数据刷新完成，**Then** 导航“运行与积压”徽标、页面失败卡片及全类型失败明细总数一致；不会将 59 解释成 59 篇新闻。
2. **Given** 同一执行单元已恢复为 pending/processing/completed，**When** 刷新/换页/导航，**Then** 不再将其作为当前失败执行单元重复计数；徽标和同一服务端刷新结果一致。
3. **Given** 一个关闭 `enabled` 或 `route_enabled` 的 chat 模型，**When** 用户在默认/group/groupReview 绑定并保存，**Then** 服务端明确拒绝且 UI 显示原因；模型记录仍存在、旧配置不被静默篡改。
4. **Given** 一个可用 chat 模型与一个 embedding/image-only 模型，**When** 绑定 group，**Then** 仅符合所需能力的可路由 chat 模型能成功保存；多 Groq 连接使用各自 UUID。
5. **Given** 模型当前被 group 工作流引用，**When** 运营人员试图停用它或其连接，**Then** 系统明确阻止不带改绑的断链并说明受影响工作流；完成改绑后可停用，**不会隐式开启或改用收费模型**。
6. **Given** 既有无效绑定（旧配置），**When** 打开绑定页，**Then** 明确显示“已失效”和原因并允许手动改绑；重试前不会冒充外部供应商错误。
7. **Given** 原来失败的 `events.group`，**When** 绑定修正后通过既有安全入口重新入队，**Then** 任务走真实模型与原归组上下文，状态真实变化，失败仍提供新错误；无原任务关联则不能假重试成功。
8. **Given** 20+ 行、超长标题/模型 ID/错误或 390px 视口，**When** 操作/筛选/分页，**Then** 核心字段和操作可触达、无虚假按钮，保留查看完整错误的路径。
9. **Given** 有失败/缺失上游结果，**When** 运行 CI 与独立评审，**Then** 给出场景 → 代码 → 单测/API/浏览器实测与未验证项，不得因 Spec 审查通过而声称部署或运营恢复。

## 6. 交付条件

本 Spec 是产品合同，不是实施 PR。仅独立 Spec Review 通过并自动标记 Owner-approved、合入 develop 后，已有 Producer 才能根据同目录 `tasks.md` 生成 Project Todo/Issue 并交给 GH-AW Worker。Worker 实施 PR 必须引用固定已批准 Spec SHA；沿用现有审核和自动合并，不直接发布 main。优先验证 #488 的质量评审增强是否已实现；即使未实现，也必须逐项核验本 Spec 的真实操作和测试证据。
