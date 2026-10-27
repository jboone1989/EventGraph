# 质量债 #152 验收矩阵与证据（2026-10-27，develop `1ce1c3f`）

只读核验记录：每一项 #152 声明在当前 develop 的真实状态、证据、处置。本文件由 T14 产出，不改动任何可执行代码。时间均为 UTC。

## 1. 图谱 E2E 静默跳过 —— 证实（高）

| 证据 | 内容 |
|---|---|
| 代码 | `e2e/knowledge.spec.ts:6` 顶层 `fetch(...).catch(() => null)`；`:14` `test.skip(!stats?.entities)`；`:20` `test.skip(!entity)` |
| 数据面 | 图谱不在 Postgres：`knowledge/graphiti.ts:171-178` `graphStats()` 无 `GRAPHITI_API_URL` 时返回 `{entities:0,status:"disabled"}`（HTTP 200）；`scripts/e2e-seed.ts` 只写 Postgres（sources/articles/facts/english_copies/reports/hot），无 Graphiti 种子 |
| CI | `.github/workflows/check.yml` e2e 作业（186-232 行）不设 `GRAPHITI_API_URL` → 每次运行必然跳过 |
| 本地复现（CI 等价） | cn-dev 干净 worktree @1ce1c3f：建 `aihot_t14_20261027_test`、migrate+e2e-seed、起 api+web，`/api/site/knowledge/stats` = `{"entities":0,...,"status":"disabled"}` HTTP 200；`npx playwright test -c e2e knowledge.spec.ts` 两轮稳定 **4 skipped / 2 passed**（desktop+phone 各跳过"地图绘制"与"实体页关系"） |
| 部署实况 | 生产 livingruntime.com `/api/site/knowledge/stats` = **9,887 实体 / 18,317 关系 / 2,379 episodes（真实在用）**；VM13 预览 = disabled；`scripts/ci/smoke-vm13.sh` 不运行 playwright spec —— **图谱页面（地图/实体页）目前在任何自动化里覆盖率为零**，绿 CI ≠ 图谱被测过 |
| 处置 | FR-1（见 spec.md）：CI 用仅测试的 Graphiti HTTP 桩 + 硬断言；外部部署保留带原因 skip |

## 2. 非 2xx 采样静默退化 —— 证实（中）

| 证据 | 内容 |
|---|---|
| 代码 | `e2e/site.ts:23` `get()` 把非 ok / 网络失败 / 解析失败都折成 `null`；`samples()` 结果被 8 个 spec 文件消费（pages/english/language/story-route/story-replay/explorer/explore-workbench/impact-evidence/knowledge） |
| 后果 | 某个站点 API 回归（如 `/api/site/hot` 500）时，`pages.spec` 的 content 页循环静默缩水、knowledge 顶层 stats 变 null → 全部跳过，CI 仍绿。`watch()` 只覆盖页面加载期发出的 `/api/site/` 请求，不覆盖 spec 顶层采样 |
| 附注 | `open()` 里 `networkidle` 的 `.catch(() => {})`（site.ts:50）是另一处有意的宽松（慢第三方），不属 #152 指控范围，本 spec 不动 |
| 处置 | FR-2：`E2E_SEEDED=1` 时非 2xx/不可解析即失败；200 空数据仍合法 |

## 3. 运维失败静默 —— 证实（中），其中 feedback 一项与 #152 表述有出入

| 位置（1ce1c3f 行号） | 现状 | 严重度 |
|---|---|---|
| `operations/heartbeat.ts:24-25` | beat 写库失败零日志。worker 停跳会由 watchdog 报（watch.ts）；但 api 自身心跳停跳只在 admin 页显示陈旧时长，日志无痕 | 中 |
| `operations/watch.ts:61` | watchdog 检查本身失败零日志——watchdog 死了没人知道 | 中 |
| `operations/feedback.ts:97` | **修正 #152 表述**：正常失败路径并不丢失——`notify/feishu.ts:195` 落 `forward_error`，`operations/feedback.ts:114-130` 每 5 分钟重试至 7 天；`.catch(()=>{})` 只吞逃逸异常（如落库本身失败）且无日志 | 低（仅日志） |
| `media/upstream.ts:39` | trip 状态持久化失败零日志；限流判定以内存为准，仅影响 admin findings 展示 | 低 |
| 处置 | FR-3：四处改一行 console 错误日志（先例：`knowledge/graphiti.ts` 的 `console.error("graphiti_stats_failed", ...)`），不加子系统、不改告警语义 | |

## 4. `MODEL_PROVIDER_REGISTRY_ENABLED` —— 不是死代码，不删（#152 第 4 项）

