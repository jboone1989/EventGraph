# E-01/E-06 其余 10 篇原文逐说法核验 — 2026-11-01

**身份与方法声明**：本记录由与实施无关的独立核验代理于 2026-11-01 产生。方法：对 2026-10-28 三次运行中尚未通读原文的 10 个候选样本，逐篇抓取原文页面并通读，把 GLM（zhipu `glm-5.3-flash`）输出的每条非空字段拆成单条说法，在原文中定位支撑段落并记录短摘录。抓取经由 AI 辅助网页读取工具（WebFetch）完成，摘录为工具返回的原文引用；对关键判例（工信部行动名称）做了二次定向抓取复核。Decrypt、BIS 两篇在 2026-10-28 审计中已通读，不在本记录范围。历史运行记录文件未做任何改动。

标记：**[直接事实]** 原文明示；**[来源说法]** 原文内明确归因；**[取证]** 元数据时间；**[无法核验]** 原文找不到对应支撑；**[与原文矛盾]** 原文内容与说法不符。`when` 的中文来源日期按页面本地日期（+08:00）核对。

---

## 1. ZH · 中国人民银行 · 贷款投向统计报告（vrs0pg，首跑 #21521）

- 原文：https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/2026102815121914211/index.html
- 可达性：2026-11-01 抓取成功，正文为静态文本逐段可读。
- 页面日期（原文照抄）：「2026-10-28 17:00:33」；URL 含 `20261028`。运行记录 feed 时间 `2026-10-27T16:00:00.000Z` = 北京时间 2026-10-28 00:00。
- 通读：完成（正文 10 段＋注释，覆盖总体、企事业单位、工业/服务业、普惠小微、绿色、涉农、房地产、科创、住户）。

| 说法 | 判定 | 原文位置 | 短摘录 |
| --- | --- | --- | --- |
| who：中国人民银行（发布方） | 直接事实 | 标题/正文 | 「2026年三季度金融机构贷款投向统计报告」 |
| what：发布 2026 年三季度贷款投向统计报告 | 直接事实 | 标题 | 同上 |
| what：三季度末各项贷款余额 283.44 万亿元 | 直接事实 | 第 1 段 | 「各项贷款余额283.44万亿元」 |
| what：同比增长 4.8% | 直接事实 | 第 1 段 | 「同比增长4.8%」 |
| what：前三季度增加 11.52 万亿元 | 直接事实 | 第 1 段 | 「前三季度增加11.52万亿元」 |
| when：2026 年三季度末数据 | 直接事实 | 第 1 段 | 「三季度末」 |
| when：「报告于2026-10-27发布」 | **与原文矛盾** | 页面日期栏/URL | 「2026-10-28 17:00:33」；URL「20261028」 |
| soWhat：覆盖绿色、房地产及科创领域贷款等结构性投向 | 直接事实 | 第 5/7/8 段 | 「绿色贷款…余额49.22万亿元」「房地产贷款…50.08万亿元」「科创企业贷款…4.27万亿元」 |
| soWhat：可据此观察金融资源在不同领域的流向 | 直接事实（合理概括） | 第 5–8 段结构 | 分项投向逐段列数 |
| soWhat：「具体分项数据需以原文报告为准」 | 诚实限定（输入范围元表述） | — | — |
| watchpoint 1：待关注报告正文中的分项数据与同比变化 | 备注：非矛盾 | 第 5/7/8 段 | 分项数据原文已载；watchpoint 系摘要输入下的滞后表述，非捏造；date=null 合规 |
| watchpoint 2：待关注四季度报告 | 合理外推（未来事件，季度序列合理外推） | — | —；date=null 合规 |

**已知失败确认**：`when` 的 UTC 日历日 `2026-10-27` 与原文页面日期 `2026-10-28` 不符，原文核验证实审计判定。其余数字全部逐字对上。

## 2. ZH · PANews · 资本开支（lhoyy，复测 #21532）

- 原文：https://www.panewslab.com/zh/articles/01a1804b-2523-72c4-908a-4bc570e74a09
- 可达性：2026-11-01 抓取成功，正文完整可读。
- 页面日期：结构化 `datePublished=2026-10-28T02:23:21.710Z`，与运行记录一致；页面可见日期元素本次抓取读出「2026/10/26 14:35」（与 dea50 的结构化日期相同，疑为侧栏/列表元素误读，如实记录）。GLM `when=null`，不受影响。
- 通读：完成（正文 32 段，亚马逊/Meta/甲骨文/微软/Alphabet 全覆盖）。

