# Admin 全流程失败明细：可执行恢复、批量重试与紧凑表格

**Status:** Owner-approved (2026-11-07，用户对运行与积压页直接要求修复)
**Target:** develop, `/admin/runs`
**Delivery:** GitHub 原生 Spec → Agent Work Queue → PR → develop；不修改 main 或生产。

## 问题与现有证据

- 当前 develop 的 `apps/web/app/routes/admin/runs.tsx` 中，`action(item)` 对 `kind === "model"` 只渲染静态“由原任务恢复”，没有任何可点击操作。后端 `packages/backend/src/admin/runs.ts` 的 `allFlowItemsOverview` 却将 Graphiti 失败模型回执分别展示成 `model:<receiptId>` 行；行内 `subject` 为 `graphiti:<长 hash>`，`articleId` 为空。故不能把这类记录误当文章执行 `processing/requeue`。
- 用户截图：失败全流程明细 1,160 项、1/58 页；重复 `graphiti_chat` 模型请求，`nvidia/nemotron-3.5-super-vl-120b-a12b`，`Provider HTTP 429`；长 hash 将“出错流程/模型/具体错误/时间/操作”挤到右侧。用户实测操作按钮无法使用。
- 当前已经有 `/api/admin/processing/requeue`、`/api/admin/content/:id/rerun`、`/api/admin/jobs/:id/retry`、`/api/admin/schedules/:name/retry`、`/api/admin/sources/:id/fetch`，必须优先检查并复用，而不是另造一套任务队列。Graphiti 真实重试 owner/job/批处理语义需从当前业务实现及 receipts/jobs 中查清。

## 要实现的行为

1. **可用的操作列**：处理失败表中每条安全可恢复的执行项有真实“重新入队”操作；响应成功前不得显示成功。修正当前原本可见但无法实际点击/被横向挤出视口的按钮；已运行、已入队、已解决和权限/状态不匹配需返回具体原因。取消需要手填“重试原因”的无关表单，允许最小默认审计说明。
2. **模型/Graphiti 恢复**：`graphiti_chat` / `graphiti_embedding` 的 `graphiti:<hash>` 模型请求失败要明确归属真实 Graphiti 处理单元（可能是 pg-boss job、batch 或定时调度），优先对该原执行单元实施重试，经过现有模型路由/后备模型；不得发送脱离上下文的模型测试请求。若仅凭回执无法安全定位原任务/没有可重放载荷，行应可见“无法安全重试：缺少原任务关联”，并提供可查的上下文，不可假装成功。已有父任务的多条回执必须去重，避免“一次批量选中 N 条失败模型就对同一原任务执行 N 次”；若被再次 429，保持真实失败原因和后续可恢复状态，避免暴力并发冲击供应商。
3. **批量处理**：失败列表首列复选框；支持勾选单行、全选/取消当前页（20 条）、跨页保持所选的明确状态或换页自动清除并说明。一个固定的“重新处理已选 (N)”按钮，将选中的**可恢复**失败项重新入队。禁用无法安全操作的项（如回执 pending/unknown、已确认投递、无关联模型记录），显示禁用原因。批量使用同一权威后端恢复逻辑，有限并发/上限、逐条校验、幂等去重和部分失败返回结果（成功/跳过/失败及原因）；不得因为一个 429 或旧状态阻断其他项。loading 和重复点击防护，完成后刷新服务端实时队列。
4. **紧凑可读的表格**：任务/新闻列只显示可理解的标题；仅当原始 subject 是冗长 ID 时显示如 `graphiti:33d39589…`，hover title 或“复制 ID”仍可取得完整值。设置合理固定/最大列宽、断行/省略和完整内容入口；模型名不撑开全表，具体错误优先可读；操作按钮在桌面及 390px 移动端可触达。不直接删掉原始 ID 或诊断信息。
5. **真数据和真状态**：三个队列和明细使用现有后端真实来源；成功重新入队后在刷新时从失败变为待处理（或实际执行中），若仍失败则保留新错误。模型回执与父执行单元不应因重复展示让用户误以为每条都是独立可重试工作；批量反馈应说清去重数量。仅今天 UTC 相关状态，服从现有当日口径。
6. **验收**：单条文章/worker/Graphiti 模型的真实重试路径；Graphiti NVIDIA 429、无原任务关联、unknown/pending receipt、已恢复但旧回执仍在、选择/取消本页、混合批量部分失败、二次点击去重、Web 390px 截图/交互、后端授权与测试。真实测试与 CI 结果在实现 PR 给出。不得修改 provider 配置或伪造模型成功；不得绕过任何必需审核。

## 非目标

不改变 Graphiti 知识抽取的业务语义或新增模型能力；不修改外部模型 API key/额度；不重做队列架构、不增加 cron、不开 main/生产发布；只做这一次运营入口的可用性与正确恢复链路。
