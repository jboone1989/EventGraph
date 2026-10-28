# EventGraph · 影响追踪 P2 能源/航运最小纵向数据链 Spec（DRAFT）

> **状态：DRAFT——research-first 研究产出，未批准，不授权任何实现、迁移、数据接入或部署。** 按 [docs/spec-review.md](../../docs/spec-review.md)，实现 PR 必须引用独立合并的批准版 spec（commit SHA + path），本文件当前不是批准版。
> 上游：Issue #176 T08；规划基线 [spec.md](../event-impact-tracing/spec.md) §五 P2 / §六；T06 证据结论 [audit-2026-10-27.md](../event-impact-tracing/audit-2026-10-27.md) / [validation.md](../event-impact-tracing/validation.md)；已批准的 [P1 Spec](../event-impact-tracing-p1/spec.md)（其 §1 非目标 2 明确把能源/运价指标留给 P2 另行准入评估——本文件即该评估的最小产物）。
> 证据与许可依据：[evidence-2026-10-28.md](./evidence-2026-10-28.md)（2026-10-28 18:33–18:49 UTC 实拉）与 [validation.md](./validation.md)。前一轮 NO-GO 核查（2026-10-28 03:29–03:36 UTC，本仓 `.data/t08-feasibility-20261028.md`，未入库）因两源当日已补发 T0 窗口数据而被本轮复核推翻，过程与教训见 evidence §1。

## 1. 目标与非目标

T08 原文：*"仅在小样本证据与许可足够时接少数航路/能源/运价指标，核对基线/交易日和替代解释；不完整则如实记录，不启动 P3 大规模行业扩展。"*

本轮证据结论（evidence §2）：**存在两个许可可核、已覆盖 T0 事件窗口的官方指标**——EIA Brent 现货日价与 IMF PortWatch 霍尔木兹日过峡数；**运价类全部拒绝**（evidence §4）。据此本 DRAFT 只规划：

| 项 | 取值 | 依据 |
| --- | --- | --- |
| 样本事件 | T0 = 霍尔木兹油轮触雷（story `3d1ae73d`，occurred 2026-10-22） | T06 audit §2 |
| 航路/海峡 | 1 个：Strait of Hormuz | 规划 §六 样本限制 |
| 能源指标 | 1 个：EIA Europe Brent Spot Price FOB（`RBRTE`，API v2 `series=RBRTE`；bulk 序列号 `PET.RBRTE.D`） | evidence §2.1，公有领域 |
| 航运指标 | 1 个：IMF PortWatch `Daily_Chokepoints_Data` 霍尔木兹 `n_total`（可选伴生 `n_tanker`） | evidence §2.2；**展示受许可门槛（§4.3）** |
| 运价指标 | 0 个 | evidence §4：无合法可再分发源 |
| 企业层 | 0 家：终止于航运/市场层 | T06 §6.1 站内无可核暴露；规划 §五 P2 明文允许 |
| 政策层 | 不新增：沿用 T06 §4.2 站外一手记录为背景链接，不进产品数据 | P1 已界定政策层渲染边界 |

**非目标（红线，继承 P1 §1 与规划 §三）**：不画任何跨层因果边；不新建图谱/影响边表（本 DRAFT 阶段零代码）；不接运价（Baltic/Drewry/SCFI/Harpex 全部许可拒绝）；不抓取/建爬虫（两源均为官方结构化接口）；不启动 P3；不回填历史数据 beyond 本 DRAFT 记录的已核日期。

## 2. 数据源准入（规划 §四 源准入检查逐项）

| 检查项 | EIA Brent | PortWatch Hormuz |
| --- | --- | --- |
| 接口实际成功 | ✅ API v2 `facets[series][]=RBRTE`（2026-10-28 18:35 UTC 实拉 31 行）；bulk `PET.zip` 同源但当前滞后（止 10-20） | ✅ ArcGIS FeatureServer 免鉴权查询 |
| 历史跨度 | 1987-05-20 起（10,003 点） | 2019-01-01 起 |
| 最后更新 | 2026-10-27（截至 2026-10-28 18:35 UTC，滞后 1 个交易日=常态） | 2026-10-25（滞后 3 个日历日） |
| 频率/日历 | 日度、**仅交易日**（周末/假期缺行） | 日度、**日历日**（含周末） |
| 单位 | USD/桶（`$/BBL`） | 艘/日（AIS 派生计数，`n_total`） |
| 许可 | 美国政府公有领域，要求署名 | 可再分发需署名；**商用（含 AdSense 语境）须先获 IMF 书面许可** |
| 成本/限额 | 免费；DEMO_KEY 仅够路由发现，取数需注册免费 key（实现期再做，本轮未注册） | 免费、无 key |
| 已知误差 | 现货评估价，非成交价 | AIS 黑暗船舶/GNSS 干扰不计；0 ≠ 零通行 |

交叉核对：FRED 镜像 `DCOILBRENTEU` 与 EIA API 逐值一致（evidence §2.1），镜像只作交叉验证，产品取数走 EIA 一手。

## 3. 展示语义（用户可见行为，实现期兑现）