| 说法 | 判定 | 原文位置 | 短摘录 |
| --- | --- | --- | --- |
| who：亚马逊、Meta、甲骨文 | 直接事实 | 标题 | 「亚马逊、Meta、甲骨文的AI投入何时回本」 |
| what：三家大幅增加 AI 数据中心相关资本开支 | 直接事实 | 第 2/8/13/16 段 | 「资金流向AI数据中心」；各家资本开支逐段列数 |
| what：利润表增长与自由现金流转负背离 | 直接事实 | 第 1/13/16 段 | 亚马逊「净利润1350亿…自由现金流−76亿」；Meta「上市以来首次单季为负」；甲骨文「自由现金流负237亿」 |

其余字段 null、watchpoints=[]：原文含大量增量数字（1350 亿/-76 亿等），模型保守未取，审计「错过可用增量、非捏造」结论经原文确认。

## 3. ZH · 国家统计局 · 工业企业利润（tckhl，复测 #21533）

- 原文：https://www.stats.gov.cn/sj/zxfb/202610/t20261027_1965697.html
- 可达性：2026-11-01 抓取成功，正文完整可读。
- 页面日期（原文照抄）：「2026/10/27 09:30」，与 feed `2026-10-27T01:30:01Z`＋8h 一致。
- 通读：完成（正文 10 段＋三张数据表）。

| 说法 | 判定 | 原文位置 | 短摘录 |
| --- | --- | --- | --- |
| who：国家统计局 | 直接事实 | 标题/正文 | 发布机构 |
| what：发布 2026 年 1—9 月规上工业企业利润数据 | 直接事实 | 标题 | 「1—9月份…利润增长15.5%」 |
| what：利润总额 60337.4 亿元 | 直接事实 | 第 1 段 | 「实现利润总额60337.4亿元」 |
| what：同比增长 15.5% | 直接事实 | 标题+第 1 段 | 「同比增长15.5%」 |
| what：营业收入利润率 5.68% | 直接事实 | 第 5 段 | 「营业收入利润率5.68%」 |
| what：同比提高 0.44 个百分点 | 直接事实 | 第 5 段 | 「同比提高0.44个百分点」 |
| when：2026 年 1—9 月（发布于发布时间所示日期） | 直接事实＋取证 | 标题/页面日期 | 数据期间与页面日期均一致；措辞含糊但无错误 |
| where：全国 | 直接事实 | 第 1 段 | 「全国规模以上工业企业」 |
| soWhat：前九月利润两位数增长 | 直接事实 | 标题 | 15.5% |
| soWhat：利润率同比提高→盈利改善不仅来自规模扩张 | 有数字支撑的引申 | 第 5 段 | 0.44pp；审计已标注「轻度引申」 |
| soWhat：「行业分化…本篇可见材料中未展开」 | 输入范围元表述，不判矛盾 | 第 3/4 段 | 原文实际有分行业数据（电子+103.8%、汽车-22.8% 等），模型未见 |
| watchpoints=[] | 合规 | 第 10 段等 | 原文无未来节点（9月单月增速等为已发生数据） |

## 4. ZH · 工信部 · 答记者问（i445x，首跑 #21524）

- 原文：https://www.miit.gov.cn/xwfb/gxdt/sjdt/art/2026/art_34e6e8e918bd424482287fc02a5cbffd.html
- 可达性：2026-11-01 两次抓取成功，正文完整可读。
- 页面时间栏（原文照抄）：「发布时间：2026-10-20 14:30 来源：中国网、国新网、工信微报」，与 feed `2026-10-20T00:00:00Z` 同日。
- 通读：完成（正文 22 段，AI+制造与人形机器人两大主题全覆盖）。

