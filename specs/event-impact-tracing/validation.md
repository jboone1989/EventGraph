# EventGraph · 事件影响追踪 · P0 真实证据矩阵验证记录（T06）

> 2026-10-27。验证对象：`origin/develop` `80088dc`（含 PR #134 `3750227`）+ 本分支**纯文档**增量。证据来源：[audit-2026-10-27.md](./audit-2026-10-27.md)（真实案例只读采样 + 一手文件核验）。**未验证项如实标注，未跑的检查不写成完成。**

## T06 交付对照（Issue #176）

T06 要求：真实地缘冲突/航道事件的事实→政策→供应链→企业→市场证据矩阵，官方来源、版本、时间与许可；缺证据标断链；反例"共现≠因果"；不得伪造 2 跳关系。

| T06 要求 | 交付位置 | 结论 |
| --- | --- | --- |
| 五层证据矩阵 | audit §8 总表 + §2/§4/§5/§6 分层 | ①事实有据（单方主张）；②政策有据但**先于 T0**；③航运有据（官方声称+观测）；④⑤断链 |
| 官方来源/版本/时间 | §4.2（JMIC 015-26、CENTCOM 10-05、update-108）、§5.1（两份 UKMTO/JMIC PDF 全文提取） | 三份官方文件对封锁宣布/生效/执行时点互洽（07-14+100 天=10-22） |
| 许可 | §8 许可列 | 官方文件引用+链接；EIA/FRED 可再分发需署名；商业新闻摘要+链接 |
| 断链标注 | §8 链路判定列 + §4.3/§6.1/§6.2 | 事实→政策、航运→企业、事实→市场三条断链，各有实据原因 |
| 反例"共现≠因果" | §5.3（$117 数字共现）、§5.3（事件混淆）、§4.3（政策层综合稿并列） | 三条负例成立，产品未产生任何凭共现的边 |

## 验收对照（spec §六，仅对本 PR 改动范围）

| # | 验收 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 零无来源影响边 | PASS | 本 PR 零代码；产品侧由单测 `apps/web/tests/impact-evidence.test.ts` + audit §5.3/§6.2 真实负例覆盖 |
| 2 | 政策阶段不混淆 | PASS（研究侧） | audit §4.2：封锁宣布（07-13）/生效（07-14T20:00Z）/执行四时点均有官方文件；无"拟议当生效" |
| 3 | 物流指标带单位/基线/口径 | PASS（研究侧） | audit §5.1：101 艘次 vs ~138 艘/日自带双源口径脚注；AIS 局限为文件原文 |
| 4 | 企业暴露可核查、结果与风险分开 | PASS（断链路径） | audit §6.1：UFN 隐名导致归属不可核；Mercuria 诉讼明确标注为先于 T0 的背景，非本事件后果 |
| 5 | 市场数据带时点/来源、不归因 | PASS（断链路径） | audit §6.2：Brent 序列止于 10-20，事件窗口无一手数据，明确不写数 |
| 6 | known 不穿越 / 有界重建 | PASS | audit §3 真实数据演示 + 单测（develop 已有） |
| 7 | 负例：纯共现不出现影响边 | PASS | audit §5.3/§6.2/§4.3 三条真实负例 |
| 8 | 外部源不可用降级 | PASS | audit §8 链接状态列如实记录（CENTCOM 主站、卫报、MEE 本机不可达，均给出替代路径或标注） |
| 9 | 双语 + 390px/桌面真实浏览器验收 | 不适用（本 PR 零代码） | EN 桌面+390px e2e 已在 develop；zh 变体留待 P1 实现 PR（草案 Spec 不实施代码） |
| 10 | 许可合规 | PASS | audit §8 许可列；信源 RSS-only、`site_fulltext=false`（`tests/event-impact-sources.standalone.test.ts` 锁定） |

## 复验记录（2026-10-27 15:0x–15:4x UTC，任意审查者可重复）

1. **DB 只读复读**（cn-dev `aihot-db-1`）：fact `fIEpWumpna_g`（v1、occurred_at 10-22T16:00Z）、story `3d1ae73d`、T0 article（published 10-23T22:36:43Z / discovered 10-25T01:08:06Z）、BTC 10-22T15:30:25Z=81520.01→16:00:30Z=81735.8 全部与 audit 一致；规模 843/887/15,307（采样后仍入库）。积压演变：`y57npa0d5tth02lmmjpbgllwe` 已 verdict=roundup；`vmci434govoca8sm6wpndfw06` 仍无决定。
2. **一手 PDF 全文提取**：update-108（5,407,596 B、10 页）、warning 183-26（287,401 B、1 页）、015-26（875,588 B、4 页）均下载并 `pdftotext` 提取，audit §4.2/§5.1 所引数字为文件原文。
3. **外部链接状态**（curl 带浏览器 UA）：中新网/gCaptain×2/TASS/新华社/UKMTO×3/DVIDS/FRED = 200；CENTCOM 主站 DNS 失败（DVIDS 官方镜像替代）；卫报/半岛/MEE 本机出口受限未开（内容经搜索服务商快照引用，audit 已标注）。
4. **FRED 数据**：`https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU` 拉取成功，Brent 10-15=126.35 … 10-20=115.22（序列终点），WTI 10-20=107.89。
5. **本 PR diff 仅 3 个 .md 文件**：`git diff origin/develop --stat` 复核。

## 本分支变更清单

| 文件 | 变更 | 理由 |
| --- | --- | --- |
| `specs/event-impact-tracing/audit-2026-10-27.md` | 新增/扩充 | T06 交付：五层一手证据矩阵、链路判定、许可、链接状态 |
| `specs/event-impact-tracing/validation.md` | 新增 | 本文件 |
| `specs/event-impact-tracing/spec.md` | 追加"案例验证记录"小节（仅链接，不改需求） | spec §八.6 要求案例输出可从 spec 追溯 |

**明确不做**（证据不支持 / 草案 Spec 不实施代码）：新表/新列、跨故事关键词拉稿、政策阶段 schema、能源/运价数据源接入、首页任何改动、任何回填、e2e 变体。曾写出的 zh e2e 变体与 npm install 造成的 package-lock 抖动已在提交前还原。

## 复核指引（任意独立审查者）

1. `git log origin/develop..HEAD`：仅 1 个提交（rebase 后基线 `95ab1ce`，纯文档不碰 #177 的 spec-gate 文件；采样时基线为 `80088dc`，见 audit §1）、上述 3 个文件。
2. audit §1 SQL 断言可用同连接复读（cn-dev 只读）；§4–§6 每条外部 URL 直接打开核对时间戳；三份 PDF 链接可直接下载后 `pdftotext` 对数。
3. 本 PR 不改任何代码路径，`npm run typecheck` / `npm test` / web 测试与 `origin/develop` 基线一致性由 CI 证明（docs-only diff 不会影响）。
