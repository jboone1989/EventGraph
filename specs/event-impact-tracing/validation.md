# EventGraph · 事件影响追踪 · P0 真实证据矩阵验证记录（T06）

> 2026-10-27。验证对象：`origin/develop` `80088dc`（含 PR #134 `3750227`）+ 本分支文档增量与 1 个 standalone 测试断言（无产品代码）。证据来源：[audit-2026-10-27.md](./audit-2026-10-27.md)（真实案例只读采样 + 一手文件核验）。**未验证项如实标注，未跑的检查不写成完成。**

## T06 交付对照（Issue #176）

T06 要求：真实地缘冲突/航道事件的事实→政策→供应链→企业→市场证据矩阵，官方来源、版本、时间与许可；缺证据标断链；反例"共现≠因果"；不得伪造 2 跳关系。

| T06 要求 | 交付位置 | 结论 |
| --- | --- | --- |
| 五层证据矩阵 | audit §8 总表 + §2/§4/§5/§6 分层 | ①事实有据（单方主张）；②政策有据但**先于 T0**；③航运有据（官方声称+观测）；④⑤断链 |
| 官方来源/版本/时间 | §4.2（JMIC 015-26、CENTCOM 10-05、update-108）、§5.1（两份 UKMTO/JMIC PDF 全文提取） | 三份官方文件对封锁宣布/生效/执行时点互洽（07-14+100 天=10-22） |
| 许可 | §8 许可列 | 官方文件引用+链接；EIA/FRED 可再分发需署名；商业新闻摘要+链接 |
| 断链标注 | §8 链路判定列 + §4.3/§6.1/§6.2 | 四条相邻链路：事实→政策、航运→企业断链，政策→航运有据，企业→市场无对象；另有事实→市场直连断链，各有实据原因 |
| 反例"共现≠因果" | §6.2（$117 数字共现）、§4.3（政策层综合稿并列） | 两条负例成立，产品未产生任何凭共现的边；§5.2 归组层事件混淆控制因一篇 gCaptain 稿尚无归组决定，暂不计为通过 |

## 验收对照（spec §六，仅对本 PR 改动范围）

| # | 验收 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 零无来源影响边 | PASS | 本 PR 零产品代码；产品侧由单测 `apps/web/tests/impact-evidence.test.ts` + audit §6.2/§4.3 真实负例覆盖 |
| 2 | 政策阶段不混淆 | PASS（研究侧） | audit §4.2：封锁宣布（07-13）/生效（07-14T20:00Z）/执行四时点均有官方文件；无"拟议当生效" |
| 3 | 物流指标带单位/基线/口径 | PASS（研究侧） | audit §5.1：101 艘次 vs ~138 艘/日自带双源口径脚注；AIS 局限为文件原文 |
| 4 | 企业暴露可核查、结果与风险分开 | PASS（断链路径） | audit §6.1：UFN 隐名导致归属不可核；Mercuria 诉讼明确标注为先于 T0 的背景，非本事件后果 |
| 5 | 市场数据带时点/来源、不归因 | PASS（断链路径） | audit §6.2：Brent 序列止于 10-20，事件窗口无一手数据，明确不写数 |
| 6 | known 不穿越 / 有界重建 | PASS | audit §3 真实数据演示 + 单测（develop 已有） |
| 7 | 负例：纯共现不出现影响边 | PASS | audit §6.2/§4.3 两条真实负例；归组层事件混淆控制因一篇 gCaptain 稿尚无归组决定暂不计为通过，待归组决定齐后复跑（§5.2） |
| 8 | 外部源不可用降级 | UNVERIFIED（本 PR 零产品代码） | audit §8 只记录研究 URL 可达性，不能证明产品在 Graphiti/外部市场源故障时会降级；须在后续实现验收中注入故障并验证可读来源回退 |
| 9 | 双语 + 390px/桌面真实浏览器验收 | 不适用（本 PR 零产品代码） | EN 桌面+390px e2e 已在 develop；zh 变体留待 P1 实现 PR（草案 Spec 不实施代码） |
| 10 | 许可合规 | PASS | audit §8 许可列；事件包 4 信源与 T0 信源 `rss-cn-chinanews-world` 均 RSS-only、`site_fulltext=false`（`tests/event-impact-sources.standalone.test.ts` 锁定，本 PR 补锁 T0 信源） |