| 说法 | 判定 | 原文位置 | 短摘录 |
| --- | --- | --- | --- |
| who：工信部科技司司长魏巍 | 直接事实 | 第 1 段 | 「工信部科技司司长魏巍」 |
| who：在国新办新闻发布会介绍 | 直接事实 | 第 1 段 | 「国务院新闻办公室举行新闻发布会」 |
| what：「人工智能赋能制造专项行动」进展 | **与原文措辞矛盾（轻）** | 第 2/3 段 | 原文名称《「人工智能+制造」专项行动》；提问原句「深入实施‘人工智能+制造’专项行动」；行动主体行为无误，政策名称走样 |
| what：人形机器人在消费商贸领域的应用部署 | 直接事实 | 标题+第 13–17 段 | 「消费商贸领域应用」 |
| how：20 个行业、1000 余个场景、285 项案例、超 5000 家企业供需对接 | 直接事实（逐字） | 第 4 段 | 「围绕钢铁、汽车、医药等20个行业，凝练1000余个高价值应用场景，发布285项典型应用案例，组织超5000家企业供需对接」 |
| soWhat：2025 年 AI 核心产业规模测算超 1.2 万亿元 | 直接事实 | 第 3 段 | 「超1.2万亿元」 |
| soWhat：规上制造业企业 AI 应用普及率超 30% | 直接事实 | 第 4 段 | 「普及率超30%」 |
| soWhat：「官方首次在该场发布会集中披露」 | 无法核验 | — | 原文无「首次」表述；世界层面新事实断言无支撑 |
| soWhat：可作衡量政策推进节奏的公开基准 | 评论性表述（无新事实断言） | — | — |
| watchpoint：人形机器人落地安排待披露 | 合理；date=null 合规 | 第 13–17 段 | 「300多个重点场景…验证部署」 |

## 5. ZH · 中国证监会 · 先行赔付征求意见（cg5tnf9ii，复测 #21534）

- 原文：https://www.csrc.gov.cn/csrc/c100028/c7665462/content.shtml
- 可达性：2026-11-01 抓取成功，正文完整可读。
- 页面日期（原文照抄）：「日期：2026-10-19 来源：证监会」，与 feed `2026-10-19T00:00:00Z` 一致。
- 通读：完成（正文 3 段）。

| 说法 | 判定 | 原文位置 | 短摘录 |
| --- | --- | --- | --- |
| who：中国证监会 | 直接事实 | 第 1 段 | 「证监会…起草」 |
| what：起草《证券市场先行赔付指导意见》 | 直接事实 | 第 1 段 | 「起草《证券市场先行赔付指导意见》」 |
| what：向社会公开征求意见 | 直接事实 | 第 1 段 | 「现向社会公开征求意见」 |
| what：规范《证券法》第九十三条先行赔付活动 | 直接事实 | 第 1 段 | 「《证券法》第九十三条规定的先行赔付」 |
| why：「来源称目的是…更规范、透明、可预期…快捷化解群体性纠纷」 | 来源说法（归因正确） | 第 1 段 | 「更规范、透明、可预期」 |
| when：2026-10-19（页面日期） | 取证一致 | 页面日期栏 | 「日期：2026-10-19」 |
| soWhat：给出适用主体、实施程序和激励安排 | 直接事实 | 第 2 段 | 「明确先行赔付的适用主体」「规范…主要实施程序」「支持鼓励先行赔付」 |
| soWhat：从法律原则进入细则制定阶段 | 有依据的定性 | 第 1–2 段 | 意见稿针对第九十三条实施细化 |
| soWhat：征求意见稿状态、尚未生效 | 直接事实 | 第 3 段 | 「履行程序后发布实施」 |
| soWhat：最终条文可能调整 | 直接事实 | 第 3 段 | 「根据意见完善」 |
| watchpoint 1：截止日期及反馈渠道待关注 | 原文确无截止日期（核实）；date=null 合规 | 第 3 段 | 页面未给截止日 |
| watchpoint 2：正式稿发布与生效安排 | 合理外推；date=null 合规 | — | — |

## 6. ZH · PANews · Anthropic IPO（dea50，复测 #21535）

- 原文：https://www.panewslab.com/zh/articles/01a1789e-f1e7-74dc-8099-afc131a2dc38
- 可达性：2026-11-01 抓取成功，正文完整可读。
- 页面日期：结构化 `datePublished=2026-10-26T14:35:00.000Z`，与运行记录一致；页面可见日期元素本次读出「2026/10/28 02:23」（与 lhoyy 的结构化日期相关，疑为侧栏元素误读，如实记录）。
- 通读：完成（标题＋要点列表＋收入/算力账本/公司历史/四方身份/治理/定价窗口等段落）。

