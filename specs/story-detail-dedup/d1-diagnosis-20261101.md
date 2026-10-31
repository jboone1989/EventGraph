# T10 D-1 归组诊断报告（2026-11-01）

> **状态说明**：本报告是 [spec v0.2](./spec.md) §4/§5 D-1 要求的归组诊断产出。标注者是 T10 **实施代理，不是独立人工审阅者**；结论应按「实施代理标注」对待，不构成最终验收。数据 = cn-dev 生产库 2026-11-01 dump 恢复的本地副本（`aihot_p1`，25112 publications / 1074 stories / 1130 facts）；工具 = PR #229 `scripts/story-fact-diagnose.ts`（只读，复用公开读取边界）；原始 JSON 存 `.claude/p1-20261101/d1/`（会话产物，报告内证据均已摘录）。**未预设目标站数，未修改任何库数据或归组。**

## 案例一：Anthropic S-1（`5137a381`，AI 公司资本运作域，6 Facts / 11 reports）

| Fact | 行为/主体（frame） | 发生时间 / 收录时间 | 标注 | 依据（JSON 内证据） |
| --- | --- | --- | --- | --- |
| `fZr9Ac1UZoRM` 提交S-1申请IPO | Anthropic 提交 IPO 申请（S-1），拟 11 月上市 | 2026-10-25T16:00Z ⚠ / 10-26 13:42 | **SAME_OCCURRENCE**（成立） | CoinDesk "filed for an IPO on Monday morning"（10-26 为周一）+ PANews "美东时间 10 月 26 日公开提交"；4 家报道同一事件 |
| `f4Mm9BM75KPQ` 披露IPO招股文件并警示AI风险 | 同上 + AI 灾难性风险警示 | occurredAt **缺失** / 10-26 13:35 | **SAME_OCCURRENCE**（与上一条为同一次发生、不同媒体侧重） | BBC "revealed details of its business ahead of…"; Ars Technica url "ipo-warns-its-ai-could-blackmail-people…"；决策 #1141 人工 kept 注记原文即写明「同一IPO招股文件的披露……同一次发生的不同侧重」 |
| `fqP2nH524Qdo` 提交IPO文件（France24 次日稿） | Anthropic 提交公开监管文件 | 10-26T16:00Z / 10-27 10:45 | **仅重复媒体表述** | France24 10-27 稿是同一 S-1 的次日重述；模型判定 #1170 已把 3 个候选全标 ROUNDUP（识别正确），但流程仍生成独立 Fact 并入页面 → 页面层存在近重复站点 |
| `fbW4NMpwf8ak` 多重身份叙事引发信任讨论 | **frame 全空**（subject/action/object=null） | occurredAt 缺失 / 10-26 18:39 | **证据不足（评论性内容）** | MIT Technology Review 评论文章（"will-the-real-anthropic-please-stand-up"），无独立发生，作为独立 Fact 站点稀释站级语义 |
| `f5gClWckVxAk` 美政府出售 FTX 关联股份 | US government 出售被没收股份偿付 FTX 债权人 | occurredAt 缺失 / 10-27 19:39 | **真实独立发展**（SAME_STORY 挂靠合理） | BeInCrypto：2025-10 以 $140.9676 购入、按成本转售九家买方——与 S-1 提交是不同发生 |
| `fBTDAHwuxWn0` S-1 显示亚马逊成最大赢家 | Amazon 经可转债+优先股持仓，IPO 后账面约 979 亿美元 | 10-26T16:00Z ⚠ / 10-28 01:26 | **真实独立侧面**（SAME_STORY 合理） | TechCrunch "According to the S-1, Amazon holds convertible notes with $6.2 billion…"——由同一文件揭示的新事实；⚠ occurredAt 早于报道发布约 33 小时，且"文件显示"类内容的时点应跟随 S-1 公开 |

**案例一小结**：6 Facts 中 2 个真实独立发展、1 对同次发生的不同侧重（保守拆分、来源独立，可接受但相邻重复）、1 个次日重述未被页面吸收（近重复）、1 个评论性内容立站（证据不足）。无漏召回（除首篇外全部有候选）；无模型误判；#1141 的人工 kept+注记证明人工修正路径工作正常。两个 occurredAt 口径疑点已在上表标 ⚠。

## 案例二：OKX-ICE 代币化股票反对潮（加密金融监管域，跨 5 Story / 7 Facts）

事件链（以公告轮次与报道时间重建）：**9 家（首轮）→ 16 家 → 26 家 → 33 家**，外加 Cuomo 回应。

