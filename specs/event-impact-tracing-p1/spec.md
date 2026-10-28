# EventGraph · 地区冲突影响追踪 · P1 最小产品薄切片 Spec（草案）

> **状态：DRAFT（2026-10-28，Pi 独立起草）。未经 Owner 批准，不授权任何实现。**
> 上游：Issue #176 T07；规划基线 [spec.md](./spec.md) v0.1（blob 于 `80088dc`，2026-10-25 保存，自身注明"不等于授权开发"）；T06 证据结论 [audit-2026-10-27.md](./audit-2026-10-27.md) / [validation.md](./validation.md)（PR #181，develop `176d88c`）。
> 研究依据（只读核对 + 外部调研，2026-10-28）：[p1-research-2026-10-28.md](./p1-research-2026-10-28.md)。
> 本文件若获批准，以包含批准版的完整 Git commit SHA + 文件路径作为实现 PR 的引用锚；blob SHA 仅用于内容核对。未批准前它只是草案。

## 1. 目标与非目标

T07 原文：*"尽量复用 StoryRoute/Explorer/facts/Graphiti/市场数据，先做有证据的层级关系类型与 source drawer，不重建图库；known/valid 双时间、负例、双语和 390px 真浏览器验收。只有 T06 证据可行才做。"*

T06 已给出可做性判定：现有投影（`stories/facts/publications` + `story-route` + `market_snapshots` + PR #134 工作台）足够承载"有证据的线索 + 无证据层的诚实空态"。**P1 补的是三件现有实现确实缺的东西**：证据类型词汇、事实站（fact station）的类型化一跳投影、站级来源证据抽屉。除此之外一律不做。

**非目标（红线，继承 spec.md §三/§五并收紧）**：

1. 不建第二套图谱、不建影响边表、不加数据库迁移、不回填任何历史数据。
2. 不接入任何新数据源（能源/运价/股票指标属 P2，须另行准入评估）。
3. 不产生任何模型调用；页面渲染不触发模型调用（AGENTS.md 既有规则）。
4. **不渲染任何跨层因果边**：P1 里任何两个层之间不出现箭头/连线/连线语义；跨层"链"只能以"断链说明"文案出现。
5. Graphiti 的泛化 `RELATES_TO` 不参与影响层类型化，不升格为影响关系（保持现状，只在"关系"标签页内按既有方式展示）。
6. 不虚构企业暴露、市场归因、政策生效状态；无证据即空态。

## 2. 证据类型词汇表（封闭集合）

spec.md §三要求影响链至少区分五类。P1 只**渲染**现有投影可确定性派生的三类，其余两类显式留空并标注"当前数据不可派生"。词汇表封闭：任何渲染项的类型必须取自下表，集合外类型在类型层即不可能（contracts 类型 + 单测双锁）。

| spec §三 的类 | P1 类型 `evidenceKind` | 数据来源（全部现有） | 派生规则 |
| --- | --- | --- | --- |
| 可验证事实 | `fact_station` | StoryRoute station（现有公开证据链；P1 只读补充 `facts` 结构化主体/动作/客体） | 后端 `publicStoryRoute` 已产出站点；P1 补字段并增加确定性层归类（§3） |
| 来源明确声称的关系 | `related_reporting` | PR #134 关键词线索（route 内公开报道） | 现有 `impactLeadsAt`，语义不变：阅读线索，永不类型化为边 |
| 仅观测到的市场变化 | `market_observation` | `market_snapshots`（现仅 5 个加密资产） | 现有 `marketObservationAt`，并排展示不归因，语义不变 |
| 客观暴露或依赖 | ——不渲染—— | 无可派生数据 | 恒为空态文案："当前数据无法核实企业暴露或供应依赖" |
| 分析假设 | ——禁止—— | 无来源 | 永不自动生成；任何带"假设"性质的推断不得进入渲染层 |

## 3. 一跳投影：事实站 → 层（纯派生，零写入）

对 `publicStoryRoute` 返回的每个 station，用**纯函数**确定性归类到一个层。当前 station 仅暴露 `title`，并未暴露数据库中的 `subject/action/object`。P1 因此须在现有同一条公开查询中只读选取这三个 `facts` 字段，并在 `StoryRouteStation` 契约中增加同名 `string | null` 字段；不新增查询、抽取、持久化或跨故事拉取。归类输入为这三个字段与现有 `title`，词典复用 PR #134。结构化字段缺失时，不得用标题共现代替动作守护：冲突/企业动作分类均不命中，其余词典只作阅读线索分组；全部不中则归入 `unclassified`。