| 说法 | 判定 | 原文位置 | 短摘录 |
| --- | --- | --- | --- |
| who：Anthropic | 直接事实 | 标题 | 「Anthropic 递交招股书」 |
| what：向美国证券交易委员会公开提交 S-1 注册声明 | 直接事实 | 正文 | 「注册声明处于“尚未生效”状态」；S-1 即 SEC 注册声明（“SEC”字样未在抓取引文中单列） |
| what：拟以代码 ANT 在纳斯达克全球精选市场挂牌 A 类普通股 | 直接事实（逐字） | 正文 | 「拟以“ANT”在纳斯达克全球精选市场发行 A 类普通股」 |
| what：半年收入 162.9 亿美元 | 直接事实 | 收入段 | 「截至2026年6月30日的六个月里…营收162.9亿美元」 |
| what：巨额算力合同 | 直接事实 | 算力账本段 | 「涉及约4,170亿美元的未来最低付款义务」 |
| what：发行股数与价格区间尚未确定 | 直接事实 | 正文 | 「发行股数、价格区间…尚未确定」 |
| when：「2026-10-26 前提交」 | 直接事实（一致） | 提交时间表述 | 「北京时间 10 月 26 日」「美东时间 10 月 26 日」 |
| when：括注「原文正文未提供」 | **与原文矛盾（轻）** | 同上 | 原文正文实际提及 10 月 26 日提交；模型仅有摘要输入，对未读正文下的断言判错（日期结论本身未被反驳） |
| where：美国（拟挂牌纳斯达克全球精选市场） | 直接事实 | 正文 | 同 what |
| soWhat：半年收入增长十三倍 | 直接事实 | 收入段 | 「同比增长约1,304%」（≈13 倍） |
| soWhat：背负四千多亿美元算力合同 | 直接事实 | 算力账本段 | 「约4,170亿美元」 |
| soWhat：公众股仅分享经济收益、投票权有限 | 直接事实（逐字） | 治理段 | 「公众买入 A 类股，分享的是经济收益…影响有限」 |
| soWhat：发行规模与定价未定 | 直接事实 | 正文 | 同 what |
| soWhat：「招股书首次公开的财务数据」「这些数字此前未公开披露」 | 无法核验 | — | 抓取正文未见「首次公开/此前未披露」表述 |
| watchpoint 1：发行股数与价格区间待披露 | 直接事实支撑；date=null 合规 | 正文 | 「都还空着」 |
| watchpoint 2：ANT 挂牌具体日期待关注 | 直接事实支撑；date=null 合规（D-04：月级不填） | 定价窗口段 | 「11 月定价窗口」 |

## 7. EN · TechCrunch · S-1 分析（yiavak，首跑 #21527）

- 原文：https://techcrunch.com/2026/10/27/vcs-will-make-billions-on-anthropics-ipo-but-amazon-is-set-to-make-much-much-more/
- 可达性：2026-11-01 抓取成功，正文完整可读。
- 页面日期（原文照抄）：「6:15 PM PDT · October 27, 2026」；feed `2026-10-28T01:15:28Z`（同一时刻的 UTC 日历日）。
- 通读：完成（正文 11 段）。

| 说法 | 判定 | 原文位置 | 短摘录 |
| --- | --- | --- | --- |
| who：TechCrunch (analysis) | 直接事实 | 全文 | 本篇为 S-1 分析文 |
| who：Anthropic (IPO filer) | 直接事实 | 第 1 段 | 「Anthropic's IPO」 |
| who：Amazon and VC investors (shareholders analyzed) | 直接事实 | 第 1/3 段 | 「Amazon is likely the single largest financial beneficiary」 |
| what：VC investors stand to make billions; Amazon far larger returns | 直接事实 | 第 1/3 段 | 「expected to return billions」 |
| how：based on S-1; equity and debt structure; strategic investors via convertible notes | 直接事实（实质）；「per the site's own description」系模型概括措辞 | 第 4–5 段 | 「Amazon holds convertible notes with $6.2 billion in principal」；「Anthropic's entire debt load」 |
| when：「Published 2026-10-28 (per source timestamp)」 | 取证一致（feed UTC）＋口径备注 | 页面日期 | 页面本地日历日为 October 27（PDT）；同一时刻的两种口径，建议未来 en 输出注明口径 |
| when：「S-1 was filed ahead of a planned Nasdaq listing in November, per the associated event title」 | **与原文矛盾（已知失败确认）** | 全文 | 原文未提及 Nasdaq 或 November listing（定向确认：「The article never mentions Nasdaq or a November listing date」，仅 "goes public"）；依据仅事件标题 |
| soWhat：quantifies VC gains vs Amazon; convertible-note position outweighs traditional venture returns | 直接事实 | 第 3–5 段 | Amazon 可转债 62 亿美元本金、自有申报估值 979 亿美元、最大受益方 |
| soWhat：「rather than reporting filing numbers already covered elsewhere in this event (revenue, losses, compute commitments)」 | 兄弟报道增量表述；本篇确实不含收入/亏损数字（定向确认「No revenue or loss figures are given」）；算力承诺本篇有 | 第 9–10 段 | 「spend at least $110 billion on AWS」「$114 billion in cloud commitments」 |
| watchpoint：「Anthropic's planned Nasdaq listing in November, as stated in the event's framing」 | **与原文矛盾（已知失败确认）** | 全文 | 同 when；虽标注来源为 event framing，仍属事件标题外溢，违反「本篇原文依据」 |