## 复验记录（2026-10-27 07:0x–07:2x UTC 主复查 + 14:0x UTC 追加复查，任意审查者可重复；时刻勘误见 audit §1 注）

1. **DB 只读复读**（cn-dev `aihot-db-1`）：fact `fIEpWumpna_g`（v1、occurred_at 10-22T16:00Z）、story `3d1ae73d`、T0 article（published 10-23T22:36:43Z / discovered 10-25T01:08:06Z）、BTC 10-22T15:30:25Z=81520.01→16:00:30Z=81735.8 全部与 audit 一致；规模 843/887/15,307（采样后仍入库）。积压演变：`y57npa0d5tth02lmmjpbgllwe` 已 verdict=roundup；`vmci434govoca8sm6wpndfw06` 仍无决定。
2. **一手 PDF 全文提取**：update-108（5,407,596 B、10 页）、warning 183-26（287,401 B、1 页）、015-26（875,588 B、4 页）均下载并 `pdftotext` 提取，audit §4.2/§5.1 所引数字为文件原文。
3. **外部链接状态**（curl 带浏览器 UA）：中新网/gCaptain×2/TASS/新华社/UKMTO×3/DVIDS/FRED = 200；CENTCOM 主站 DNS 失败（DVIDS 官方镜像替代）；卫报/半岛/MEE 本机出口受限未开（内容经搜索服务商快照引用，audit 已标注）。
4. **FRED 数据**：`https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU` 拉取成功，Brent 10-15=126.35 … 10-20=115.22（序列终点），WTI 10-20=107.89。
5. **本 PR diff 为 3 个 .md 文件 + 1 个 standalone 测试文件**：`git diff origin/develop --stat` 复核。
6. **复查追加（2026-10-27 14:0x UTC，第二轮审查修复时）**：cn-dev `aihot-db-1` 只读复查——`grouping_decisions` 中 `y57npa0d5tth02lmmjpbgllwe` verdict=roundup、`vmci434govoca8sm6wpndfw06` 仍无归组决定；T0 fact `fIEpWumpna_g` 路线仍仅 1 篇文章且来源为 `rss-cn-chinanews-world`（综合稿 `zqxnd4gout6i05ajc4vvcl9hs` 同源）。§5.2 事件混淆控制据此改判"暂不计为通过"。

## 本分支变更清单

| 文件 | 变更 | 理由 |
| --- | --- | --- |
| `specs/event-impact-tracing/audit-2026-10-27.md` | 新增/扩充 | T06 交付：五层一手证据矩阵、链路判定、许可、链接状态 |
| `specs/event-impact-tracing/validation.md` | 新增 | 本文件 |
| `specs/event-impact-tracing/spec.md` | 追加"案例验证记录"小节（仅链接，不改需求） | spec §八.6 要求案例输出可从 spec 追溯 |
| `tests/event-impact-sources.standalone.test.ts` | 新增 T0 信源许可断言 | 审查修复：validation #10 的 PASS 需覆盖 audit 实际依赖的 T0 信源（`rss-cn-chinanews-world`），原测试只锁事件包 4 信源 |

**明确不做**（证据不支持 / 草案 Spec 不实施代码）：新表/新列、跨故事关键词拉稿、政策阶段 schema、能源/运价数据源接入、首页任何改动、任何回填、e2e 变体。曾写出的 zh e2e 变体与 npm install 造成的 package-lock 抖动已在提交前还原。

## 复核指引（任意独立审查者）

1. `git log origin/develop..HEAD`：原始功能提交 `859db49`、时刻勘误提交 `843220f` 与 `3dea359`，以及本次审查修正提交；采样时基线为 `80088dc`（audit §1）。以最新 PR 提交列表为准；本 PR 修改上述 3 个文档文件与 1 个 standalone 测试文件（T0 信源许可断言）。
2. audit §1 是 DB 环境/规模快照，不含 SQL 语句；DB 行级标识和时间见 audit §2–§3，归组状态见 §5.2，市场快照见 §6.2，可在 cn-dev 用只读查询逐条核对。§4–§6 外部 URL 可打开核对时间戳；三份 PDF 可下载后 `pdftotext` 核数。
3. 本 PR 不改任何产品代码路径（唯一代码改动是 standalone 测试断言，不进运行时），`npm run typecheck` / `npm test` / web 测试与 `origin/develop` 基线一致性由 CI 证明。
