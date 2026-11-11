# 后台模型每日调用统计（UTC 自然日）

**Status:** Owner-approved（2026-11-11 用户明确提出 EventGraph 必须统计每日模型调用次数；本 Spec 的细节仍接受独立 Spec Review）
**Target:** develop
**Delivery:** 独立 Spec PR → 独立审核 → 仓库所有者合并到 develop → 现有 GH-AW Producer/Work Queue/Worker → 实现 PR → 现有 CI、独立 Review、自动合并、develop 预览验收；本需求不直接发布 main 或触碰 VM09。

## 用户目标与已检查的现状

运营者需要知道“每天到底向模型发起多少次请求”，不再从新闻条数/失败队列猜测调用量；并能识别最耗调用的模型、工作流及重复重试，为降低积压、诊断自动路由提供证据。

2026-11-11 查阅 develop：
- `packages/backend/src/providers/receipts.ts` 的 `paidRequest()` 已逐次持久化 `receipt_attempts`；`receipts` 为逻辑请求，一份回执可以有多次尝试。复用的旧响应不能算新调用。`receipt_attempts` 包含 started_at/status/usage/latency_ms，`receipts` 包含 purpose/subject/request。
- `packages/backend/src/providers/llm.ts` 的 chat 调用、`providers/embeddings.ts`、`providers/registry/runtime.ts` 的注册模型测试/embedding、`providers/graphiti-proxy.ts` 的 Graphiti chat/embedding 都经 `paidRequest`。免费模型也经此路径；方法名 paidRequest 不意味着只统计付费模型。
- `packages/backend/src/admin/runs.ts` 的 `routingEffectOverview()` 已基于 attempts 做 UTC 当日按 stage/provider 的路由统计，但**只包含带 routing.stage 标签的调用**，不能冒充全模型调用总量；复用其已有逻辑与 `utcDayStart()`。
- `deepseek-web.ts` 及 Jina/SocialData 是非模型的 paid-request，不能按 service 一概计入模型调用。
- `apps/api/src/routes/admin.ts`、`apps/web/app/routes/admin/{layout,runs}.tsx`、`apps/web/app/features/admin/ui.tsx` 已具备鉴权 API、导航、统计卡片与 DataTable/Pager，禁止另建后台框架。
- 现有记录中并非每个 receipt 都包含注册模型实例 ID；同厂商/同上游名称但不同 API 连接不能从历史数据可靠地反推出实例身份。

## 产品行为（完整合同）

### 1. 入口与日期

- 在管理员导航“模型管理”邻近增加“模型调用统计”，页面地址 `/admin/model-usage`；仅管理员可访问，API 为私有鉴权端点，禁止公开、索引和缓存私有内容。不要使首页、/admin/runs 或导航角标同步加载额外的重型查询。
- 默认“今天（UTC）”，可切换昨天、最近 7 天、最近 30 天；时间序列按 UTC 00:00:00 至次日 00:00:00 **左闭右开**，注明 UTC 与数据的最新刷新时间。7/30 天包括今天，每个自然日都显示，零数据日显示 0 而非缺失。允许选择最近 30 天中的单日深入查看；不做无限历史全表扫描或自动轮询。
- 队列零点清理不应删除持久的模型调用历史。历史只按已保留的回执数据展示；不可推断缺失日为 0，只有明确查询到的完整覆盖日才显示 0；若数据缺口/保留范围不确定，显式“历史数据可能不完整”。

### 2. 统计口径（每条实际模型请求尝试）

- 以 `receipt_attempts` 的 **live** attempt 为计数基本单元（不是新闻数、pg-boss job 数、逻辑 receipt 数，也不是响应缓存命中数）。一次模型请求重试/自动切换后新发的请求各算一次；`origin=replay/imported` 不算；同一 attempt 的状态更新不重复计数。
- 按 attempt.started_at 归属 UTC 日期。统计所有经回执的模型调用：新闻 chat、embedding、Graphiti chat/embedding 及模型连接测试；模型测试可单独分类以免污染“新闻处理”口径。排除 `deepseek_web` 搜索/抓取、Jina、SocialData 等非 LLM 工具与无模型请求；鉴别规则必须显式、由真实代码入口测试约束，不能以 provider/service 名字猜。
- 页面同时展示：**总调用尝试**、成功、失败、未知、进行中、用于业务的调用次数、模型测试次数；主图按天分段展示成功/失败/未知/进行中，总数 = 各状态和。与 `runs.routingEffect` 的标签子集允许不同，但口径必须清晰。
- `received` 表示回执已收到/经当前既有业务校验的调用结果；`failed`、`unknown`、`pending` 均保留为不同状态，未知**计入调用尝试总数**而不是成功；不能把“HTTP 2xx”未经业务验证的结果伪作成功。历史状态后续改变时分组随最新状态改变，但请求所属日期不改变。
- 关键真实性边界：`receipt_attempts` 的行在出网前预占；本版展示名称为“模型请求尝试（已记录）”，不能声称每条都已被上游收到或计费。本地明确在出网前拒绝的模型配置/凭据故障不应假装真实外部调用；如现有记录无法区分，按记录语义给“可能包含本地失败”的提示，并在最小调用入口补充足够的标记或可靠排除，**不要**为追求准确性造新调用链/新的日志子系统。不得给出虚假的精确外部供应商调用数字。