**已知失败确认**：`when` 的 Nasdaq/November 子句与 watchpoint 全文均来自事件标题，本篇原文无对应内容；其余字段（what/how/who/soWhat 主体）经原文逐项核对成立。

## 8. EN · Google DeepMind · Genie 4（fdfs，首跑 #21531）

- 原文：https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/
- 可达性：2026-11-01 抓取成功。
- 页面日期（原文照抄）：「October 27, 2026」（无时间）；feed `2026-10-27T16:01:38Z` 同日。
- 通读：完成（标题＋正文要点＋能力/可用性/伙伴/安全与局限段）。

| 说法 | 判定 | 原文位置 | 短摘录 |
| --- | --- | --- | --- |
| who：Google DeepMind | 直接事实 | 博客署名 | DeepMind 官方博客（作者 Raia Hadsell 等） |
| what：announced Genie 4, described as “a new generation of world simulation” | 直接事实（逐字） | 标题 | 「Genie 4: A new generation of world simulation」 |
| when：Published 2026-10-27 (16:01 UTC) | 直接事实＋取证 | 页面日期 | 「October 27, 2026」；时间部分来自 feed，一致 |
| soWhat：full text not available; only the title confirms… | 输入范围元表述，不判矛盾 | 正文 | 原文实有大量细节（原生多模态、Gemini Omni 锚定、research preview、AI Ultra 渠道等），模型未见，保守 |
| watchpoints=[] | 合规 | — | — |

## 9. EN · AWS ML Blog · MTRL 教程（pzbhx，替换 #21536）

- 原文：https://aws.amazon.com/blogs/machine-learning/multi-turn-reinforcement-learning-on-amazon-sagemaker-ai-a-hands-on-guide/
- 可达性：2026-11-01 抓取成功（正文近训练超参处截断，主体可读）。
- 页面日期（原文照抄）：「23 OCT 2026」；feed `2026-10-23T17:48:54Z` 同日。
- 通读：完成（截断前的全部正文）。

| 说法 | 判定 | 原文位置 | 短摘录 |
| --- | --- | --- | --- |
| who：AWS Machine Learning Blog (publisher) | 直接事实 | 页面 | AWS ML Blog |
| what：hands-on guide on multi-turn RL using Amazon SageMaker AI | 直接事实（逐字） | 标题 | 「Multi-Turn Reinforcement Learning on Amazon SageMaker AI: A hands-on guide」 |
| when：Published 2026-10-23 (per feed timestamp) | 直接事实＋取证 | 页面日期 | 「23 OCT 2026」 |
| soWhat=null、watchpoints=[] | 教程类预期行为（spec §6） | 正文 | how-to 内容（Wordle 环境、GRPO+LoRA、定价等），无新闻式后续节点 |

## 10. EN · Berkeley AI Research · 成像系统（rprp1，替换 #21538）

- 原文：http://bair.berkeley.edu/blog/2026/01/10/information-driven-imaging/
- 可达性：2026-11-01 抓取成功。
- 页面日期（原文照抄）：「Jan 10, 2026」；feed `2026-01-10T09:00:00Z` 一致。
- 通读：完成（标题＋开头各段＋方法/结果要点）。

| 说法 | 判定 | 原文位置 | 短摘录 |
| --- | --- | --- | --- |
| what：research paper from Berkeley AI Research | 直接事实 | 博客 | BAIR 博客文章（作者 Pinkard、Kabuli 等 6 人） |
| what：information-driven approach to designing imaging systems | 直接事实（逐字） | 标题/正文 | 「Information-Driven Design of Imaging Systems」；「direct evaluation and optimization of imaging systems based on their information content」 |
| what：mutual information as a metric evaluated directly from measurement data | 直接事实 | 正文 | 「Mutual information quantifies how much a measurement reduces uncertainty…」；「estimating information directly from measurements」 |
| when=null | 备注（非错误） | 页面日期 | 页面有 Jan 10, 2026 可取证，模型留 null 属保守 |
| soWhat：full paper text was not available… | 输入范围元表述，不判矛盾 | 正文 | 原文有四领域验证/更省内存算力等结果，模型未见，保守 |
| watchpoints=[] | 合规 | — | — |