| 层 | 归类依据（确定性） | 显示语义（对齐 CAMEO verbal/material 之分，见 research §4.5） |
| --- | --- | --- |
| `conflict_event` | 结构化 `action` 命中冲突事件词（触雷/爆炸/袭击/交火/击沉/伤亡/开火/炮击）；优先于其他层 | 按主体/动作原样显示，含"单方主张"旗标（若 singleSource） |
| `policy_statement` | station 命中政策词典（制裁/关税/出口管制/…） | 标签为**"机构表态/政策相关陈述"**——是言语行为（verbal act），不是政策生效状态 |
| `logistics_observation` | station 命中航运/港口/海峡/供应链词典 | 航运与物流事实/观察 |
| `company_disclosure` | station 命中企业披露词典（停产/停工/财报披露/…） | 仅当事实文本本身为披露陈述 |
| `unclassified` | 以上皆不中时的唯一默认层 | 不强行归类；显示为普通事实站 |

**多词典命中优先级（必须确定性）**：`conflict_event`（结构化冲突动作）→ `policy_statement` → `company_disclosure` → `logistics_observation` → `unclassified`（默认）。同一 station 只能属于一个层，不能由实现遍历顺序决定。`company_disclosure` 还须结构化动作明确描述披露/停产/停工，不得仅因文本共现公司名称而命中。T0 的 action 含“触雷爆炸”，即使 object 含“油轮”，也必须优先落在 `conflict_event`；“关税影响航运”的非冲突动作按 `policy_statement` 优先于物流。关键词只决定阅读分组，不推断关系。

**政策阶段诚实规则（P1 的反伪造核心）**：`policy_statement` 站**永不**显示"拟议/宣布/生效/撤销"阶段标签，除非其证据文本自带明确日期的阶段词且该日期可从证据链接核到——现有产品内不存在这种数据（T06 §4.1），因此 P1 实现中该分支恒为"阶段不可核验"状态。此规则用负例测试锁定（N4）。

**关键词归类的已知局限（写进 UI 文案与文档）**：词典命中只决定"这条事实在哪个层被阅读"，不构成层间关系；错分可能性存在（如"警告关税休战"是表态不是政策），因此层标签一律用"线索/陈述"措辞，绝不用"影响/导致/生效"。

## 4. 站级来源证据抽屉（source drawer）

复用既有 `RelationEvidence` 抽屉模式（谓词 + validAt/invalidAt/recordedAt + 来源轨迹），为每个 station 与每条 `related_reporting` 线索提供可展开抽屉，内容**全部来自现有投影字段**，无新数据：

- 原文链接（来源名 + URL，`source_open` 埋点）、本站 `/items/:id` 入口；
- 修订版本号：现有 `revision: null` 表示首版（revision 1），显示“原版 / Original”；revision>1 显示具体版本及“现为修订版”，不因 null 隐藏首版证据；
- 三个时间：occurred（stated）/ published（valid 侧）/ discovered（known 侧），随当前时钟高亮解释；
- 不确定性旗标：`singleSource`、`revised`、`occurredAtMissing`（story-route 已返回）；
- `evidenceKind` 标签（§2 词汇表）与"有界重建"警示（既有文案）。

抽屉在 390px 与桌面均为展开/收起交互，不产生横向溢出（`expectNoOverflow`）。手机端沿用既有四个标签页导航，抽屉在"影响线索"与"来源"页均可达。

## 5. 用户可见行为（验收以真实部署站为准）

在真实霍尔木兹事件（story `3d1ae73d`，T06 T0 样本）页面上：

1. 现有事实站列表增加层标签和站级证据抽屉：1 站（IRGC 宣布两艘超级油轮触雷），层=conflict_event，展开抽屉可见中新网原文链接、revision、10-22/10-23/10-25 三时间与 singleSource 旗标。
2. 影响线索四面板：物流层 1 条 dated lead；政策、企业、市场三面板为诚实空态（现有文案），新增企业层空态文案点明"客观暴露不可派生"。
3. known/valid 双时钟（现有 EventTimeMachine）：`known@2026-10-24T12:00Z` 全部线索为 0；`known@10-25T02:00Z` 出现物流 lead；`valid@10-24T12:00Z` 该 lead 已可见（audit §3 表的页面级复现）。
4. 关系标签页（Graphiti）保持现状，不获得任何影响类型化。
5. 中英文一致；390px 无标签重叠、无横向溢出。

在存在政策类事实站的真实事件（如 USTR 关税表态 story `7bdc9a83`，见 research §3.4）上：政策层出现 `policy_statement` 站，标签为"机构表态"，无任何阶段标签，抽屉内为 USTR 官方来源 + France24 各自修订版本。

## 6. 验收标准（全部可证伪；每条注明证明方式）