### 3. 模型、工作流、请求类型分布

- 日期选择同时驱动**按模型**、**按工作流/业务阶段**两个排序表，默认按尝试次数降序，支持对成功/失败/未知/进行中分布排序。模型表显示注册模型**内部唯一实例 ID**（缩略/可查看完整）、连接/厂商、上游模型名、总调用、成功/失败、成功率（无完成请求显示 —），不要将不同 Groq 账号下同名模型合并为一个模型实例。
- 现有历史 receipt 若没有可靠实例 ID，显示“历史未识别实例”并按厂商+上游模型归组，明确不能拆分；不得虚构 UUID。对后续新调用在现有 `receipts.request` 的安全摘要中保存非敏感 `modelInstanceId` 与必要的连接身份；Graphiti 和测试的现有 `modelId` 字段统一读取；不记录任何密钥、提示词全文或返回内容。不引入新的 UUID/版本编号机制。
- 工作流阶段优先使用已记录 `request.routing.stage`，否则使用明确的 `receipts.purpose`；无法映射显示“未标记阶段”，不可默认为某个工作流。区分业务、模型测试和 embedding；不靠新闻 title 判断。
- 单日可按模型、阶段、请求类型和状态筛选；筛选后的数字、表格和分页须使用同一服务端数据口径，不因客户端只加载一页就把总计算少。长模型 ID/错误不能挤压字段，表格通过既有组件响应式滚动和必要截断，桌面/390px 可操作。

### 4. Token 与额外重试

- 有上游真实 `usage` 时汇总输入/output/total tokens（兼容实际记录过的字段名，如 prompt_tokens/completion_tokens/input_tokens/output_tokens；无数据时显示“未提供”，而不是 0）；不估算付费金额，也不引入预算或调用次数限制。
- 显示重试调用尝试数（attempt > 1）和可确证的自动切换尝试数；若 `fallbackFrom` 只覆盖一部分，标注“仅已标记自动路由”，不能把未标记数当作 0 或推断完整。保持与现有 `routingEffectOverview` 区分，全量尝试不受 stage 标签限制。
- 不增加新模型调用/探测/采样/定时器，数据来自已有回执，刷新页面不得触发真实模型请求。

### 5. 权限、性能、故障与保持不变

- 使用现有管理员鉴权、现有 API 模式和后台 UI 组件；日期/筛选参数要校验且有上下界，防止无限聚合。结果按日聚合/必要的服务端分页，避免默认拉全量明细，避免阻塞管理员页面 SSR/导航；必要时在查询计划证明之后添加**最小**时间索引，而非一上来新建汇总表或额外迁移。
- loading、无数据、无匹配、API 500、权限失效/超时分别有明确反馈；失败不能显示“0 次”；浏览器刷新/筛选保留 URL 状态。
- 绝不修改模型路由策略、预算熔断、供应商选择、新闻处理次数上限、任务队列、UTC 清理、现有回执身份与重试行为；绝不触碰 VM09；上线先以 develop 预览真实 API/浏览器验收，main 按既有发布流程。

## Given / When / Then 验收

1. Given UTC 同一日 10 条真实模型 receipt，其中 3 条各有第二次 attempt，When 查询该日，Then 调用尝试=13 而不是 10；重读缓存的 receipt 不增加计数。
2. Given 23:59:59 UTC 和次日 00:00:00 UTC 的尝试，When 切换日期，Then 精确归入各自日期；30 天连续日历序列能区分已确认零值与未覆盖日。
3. Given Groq A/B 两个 API 连接使用同一个上游模型名且都新发了请求，When 模型分组，Then 按各自内部模型 ID 分离；旧历史缺少 ID 时诚实显示“历史未识别实例”。
4. Given 新 chat、embedding、Graphiti chat/embedding、模型测试各一次及 deepseek_web/Jina 各一次，When 统计，Then 仅前五个计入模型尝试，测试与业务可分别查看。
5. Given 失败/unknown/pending/received 和后续“结果不可用”状态更新，When 刷新，Then 所属日期和请求总数不变，成功/失败/未知/进行中互斥且总和一致。
6. Given 某些 usage 缺失，When 汇总 Token，Then 区分已知 Token 和未提供数量，不能把未提供当 0 或宣称完整消耗。
7. Given 使用 URL 切换日期/筛选/分页或后端失败，When 查看仪表板，Then 数据来自一致的服务端聚合、错误显式呈现、长 ID 不挤压 390px 列/按钮，API 不可用时没有假“0”。
8. Given 本功能页面被查看，When 跟踪调用，Then 只触发只读后台请求，无额外模型/探测，无 `/admin`/导航/运行页显著同步阻塞；现有路由、预算和三队列逻辑不变。
9. CI 单测（统计归类、日期、Token、实例分组、API 参数鉴权）、Web/浏览器 desktop 和 390px；develop 预览用真实非敏感 SQL 计数交叉验证。未通过不得标记完成。

## 不在本次范围
新成本/计费预测、外部厂商账单对账、每篇新闻平均调用数的目标阈值、用户侧公开统计页、后台新队列/新计时任务、数据回填造假、历史不可恢复的实例归属。