| Story（Fact） | 轮次 | 发生/收录时间 | 标注 | grouping_decisions |
| --- | --- | --- | --- | --- |
| `75812563`（`f4gt1rJjsFBM`，The Block 10-17：CoreWeave/Broadcom/Verizon 等九家） | 首轮 9 家 | 10-16T16:00Z / 10-17 20:28 | SAME_OCCURRENCE（成立，本轮唯一首报） | #444 new-story，**候选为空**（最早一篇，无既往可召回，正常） |
| `458bc0be`（`fMh033NX_0b4`，CoinDesk 10-18：Broadcom/Verizon/UnitedHealth 等九家） | 首轮 9 家（**重复**） | 10-14T16:00Z ⚠ / 10-19 00:10 | **与上一条同一发生（重复媒体拆分）** | #498 **已召回但未采信**：候选恰为 fact 372（即 The Block 篇），relation=**SAME_OCCURRENCE、confidence=1.0**（score 0.254），verdict 仍为 new-story |
| 主 `467b8db4`（`fVJ46FFF4VCQ`，CoinDesk 10-20：Cuomo 称抵制是自然反应） | Cuomo 回应（16 家语境） | 10-19T16:00Z / 10-20 18:46 | 真实独立发生 ✓ | #744 new-story，候选仅 1 条 UNRELATED——正确 |
| 主 `467b8db4`（`fmpl03-pPWPE`，Decrypt 10-20：新增七家至 16 家） | 轮次 +7 → 16 | 10-18T16:00Z / 10-20 21:00 | 真实发展 ✓ | #782 new-fact-in-story，候选 SAME_STORY（0.319/0.261）——正确并入 |
| 主 `467b8db4`（`fr4h0n9Cn1pU`，BeInCrypto 10-29：JPMorgan/Coca-Cola 等 33 家，62 家名单已走 30 家） | 轮次 → 33 | occurredAt **缺失** / 10-29 00:29 | 真实发展 ✓ | #1389 new-fact-in-story，候选 SAME_STORY（0.275/0.253）——正确并入 |
| `7ded12e9`（`fraS1258sTPw`，CoinDesk+Decrypt 10-27：IBM/Oracle/Intel/IonQ，总数 26） | 轮次 → 26 | 10-25T16:00Z / 10-27 18:51 | 真实发展 ✓（但被拆为独立 Story） | #1211 **已召回但拆分**：候选 fact 653 SAME_STORY conf **0.9**，verdict new-story；同稿 Decrypt #1220 same-fact 并入 ✓ |
| `67552dbd`（`fQst0oJzyA_Y`，Cointelegraph 10-23：富国银行等六家反对） | 时序位于 16 与 26 之间 | occurredAt **缺失** / 10-23 21:59 | **信息缺口**（无法核实是否真实独立轮次） | #681 new-story，**候选为空 → 未召回**；且 membershipEvidence=null，无法从证据判断 |

### 跨 Story 对判定

| 对 | 判定 | 依据 |
| --- | --- | --- |
| `75812563` ↔ `458bc0be` | **同一次发生的重复拆分（误判）** | 两篇报道均覆盖首轮 9 家公告；Broadcom、Verizon 两个名字重叠（The Block 另有 CoreWeave，CoinDesk 另有 UnitedHealth）；#498 候选已给出 SAME_OCCURRENCE/conf 1.0 |
| `7ded12e9`（26 家）↔ 主 `467b8db4` | **同一长期事件的不同真实发展（非重复）** | 16 → 26 → 33 是异议名单的三次真实更新，公司名单逐轮扩大；不应合并 Fact，但应表达为同一线索 |
| `67552dbd`（六家）↔ 主 Story | **证据不足** | 无候选、无归属证据；富国银行未出现在任何已摘录名单中，可能真实独立轮次，也可能是既有轮次的换角度转述——需原文核验后再判 |
| 互链充分性 | **related 不足以表达** | `story_links` 中 `467b8db4` ↔ `7ded12e9` 的 relation='related'；但二者实为同一事件链条的先后发展（同 spec 早已记录的 storyline/related 表达力局限的实例） |

### grouping_decisions 汇总（spec §4 分类）

- **未召回本该匹配的 Fact：1 例**——#681（富国银行六家，候选为空）；另有 1 例轻度：#444 属首报正常。
- **已召回但未采信/误判：2 例**——#498（SAME_OCCURRENCE conf 1.0 仍 new-story，真重复未合并）；#1211（SAME_STORY conf 0.9 拆为独立 Story）。
- **判定不一致（重要观察）**：同样是 SAME_STORY 候选，#782（16 家）与 #1389（33 家）并入 Story 588，#1211（26 家）却创建新 Story 937——同一形态、两种归宿，读者侧结果是一个链条被拆成「主 Story + related Story + 3 个孤立 Story」。
- 无「已召回但误判为 SAME_OCCURRENCE/SAME_STORY 而错误合并」实例；无人工更正记录于本集群（案例一 #1141 除外）。

## 观察与建议（按 spec §4：只建议、不实施）

1. **真重复未被高分候选吸收（#498）**：候选 relation= SAME_OCCURRENCE 且 confidence=1.0，仅相似度 score（0.254）偏低，最终未合并。最小修复方向：让「高置信 SAME_OCCURRENCE 候选」参与合并决策（或至少进入人工待审队列），而不是只由 score 门槛决定；也可直接走现有人工纠正路径合并 Story 349/392。独立评审后再动手。
2. **SAME_STORY 处置不一致（#782/#1389 vs #1211）**：建议核对 verdict→动作映射的输入（score、时间窗、Story 年龄），明确一条稳定规则后再改，避免为单一样本调参。
3. **页面层近重复（案例一 `fqP2nH524Qdo`、评论性 `fbW4NMpwf8ak`）**：印证 P-1 溯源标记（单一来源/时间未证实）有真实显示价值；是否在视图层降权/折叠「重述型」Fact 属产品决策，超出本诊断。
4. **occurredAt 口径**（案例一两处 ⚠、案例二两处缺失）：与 T05 时区修复相关，但本报告只记录现象。
5. 富国银行六家（`67552dbd`）需原文核验后才能定 SAME_STORY 与否——本轮**不下结论**。

**读者侧现状**：在当前库中检索「OKX-ICE 反对」会得到 5 个公开 Story（1 对互链 + 3 个孤立），其中两个是同一轮次的重复拆分——这正是 spec §1 所述「严重重复」在当前真实数据中的存续形态。