| # | 验收 | 证明方式 |
| --- | --- | --- |
| AC-1 | 渲染项类型封闭：影响工作台每个渲染项的 `evidenceKind` ∈ {`fact_station`,`related_reporting`,`market_observation`}；"暴露/假设"两类只允许以空态文案出现 | contracts 类型 + 单测断言穷举 |
| AC-2 | 零无来源渲染：每个 station/lead 展开后必有 http(s) 原文链接、published（valid）及 discovered（known）时间；`revision=null` 明确显示“原版 / Original”，revision>1 显示具体版本，绝不因首版 revision=null 隐藏证据。occurred 可缺失，但必须展示 `occurredAtMissing` / “仅报道时间”旗标，不得伪造发生时间。仅缺原文链接或 published/discovered 必需时间时不渲染该报道；站点仅在无可显示报道时隐藏 | 单测 + 真实页面抽查（含首版 null revision、occurred=null、缺 published 报道负例） |
| AC-3 | 零跨层边：全部影响视图（双时钟、双语言、双宽度）不出现层间箭头/连线；跨层关系只能以"断链"文案存在 | e2e（zh+en × 390/1440）DOM 断言 |
| AC-4 | 政策阶段诚实：`policy_statement` 站无"拟议/宣布/生效/撤销"标签（除非证据自带可核日期，当前恒无） | 单测 N4 + 真实 USTR 页面 |
| AC-5 | 负例 N1 企业共现：真实共现文章文本（公司名+冲突词、无披露）不产生任何 company 层站或边 | 单测（fixture 取自真实文章文本） |
| AC-6 | 负例 N2 市场共现：DEV"$117"类数字共现不进入 market_observation | 单测（现有测试扩展） |
| AC-7 | 负例 N3 时间穿越：known@10-24T12:00Z→0 线索；valid@同刻→1 条物流 lead | 单测 + 真实页面滑块操作 |
| AC-8 | 图谱隔离：Graphiti 不可用/降级时影响工作台照常渲染（route-only）；图谱正常时其关系不获类型化 | e2e 注入降级 + DOM 断言 |
| AC-9 | 双语与移动端：zh/en、390px/1440px 全部视图真实浏览器通过；抽屉开合无横向溢出、无标签重叠 | e2e（补 zh 变体，T06 validation 明确留给 P1） |
| AC-10 | 只读约束实现侧不变：仅在现有 story-route 查询/契约中增加 `subject/action/object` 可空字段，继承原公开过滤且不新增查询；无迁移、无新表、无回填、无模型调用；缺结构化动作时不得用 title 共现触发冲突/企业分类；`npm run typecheck` + 既有测试全绿 | 后端契约/公开过滤回归 + 纯函数负例 + PR diff 审查 + CI |

**停止条件（继承 spec §六并具体化）**：若实现中发现任何验收需"补一条数据"才能通过——即现有数据不支持本 Spec 的渲染——停止实现，回到证据层（修采集/归组/抽取），不造假数据、不放宽断言。

## 7. 测试计划（与 AC 对应）

1. **纯函数单测**（新增，纯前端，无 DB）：层归类函数（含 §3 全部五层 + 重叠优先级/T0 冲突动作/关税航运错分边界样例）；词汇封闭断言；政策阶段规则 N4；企业共现 N1（fixture 用真实文章文本，含 T06 §6.1 的 Mercuria 背景案例改写）；数字共现 N2；known/valid 截断 N3（扩展现有 `impact-evidence.test.ts` 模式，全部先红后绿）。
2. **e2e**（Playwright，真实部署站）：`/explore?story=<T0 真实 publicId>` zh+en × 390+1440：站列表渲染、抽屉开合、滑块 known/valid 三时点断言（AC-3/7/9）、图谱降级注入（AC-8）。沿用 `e2e/impact-evidence.spec.ts` 既有结构。
3. **只读 DB 复核脚本**（文档化 SQL，不进 CI）：T0 站/证据行、USTR 站证据行、gCaptain 两稿归组状态——供任意审查者复跑。
4. **明确不测**：样式微调、词典枚举完备性（开放集，按需增词）。

## 8. 实现边界预估（供批准后拆任务，非本草案内容）

预计改动集中在：`packages/contracts`（StoryRoute station 的可空 `subject/action/object` 字段 + `evidenceKind`）、`packages/backend/src/publication/story-route.ts`（现有同一 SQL 的 SELECT/行映射只读补字段，保留公开过滤与合并解析）、`apps/web`（层归类纯函数 + 现有站列表的类型标签/抽屉增强 + 文案）、`docs/event-explorer.md`、上述测试。不新增查询、不加迁移、不动 worker。必须补后端字段透传/撤稿过滤回归；这是批准后才可实施的边界。单 PR、遵循 feature→develop。

## 9. 未决事项（需 Owner 决定）

1. 本草案是否批准为 T07 实现 Spec（批准后以完整 commit SHA + 文件路径锚定）。
2. 站级抽屉放在"影响线索"标签页内还是独立"事实站"标签页（§5 按"影响线索页内 + 来源页可达"写，可调）。
3. `unclassified` 站是否在影响工作台显示（本草案：显示为普通事实站，因为隐藏会让"本事件自身事实"在 T0 样本上不可见）。
4. e2e 对真实故事的依赖：若部署环境 T0 故事不可用，是否接受 seeded fixture 作为降级验收（本草案倾向：真实页优先，fixture 仅补充）。
