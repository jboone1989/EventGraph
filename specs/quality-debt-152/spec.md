# 质量债 #152：E2E 静默跳过与非 2xx 静默退化（DRAFT，待 Owner 批准）

Status: **DRAFT**（2026-10-27 提交，未获批准；本文档只定需求与验收，不含实现）。
来源：[Issue #152](https://github.com/jboone1989/EventGraph/issues/152)（2026-10-26 在 develop 复核）、#176 T14。
基线：develop `1ce1c3f71919ed762de1a8f5f84defd68b33b2d2`（2026-10-27，PR #183 之后）。逐项核验证据见同目录 `validation.md`。

## 范围

修 Issue #152 中**已证实**的三类静默失败（只改测试与日志可见性，不改产品行为）：

1. CI 的浏览器 E2E 从不真正测试知识图谱页面（确定性跳过）。
2. E2E 采样把非 2xx / 解析失败当作"无数据"，掩盖 API 回归。
3. 四处运维后台操作 `.catch(() => {})` 吞掉可行动的失败，不留任何日志。

**不在范围**（验证后判定为非死代码或有外部阻塞，见 validation.md §4–§6）：删除 `MODEL_PROVIDER_REGISTRY_ENABLED`、`RECEIPT_AUTO_RELEASE_ENABLED`、alerts 旧键迁移分支；新增监控/告警子系统；任何兜底、兼容层、新开关；生产 VM09 变更；历史回填。

## 需求

- **FR-1（图谱 E2E 真覆盖）**：CI e2e 作业（`E2E_SEEDED=1`）里，知识图谱页面必须有确定性数据并被硬断言：
  - 以**仅测试用**的 Graphiti HTTP 桩（独立本地端口进程，服务于 `knowledge/graphiti.ts` 的全部读取端点：`GET /stats`、`GET /overview`、`GET /network`、`GET /entities/<uuid>`、`POST /relations/by-articles`、`GET /changes`、`GET /relations/<key>`、`GET /atlas/centers` 与 `POST /search`，包含各自查询参数/请求体及响应契约。地图/实体正例返回固定拓扑，但其 `evidence` / `articleIds` **必须引用本次 e2e seed 实际创建且仍公开的文章 ID**，不能硬编码与 seed 无关的假 ID；否则 `publication/knowledge.ts` 的公开证据过滤会把图数据清空。实现可在 migrate+seed 后从测试库读取这些 ID，或把 seed ID 做成确定值，但不得绕过 publication 层。其余读取返回该端点契约要求的合法空结构，时点图响应声明 `temporalSupport: "bitemporal-v1"`；不能用通用 `{}` 或 404 冒充合法空图。以 `packages/backend/src/knowledge/graphiti.ts` 当前全部读取调用核对覆盖，未知端点硬失败；worker/采集关闭，不调用写入 `/episodes`）提供固定实体/关系。CI 启动顺序固定为 **migrate → seed → Graphiti 桩（绑定上述真实公开 article IDs）→ API/Web → Playwright**；在现有 “Start the built site” 阶段导出 `GRAPHITI_API_URL` 并等待桩端口就绪后才启动 API/Web，不能在 Playwright 进程内启动后试图修改已运行 API 的环境。桩须随该测试作业清理，不引入真实 LLM/embedding，不新增生产服务。
  - `e2e/knowledge.spec.ts` 的"地图绘制"与"实体页关系"两条用例在 `E2E_SEEDED=1` 时**必须执行且不得 skip**。不能只检查 HTTP 状态：`stats` 还必须断言 `status` 既不是 `disabled` 也不是 `unavailable`，且 `entities > 0`；`overview` / `network` 正例也必须非空。Graphiti 桩崩溃、500、不可解析，或后端把这些故障降级成 HTTP 200 + `status:"unavailable"` / 空图时，种子 E2E 都必须**硬失败而不是 skip**。启用该桩后必须运行完整既有 E2E，Story、日报、关系和实体检索等非图谱页也须通过，不能仅跑 `knowledge.spec.ts`；全局启用 `GRAPHITI_API_URL` 不得使其它读路径降级为 unavailable。
  - 对外部部署（无图谱，status `disabled`/`unavailable`）保留现有带原因的 skip 与"任何图谱状态都能打开"用例——CI 之外的行为不变。
- **FR-2（种子采样失败闭合）**：`E2E_SEEDED=1` 时，`e2e/site.ts` 的 `samples()` 五个 API 调用中任何一个返回非 2xx 或不可解析 JSON，E2E 必须失败（报出具体端点）；对 e2e seed 明确创建的样本，HTTP 200 但 `story`、`item`、`daily`、`topic` 或 knowledge `entity` 为空也必须失败，不能让后续用例因 `undefined`/空集合而静默缩水或 skip。knowledge 还须满足 FR-1 的 `status`/非空图断言。只有外部部署运行（无 `E2E_SEEDED`）才保留现有可选采样/带原因 skip 行为。
- **FR-3（运维失败可见）**：下列四处失败改为经现有 console 日志输出一行（沿用 `knowledge/graphiti.ts` 的 `console.error` 风格；可按分钟节流），**不**新增重试、告警通道或持久化状态，**不**改变 watchdog/告警触发语义：
  - `operations/heartbeat.ts:24-25`（beat 写库失败）
  - `operations/watch.ts:61`（watchdog 检查失败）
  - `operations/feedback.ts:97`（每次首次转发失败都会被这里的 catch 吞掉日志，包括普通飞书/截图上传/网络失败，而不只是落库逃逸异常；`notify/feishu.ts:194-197` 会先记录 `forward_error` 再重新抛出，DB 落库与 7 天重试保留）。同文件重试 sweep `:125` 的 catch 目前只累计 `failed`；本草案明确将该处同样纳入 FR-3 的一行既有 console 日志要求，保留计数、节奏和重试期限
  - `media/upstream.ts:39`（trip 状态持久化失败；内存状态仍为准）

## 验收

1. 实现 PR 引用本文档批准版本 SHA（`Spec: specs/quality-debt-152/spec.md@<40位SHA>`）。
2. CI e2e 作业日志中 `knowledge.spec.ts` **0 条 skipped**（desktop+phone 各 3 条全部执行）；PR 描述记录改动前后的实际 skipped/passed 计数。
3. 判别力证明（PR 描述附结果）：正常桩通过真实 API 后，`overview` 与 `network` 都必须返回**非空**且其证据 ID 属于本次 seed 的公开文章；再把桩的 `/overview` 改为空而 `/stats` 非零（或把正例 `articleIds` 换成非公开/不存在 ID），图谱用例必须失败——同时证明断言有效且没有被 publication 层静默过滤。
4. 判别力证明：本地种子环境分别让五个采样端点之一返回 500、返回不可解析 JSON，或对 seed 应存在的 `story`/`item`/`daily`/`topic`/knowledge `entity` 返回空结果；`E2E_SEEDED=1` 时 `npm run e2e` 都必须失败并指名端点/缺失样本。另模拟 Graphiti 不可达但 API 降级为 HTTP 200 + `status:"unavailable"`，知识图谱用例同样必须失败而非 skip；无 `E2E_SEEDED` 时保持现状（可选采样）。
5. FR-3：注入 beat 写库失败（或等价单测）产生一行错误日志；现有 heartbeat/watchdog/feedback 测试语义不变。
6. 不引入新依赖、新服务、新环境开关（除测试内部常量）；`.env.example` 无新增项；生产 VM09 未动。
