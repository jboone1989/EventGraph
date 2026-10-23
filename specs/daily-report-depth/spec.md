# 日报写手与当日动态（Daily Report Depth）规格 v1.0（待批准）

> **状态：已批准（2026-10-23，使用者批准）。** 基线：`79cf3b3b472d98e2583e7f9093d58843c10852b4`（分支 `feature/nvidia-embeddings` 顶部；实现从该基线切 `feature/daily-report-depth`，目标合入 `develop`）。以规格所在 **commit SHA + 路径** 冻结需求；实现 PR 引用该 SHA，不私自修改已批准内容。

## 1. 背景与目标

日报当前的模型文字为零：[compose.ts](../../packages/backend/src/reports/compose.ts) 的 `composeDaily` 完全按规则排版（头条 + 3 条看点 + 栏目条目 + 快讯），只有周报月报有模型写手。dev 库近 9 天数据：

| 日期 | 判分条目 | 精选 | 日报收录事件 |
| --- | --- | --- | --- |
| 10-23 | 11 | 2 | 2 |
| 10-22 | 75 | 6 | 6 |
| 10-21 | 1 | 0 | 0 |
| 10-20 | 42 | 1 | 1 |
| 10-19 | 44 | 1 | 1 |
| 10-18 | 58 | 4 | 3 |
| 10-17 | 56 | 1 | 1 |
| 10-16 | 123 | 2 | 2 |
| 10-15 | 83 | 2 | 2 |

每天约 55 条被判分、约 2.5 条过精选（门槛 [selection.ts](../../industry/selection.ts)：T1 60 / T1_5 65 / T2 76）。其中 `score ≥ understandFloor(50)` 而未精选的每天约 **10–20 条**——这批是"值得认真对待但没上精选"的现成长尾。

**目标**：日报页面从"条目清单"变成"有综述、有全景的日报"——① 给日报配写手（当日综述，深度随材料伸缩）；② 加"当日动态"长尾层（score ≥ 50 未精选事件一行一条）。服务 AdSense 内容深度目标（见 `project_adsense_goal` 背景：过审 = 原创加工内容 + 足够页面厚度）。

## 2. 用户可见行为

### 2.1 中文日报 · 当日综述
- 报头（头条/看点区）之后、栏目版面之前显示一段**当日综述**：先全局一段（当天主线；仅当日材料支持时做跨事件联系），再按重要性为正文条目补上下文（发生了什么、关键数字与背景、影响范围）。
- 深度随材料伸缩：安静日短，不硬凑长度；综述里只写当日条目已有的事实，不评价、不预测、不补充条目以外的公司/产品/数字。
- 0 事件安静日（`REPORTS.quiet`）不写、不显示综述。

### 2.2 中文日报 · 当日动态（长尾层）
- 正文与快讯之后新增一节**当日动态**：一行一条（标题 + 来源 + 时间 + 链接）。
- 纳入规则（全部为既有规则的组合，不新增拍脑袋数字）：窗口内公开、`NOT backfill`、双次评分平均 `score ≥ 50`（即 `selection.ts` 的 `understandFloor`，**常量直接复用，不改名不改值**）、未进精选、未被 7 天日报记忆抑制（`dailyMemory` 同规则）、未进本期正文/快讯；时间归属与正文一致（按收录与发布的较晚者计入窗口，见 `periodReports` 注释）；每事件一条（代表条目，`pickRepresentative` 同规则），按分数降序，上限 40 条。
- 事件重复抑制与正文一致：7 天内已报道的事件，只有携带新事实才出现。

### 2.3 英文日报
- 英文日报显示**英文综述**（由中文综述生成，不加中文稿没有的事实，规则同 `english-digest.md`：不新增事实、保留归属与分歧、不预测价格）；没有英文综述时英文页**不显示**综述（维持现行"编辑中文散文不上英文页"规则，[ReportPaper.tsx](../../apps/web/app/features/report/ReportPaper.tsx) FrontPage 注释）。
- 英文"当日动态"条目用现有 `englishCopy` 英文标题渲染；无英文标题的条目按现行英文页 `hasEnglish` 过滤规则处理。