---

## 汇总

| 样本 | 原文通读 | 矛盾数 | 无法核验数 | 备注 |
| --- | --- | --- | --- | --- |
| ZH 央行 vrs0pg | 完成 | 1（when 日期，已知失败确认） | 0 | watchpoint 1 为摘要输入下的滞后表述，非捏造 |
| ZH PANews lhoyy | 完成 | 0 | 0 | soWhat=null 系保守 |
| ZH 统计局 tckhl | 完成 | 0 | 0 | soWhat 一处轻度引申有数字支撑 |
| ZH 工信部 i445x | 完成 | 1（行动名称，轻） | 1（「首次」） | how 句逐字一致 |
| ZH 证监会 cg5tnf9ii | 完成 | 0 | 0 | — |
| ZH PANews dea50 | 完成 | 1（「原文正文未提供」括注，轻） | 2（「首次公开」「此前未公开披露」） | 日期结论本身与原文一致 |
| EN TechCrunch yiavak | 完成 | 2（when 子句＋watchpoint，已知失败确认） | 0 | 其余字段经原文核对成立 |
| EN DeepMind fdfs | 完成 | 0 | 0 | soWhat 为输入范围声明 |
| EN AWS pzbhx | 完成 | 0 | 0 | 教程类预期行为 |
| EN Berkeley rprp1 | 完成 | 0 | 0 | soWhat 为输入范围声明 |
| **合计** | **10/10 完成** | **5** | **3** | — |

- 矛盾构成：3 处为已知失败的原文确认（央行 `when` 日期；TechCrunch `when` Nasdaq/November 子句与 watchpoint，共 2 条说法）；2 处为本轮新发现的轻微矛盾（工信部行动名称写作「人工智能赋能制造专项行动」，原文为《「人工智能+制造」专项行动》；PANews dea50 的「原文正文未提供」括注与原文全文不符——原文正文提及 10 月 26 日提交）。
- 无法核验构成：工信部「官方首次…集中披露」的「首次」；PANews dea50「招股书首次公开的财务数据」「这些数字此前未公开披露」。
- 机械合规复查：本 10 篇所有 watchpoint `date` 均为 null（D-04 一致）；zh 来源 `when` 中仅央行一处日期口径错误（已知失败），统计局（页面 2026/10/27 09:30）、证监会（页面 2026-10-19）、工信部（页面 2026-10-20）均与页面本地日期一致。

## 与 audit 结论的变化

- **从「未通读原文、未核验」升级**：6 篇→「已核验一致」（PANews lhoyy、统计局、证监会、DeepMind、AWS、Berkeley——全部非空说法在原文定位并比对成立）；2 篇→「已核验、含轻微矛盾」（工信部、PANews dea50）；2 篇→「已知失败经原文核验确认」（央行日期、TechCrunch 事件标题外溢×2）。
- **对 audit 的修正/补充**：① 央行日期失败获得页面日期与 URL 双重原文证据；② TechCrunch 失败获得「原文全文未提及 Nasdaq/November」的定向确认；③ 新增两条轻微矛盾（行动名称、dea50 括注），均不改变 substance 判定但应记入模型输出质量记录；④ en 源（TechCrunch）存在 UTC 与页面当地日历日的口径差（页面 Oct 27 PDT vs feed UTC Oct 28），建议未来 en `when` 标注口径；⑤ PANews 两篇页面可见日期元素在两次抓取中互换出现，结构化 `datePublished` 与运行记录 feed 时间逐篇一致，提醒后续核验不要以页面列表元素为日期证据。
- **E-01/E-06 总体结论不变**：spec §5 要求的「12/12 每条非空说法记录原文位置/短摘录」在本记录后仍未完全闭环——Decrypt、BIS 两篇尚无逐说法段落位置记录；TechCrunch 与央行的失败仍待修复重测；更正/撤稿与全空证据的真实 GLM 样本仍缺；独立人工信息密度/事实/时间泄漏评价仍缺。本记录补齐 10 篇的原文逐说法证据，不构成 E-01/E-06 通过判定。