- 1ce1c3f 共 **5 处**：`providers/llm.ts:151`、`editorial/models.ts:135`、`providers/nvidia-pool.ts:166`、`providers/registry/connections.ts:276`、`providers/registry/retest.ts:9`（#152 列 3 处，少算 registry 自身）。
- **cn-dev 正在用**：`.env` `MODEL_PROVIDER_REGISTRY_ENABLED=true`；T11 验收（2026-10-27 09:35-09:45Z）实测 8 阶段绑定走 DB 加密凭据 + 24h verified 检查。
- **文档把它定为生产目标**：`docs/deploy.md`（凭据迁移、`providerConnections.activation.v1` 激活标记、维护窗口流程）、`docs/model-provider-architecture.md`（先 dev 后生产的切换步骤）。`llm.ts` 注释明示 presets 是过渡路径（"old presets remain a compatibility path until development validates every adapter"）。
- 处置：双路由并存是**已文档化的过渡态**，非无人使用。移除需等生产（VM09）完成切换且全部 adapter 验证，属 Owner 决策；本 spec 不动。

## 5. `RECEIPT_AUTO_RELEASE_ENABLED` —— 在用配置，不删（#152 第 5 项）

- `operations/recover.ts:4-6,58-67`：默认关闭；开启即恢复一次性 30 分钟自动放行（涉付费调用重发语义）。
- cn-dev `.env` **=true**（worker 容器 `env_file: ./docker-compose.yml` → `.env`），`.env.development` =false，`.env.example` 注释默认 false。三处不一致，语义敏感（付费回执），去留属 Owner 决策，需 Owner 确认生产 VM09 的设置后统一。
- 处置：不删；把 .env/.env.development 不一致记为 Owner 待办。

## 6. alerts 旧键迁移分支 —— cn-dev 已迁移，生产未证（#152 第 6 项）

- `operations/alerts.ts:291-299`：每次读取把旧 `report.daily` 键改写为按日期键（幂等、一次性语义）。
- cn-dev dev DB `settings.alerts.state` 已**不含** `report.daily`（2026-10-27 只读查询）——该分支在本可读部署上是 no-op。
- 生产 VM09 无法从 cn-dev 读取（不动 VM09）→ 删除需 Owner 确认生产已迁移后走一个小清理 PR。本 spec 不动。

## 7. Spec 现状盘点（#176 T14"逐项"要求的最小事实表）

显式状态标记（grep 各 spec.md）：**已批准**：`009-ops-control-center`（2026-10-26）、`unattended-ops-ui`（2026-10-26，明确"不删公开 /research"）。**DRAFT/提案**：`news-explainer`（产品 Spec = PR #179，待 Owner 批准 4 项产品选择）、`production-latency-20261026`（自述 "spec proposal"，代码未批）、`eventgraph-explorer`（README 标 DRAFT）。其余目录（001-008、daily-report-depth、story-detail-dedup、public-discussions、event-evolution-experiment、event-impact-tracing）无显式状态行，按 #176 各 T 任务的实际验收记录为准（T06/T09/T10/T11/T12/T13 的证据已在 #176 进度日志）。

外部阻塞清单（代码之外，等 Owner）：① giscus App 未安装 + categoryId（T12 正路径）；② DEEPSEEK_API_KEY / EMBEDDING(DASHSCOPE) 受管凭据（T03 入图断链）；③ VM09 每周发布后才能做延迟对照（T13）；④ news-explainer 4 项产品选择（PR #179，T02/T05）；⑤ 生产 registry 切换 + `RECEIPT_AUTO_RELEASE_ENABLED` 口径（本文件 §4/§5）；⑥ VM09 alerts.state 旧键确认（§6）。

## 核验方法与可复现性

- 环境：cn-dev 本机；干净 worktree `.worktrees/t14-quality-debt-spec-20261027` @1ce1c3f（node_modules 硬链接自 queue-t09 worktree，依赖与 1ce1c3f 一致——两 commit 间仅 `packages/backend/src/reports/compose.ts` 与一个测试文件变化）。
- 本地栈：`aihot_t14_20261027_test`（aihot-db-1 容器内新建，只写测试库）、`scripts/migrate.ts`（95 条）、`scripts/e2e-seed.ts`（3 文章 + 1 事件）、api:3001 + built web:3000，`COLLECT_ENABLED=false MODEL_CALLS_ENABLED=false`。
- 未动：VM09、VM13、生产数据、cn-dev dev DB（只读 SELECT）、任何可执行代码。测试库与本地进程在核验后清理。