### 2.4 出口
- 网页读层（`publication/reports.ts` 的日报 detail/index）、llms 的日报输出带上综述与当日动态字段；RSS 日报条目的描述在综述可用时含综述，当日动态不进 RSS（保持 feed 精简）。
- **Agent API v1 契约不动**（其注释明确 fields never change）；当日动态与综述不进入 v1 输出。

## 3. 实现约束

- **写手步**：在 `composeDaily` 内按周报月报既有模式接 `chatJson`（`modelFor("report")`、回执 `receipts.ts`、预算熔断、`promptVersion` 记入 `REPORT_VERSION`）。模型失败或产出不可用（`grounded()`/`fitted()` 校验不过）时**照常出刊**，`generator.written=false`，页面无综述块——日报不因写手缺刊。
- **防幻觉护栏复用**：综述写入前过 `grounded(overview, corpus)`（专名/数字必须在当日条目语料）与 `fitted()` 截断；安全条款引用现有 `safety` 提示词。
- **提示词**：新增 `industry/prompts/report-daily.md`（中文综述）与 `industry/prompts/report-daily-english.md`（英文综述）；材料含正文条目的完整摘要（`deep-ai-brief` 之后的深度摘要）与 related 标题，不用 140 字截断版。
- **存储**：`content.overview`（与周报月报同字段名）、`content.overviewEn`、`content.tail`（当日动态条目数组）。content 为 jsonb，**无数据库迁移**。
- **成本**：每期日报 +2 次模型调用（中文综述、英文综述）。`MODEL_CALLS_ENABLED=false` 时不调用、照常出刊（无综述）。
- **重新生成**：`reason` 路径重写时综述与当日动态随版面一起重写，旧版进 `report_revisions`。
- **不回填**：已刊日报保持原样；改动生效后新刊开始变厚。

## 4. 规格化验收条件

| ID | 等级 | 读者可观察的验收行为 |
| --- | --- | --- |
| DR-01 | S1 | 任一天（含安静日）日报照常出刊；写手失败/不可用时版面与现状一致，`generator.written=false`，页面无空综述块 |
| DR-02 | S1 | 中文日报显示当日综述；综述中每个专名与数字都能在当日条目语料中找到（`grounded` 在写入前强制执行） |
| DR-03 | S1 | 当日动态列出 `score ≥ 50` 未精选事件：不含正文/快讯条目、不含 7 天内已报道且无新事实的条目、≤ 40 条、按分排序，一行一条带来源与链接 |
| DR-04 | S1 | 英文日报显示英文综述；无英文综述时不出现中文综述；英文当日动态用英文标题并按 `hasEnglish` 过滤 |
| DR-05 | S1 | 网页读层、RSS、llms 带新字段；Agent v1 输出逐字段与基线一致（契约测试证明） |
| DR-06 | S1 | 综述与英文综述的调用都经回执与预算熔断；`MODEL_CALLS_ENABLED=false` 时日报照发 |
| DR-07 | S0 | dev 真实数据回归：对过去 7 天窗口重算当日动态，报告每天条数（预期量级 10–20）并抽样核对不混入噪声；中英文日报页面在浏览器实际打开核对（桌面 + 窄屏） |
| DR-08 | S0 | 既有检查链全绿：`npm run typecheck`、后端 `node --test`、`apps/web` 构建与测试、`scripts/smoke.ts` |

## 5. 非目标

- 不改精选门槛（`selection.ts` 不动一行；长尾层不改变"精选"语义）。
- 不动周报月报的规则与文字上限（它们从日报汇总，综述材料是否喂给周报留待观察）。
- 不回填旧刊；不动 Agent API v1；不动事件页/条目页；综述不做观点评论。

## 6. 涉及文件（实现计划阶段细化）

`packages/backend/src/reports/compose.ts`、`packages/backend/src/reports/edition.ts`（长尾查询）、`industry/prompts/report-daily.md`、`industry/prompts/report-daily-english.md`、`packages/backend/src/publication/reports.ts` 及 feeds/llms 读层、`@aihot/contracts` 类型、`apps/web/app/features/report/ReportPaper.tsx`、`tests/` 对应单测与契约测试。