1. **窗口**：T0−7d..T0+7d（2026-10-15..10-29），**只画实际存在的行**：Brent 按交易日日历（缺行留空，不插值、不复制周五值）；PortWatch 按日历日；`0` 与缺行必须视觉区分（0 有行、缺行断线）。
2. **原始值优先**：并排"日期 + 原始值 + 单位"，涨跌幅只作附属数字——10 月 Brent 自身 ±18% 级波动（10-01 114.82 → 10-02 135.51）使百分比单独出现即误导（T06 §6.2 已有判断，evidence §3.1 实证）。
3. **known/valid 双时间**：序列点带 `observed_at`，页面的 known 滑块必须截断未来观测（与 P1 AC-7 同语义）；已知缺口（Brent bulk 滞后、PortWatch 滞后）以"截至 known 时刻可见的最新行"呈现，不事后补画。
4. **强制替代解释文案**（随指标常驻，不许省略）：①过峡水位自 2026-07 中旬封锁起已是**个位数新常态**，降幅成因先于 T0 三个月，T0 后数字不得归因触雷（evidence §3.2）；②Brent 10 月巨幅波动远超 T0 单日 +6.8%，事件效应不可辨识；③AIS 计数的黑暗船舶/GNSS 干扰偏差（JMIC update-108，T06 §5.1）。
5. **署名**：EIA——"Source: U.S. Energy Information Administration"；PortWatch——"Source: International Monetary Fund, IMF PortWatch"（附链接）。
6. **零因果边**：能源/航运序列与事实站/政策线索之间不出现箭头或连线语义（继承 P1 非目标 4）；序列标签用"外部观测/External observation"，绝不用"影响/导致"。

## 4. 实现前置约束（本 DRAFT 只记录，不设计）

1. **schema**：`market_snapshots` 的 `price_usdt numeric CHECK (>0)` + `exchange` + `asset` 三元组编码的是加密现货语义；USD/桶（政府评估价、非交易所）与艘/日计数**不得塞入该表**。实现 PR 须以最小迁移提供独立的单位/币种/来源类型语义，具体形状留给该 PR 的 plan 并受其独立评审。
2. **取数**：worker 每日一次、在源发布节奏之后；空响应/失败记"缺行"，**绝不记 0**；不回填早于本 DRAFT 记录的日期。
3. **许可门槛（展示级）**：本站含 AdSense（specs/002-adsense-readiness）属商用语境。**PortWatch 在获得 IMF（copyright@imf.org）书面许可前，不得出现在任何读者可见页面**；此前它只存在于本 evidence 文档与内部验证。EIA 公有领域无此门槛。若 Owner 决定站内撤广告语境，此条相应放宽。
4. **审批路径**：本 DRAFT → Owner/独立评审批准（钉 commit SHA）→ 实现 PR（引批准版）→ 验收（validation.md §3 协议）。

## 5. 验收标准（全部可证伪；证明方式注明）

| # | 验收 | 证明方式 |
| --- | --- | --- |
| AC-1 | 只有两个指标进入产品：Brent（EIA 一手 API）与 Hormuz `n_total`（IMF PortWatch）；无运价、无企业、无政策阶段数据 | contracts/配置穷举 + PR diff 审查 |
| AC-2 | 每个序列点可溯源：日期、原始值、单位、来源署名；读者可见页面上的 PortWatch 内容仅当 IMF 商用许可已获批（§4.3），否则该指标不渲染 | 单测 + 部署页抽查 + 许可记录文件 |
| AC-3 | 交易日/日历日语义正确：Brent 周末/假期无行且不插值；PortWatch `0` 与缺行视觉区分 | 单测（含 10-17=0 与 10-18 前缺行 fixture） |
| AC-4 | known 滑块截断：known@T 时刻页面不出现 `observed_at > T` 的序列点 | 单测 + e2e |
| AC-5 | 替代解释三条文案（§3.4）随指标渲染，双语一致 | e2e zh/en |
| AC-6 | 零因果边：全部视图（双语言、双宽度）无"触雷→油价/过峡"式连线或措辞 | e2e DOM 断言（复用 P1 AC-3 模式） |
| AC-7 | 序列不写入 `market_snapshots`：新表/列带单位与币种字段；`npm run typecheck` + 全量测试绿 | 迁移 diff + CI |
| AC-8 | 窗口诚实：T0+7d（10-29）行存在前，窗口终点如实显示"数据未发布/未到"；行存在后（最早约 10-30）自动闭合，无手工补数 | e2e + 数据断言 |

**停止条件**：①实现时 EIA API 或 bulk 再停滞 >3 个交易日 → 暂停接入并回到 evidence 复核（不建"等数据"的空管道）；②IMF 许可被拒 → PortWatch 永久移出产品，仅存 evidence；③发现任一源许可条款变化 → 重新过 §2 准入表；④需要"补一条数据"才能过验收（规划 §六停止条款）→ 停，回证据层。

## 6. 与既有工作的边界

- P1（已批准，未实现合并前不依赖本 DRAFT）：P1 的 `market_observation` 仅绑现有加密快照；P2 指标是**新增观测类型**，不改变 P1 任何验收项。
- T06 audit §6.2"数日内可闭"的推测已被 evidence §1 的两次实测教训修正：**闭窗承诺只以实测行存在为准**（AC-8 即此原则的产品化）。
- 本 DRAFT 不修改 T06/T07 任何文件；不勾选 Issue #176 T08 复选框（任务完成以批准+实现+验收为准）。
