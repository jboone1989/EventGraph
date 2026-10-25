# 007 · 动态信源生命周期：发现 → 预检 → 试运行 → 晋升/降级/退场

> 2026-10-25。配套文档：[信源覆盖审计](source-coverage-audit.md)（缺口与候选清单）。本文是该能力的可验收规格；实现按 `plan.md`/`tasks.md` 跟踪（未另立时以本文件验收标准为准）。

## 目标与非目标

**目标**：同一领域内多个重要一手 + 二手来源互补、信源数量没有上限，但每个信源的存废由持续证据决定，而不是人工一次性拍板：

1. 每日轮换扫描尚未覆盖与已覆盖的领域，另为活跃事件保留搜索名额；利用 DeepSeek Search 提出新发行方信源候选（依赖 PR#132）。
2. 发现阶段之后的链路现在就能跑：预检（去重、协议、发布日期、权利）→ 预览（现有 `previewSource`）→ 自动以 **T2 hot_signal** 建源试运行 → 按证据晋升、降级或退场。
3. 官方低频来源（制裁机构、监管公告）**永不因发稿量低被淘汰**；突发事件可带截止时间临时接入特定地域信源，事件平息后自动退场；运营者随时可覆盖任何决定。
4. 不重跑历史数据；不新增 HTML/CSS/Playwright 网页抓取源（`web_list` 仅保留既有遗留信源，不参与本项目自动候选）；不建新基础设施。

**非目标**：不重写采集器与队列（复用 `collectSource`/`fetchSource` 队列/`next_fetch_at` 节律）；不自动删除任何已有信源或文章；不绕过付费回执与预算；不把发现结果当成事实（搜索命中是线索，不是证据）。

## 复用清单（实现不得另造）

| 需要 | 复用 |
|---|---|
| 地址去重 | `sourceIdentity` / `findDuplicateSource`（`packages/backend/src/admin/sources.ts`） |
| 建源 | `createSource`（含审计与重复检查） |
| 试采预览 | `previewSource` / `previewStoredSource` |
| 节律与质量 | `sources/health.ts` 的 rhythm 语义（中位间隔、安静天数）；`fetch_runs`/`articles`/`publications` 指标 |
| 调度 | 现有 `next_fetch_at` + `QUEUES.fetchSource`，不给候选源造新队列 |
| 开关与状态 | `settings` 表键值（`sourceLifecycle.*`），默认禁用 |
| 审计 | `audit()`，actor 为 `system:source-lifecycle` |

## 生命周期状态机

```
discovered → preflight_failed（终态，留档）
          → trial（T2 hot_signal 源已建，attached_source_id）
          → promoted（tier 保持 T2、participation_mode 提为 editorial）
          → demoted（源 enabled=false，留档可复活）
          → retired（试运行结束退场：临时源到期/纯冗余；源保持禁用，候选留档）
rejected（人工或安全原因，任何状态可进）
```

候选记录持久化在 `source_candidates` 表（见迁移 `0113`），`status` 即上述值；每次转换写 `audit_log`。

## 阶段规格

### D · 发现

- 输入：覆盖缺口以及已覆盖主题的每日轮换扫描（避免一家二手来源阻止其他来源进入）、活跃事件分组（近 48h `stories.latest_at` 标题）；`admin/discovery.ts` 每日一跑（`cron.sources.discover`）。
- 执行者：`admin/discovery.ts` 的 DeepSeek 发现（依赖 PR#132 的 `deepseekSearch`，付费走 `deepseek_web` 预算与回执，缺预算/缺凭证当日安全跳过）：每个轮换主题或活跃事件最多一次限定查询，只认两种发布者线索——像 feed 端点的 URL（候选 `rss`，由预览实探验证）或官方域（候选 `json_list` `mode=deepseek_search`，查询 `site:` 限定 + `allowUrlPrefixes`）；博客平台域跳过。去重按候选身份（`sourceIdentity`：RSS 的归一化 URL、DeepSeek 查询+发布者前缀），不按整域——同一发布者可有多个独立 feed。运营者仍可手工登记（`origin.channel = "operator"`）。
- 产出：`DiscoveryCandidate{ origin, kind, name, config, tags, rationale, officialLowFrequency?, expiresAt? }`。`kind` 只允许 `rss|json_list`（`x_search`/`mp_account` 不参与自动生命周期）。**不满足官方RSS/API或DeepSeek模式的URL允许只登记为研究线索，不自动建立网页抓取源（status 仍为 discovered），不写爬虫。**自动候选不分配 T1：一律由试运行从 T2 hot_signal 争取（见 §T）；`officialLowFrequency` 仅能由运营者登记时声明（预检拒绝自动渠道声明，见 §P）；自动事件候选不与 `breaking_event` 的到期退场叠加（事件源必须能退场）。标签保留一手/二手区分，发布者来源记在 `origin.note`。
- 频率：每日一次；settings 键 `sourceLifecycle.discovery`（`{ enabled, maxGaps, maxCandidates }`，默认 `false/6/8`，封顶 20）控制开关与查询成本（每个入选主题一次搜索、每候选首次预览，预览付费查询在 15 分钟回执窗口内复用）。新信源数量不设总量上限：候选凭试运行证据竞争存留。

### P · 预检（纯函数，可单测）

候选必须全部通过，否则 `preflight_failed` 并留档原因：

1. `assertSupportedConfig(kind, config)` 不报不支持键（复用 config-keys 白名单——这同时排除了"站点专用爬虫"配置）。
2. 地址合法：`http(s)`、无凭据、`normalizeUrl` 归一后有 host；r.jina.ai 前缀先剥离（与 `sourceIdentity` 一致）；`deepseek_search` 候选无自有 URL，校验其 `deepseekQuery` 与 `allowUrlPrefixes`（查询 + 前缀即地址）。自动渠道不得声明 `officialLowFrequency=true`（需运营者核实）。
3. 不与现有 `sources` 或其他候选重复（按 `sourceIdentity` + 候选表自身唯一索引）。
4. 首采封顶：`_aihot.initialBackfillLimit` ≤ 8 且 `publishedAfter` 存在且为合法 UTC instant（不重跑历史）。
5. 权利保守：候选建源一律 `site_fulltext=false`、`syndicate_fulltext=false`（只有来源明确允许才由人工打开）。
6. 身份标注不缺省：`tags` 非空；`officialLowFrequency` 或 `origin.channel="breaking_event"` 的候选必须带 `expiresAt`（后者）。

### V · 预览（现有能力，无新代码路径）

预检通过后必须调用现有 `previewSource`（不能仅凭外部给出的 `previewPassed: true` 视作实际联网预览成功）：解析成功、≥1 条带发布日期的条目、无版权声明拒绝迹象（出现 "all rights reserved" 类文本且无明确 feed 许可时不自动晋升，转人工）。预览失败 → `preflight_failed`（原因 `preview`）。

### T · 试运行

- 通过 `createSource` 建源：`tier=T2`、`participation_mode=hot_signal`、`interval_minutes=60`、tags 继承候选、actor=`system:source-lifecycle`。
- 试用期默认 14 天（settings 可调），从建源起算。期间源完全走现有采集/处理链路，无特权、无豁免预算。

### E · 评估与决定（纯函数打分 + 可 dry-run）

试用期满（或满 7 天即可初评）汇总证据并打分，维度与权重（总和 100）：

| 维度 | 权重 | 度量 |
|---|---:|---|
| 独家贡献（去重率） | 30 | 试用期内该源**首发**的 `identity_key` 数占比（`articles` 中同 key 无更早其他源记录） |
| 覆盖增益 | 25 | 候选 tags 中现有启用源未覆盖的标签数（区域/主体多样性） |
| 及时性 | 15 | 带可靠 `published_at` 的条目占比 |
| 可靠性 | 15 | `fetch_runs` 成功率（复用 health.ts 口径，预算等待不算失败） |
| 采选质量 | 10 | 进入 `publications.selected` 的占比 |
| 成本 | 5 | 请求数/条目 的分档 |

**硬规则（先于分数）**：
- `officialLowFrequency` 候选：**任何低发稿量、长安静期都不得导致退场**；只有连续技术失败（health=failing）或人工拒绝才退。它的价值由覆盖增益与独家性证明，与发稿量无关。
- 无任何产出（`ever_output=false`）且试用期满 → `retired`（源禁用）。
- 独家占比 < 20% 且覆盖增益 = 0（纯冗余转载）→ `demoted`。
- 突发事件候选到达 `expiresAt`：若试用期内独家占比 ≥ 20% 转 `promoted`（无截止时间），否则 `retired`（源禁用）。
- 分数 ≥ 70 且独家 ≥ 20% 且预览通过 → `promoted`：`participation_mode` 改 `editorial`（T2 保持，T1 只有人工给）。
- 40 ≤ 分数 < 70 或未满试用期 → 继续试用（每 7 天复评）。
- 分数 < 40 → `demoted`：源 `enabled=false`，候选留档；管理员可复活。

**自动执行门槛**：`settings` 键 `sourceLifecycle.autoPromote`，默认 `{"enabled":false}`。false 时所有评估只产 dry-run 决定（写候选表 `last_decision` + `last_decision_at`，不动源）；true 时晋升/降级/退场自动执行。预览不通过的候选**永远**不自动建源。

### O · 运营覆盖

- 每个决定（含 dry-run）写 `audit_log`（actor=`system:source-lifecycle`，subject=`candidate:<id>`），人工覆盖写覆盖理由。
- 管理员动作优先：人工 `rejected`/人工改源的候选，自动链路不再动它（`status` 或 `manual_hold` 标记）。
- 本 MVP 不做新后台页面：候选表可通过 SQL/现有后台信源列表观察（自动建的源 tags 带 `lifecycle-trial`），后台 UI 属后续 PR。

## 验收标准

1. `npm run typecheck` 通过；develop 不因本 PR 破坏编译。
2. 纯逻辑单测（standalone，无 DB/网络）：预检 6 项规则的接受/拒绝；打分与硬规则（低频保护、冗余降级、到期退场、晋升门槛）各有多用例；dry-run 决定不产生副作用。
3. DB 测试：候选登记 → 与现有源/候选去重（重复被拒并留档）→ 试用证据汇总 SQL 与人工构造的 `articles`/`fetch_runs` 一致 → `autoPromote=false` 时仅记录决定；`=true` 时经 `createSource` 建出 T2 hot_signal 源且审计可见。
4. 默认禁用：不设 settings 键、不跑任何后台任务时，系统行为与 develop 完全一致（无新定时任务注册）。
5. 文档：审计文档明确区分配置/抽查/待测/授权；本 spec 与实现同步提交。

## 分阶段

- **本 PR（MVP）**：候选表 + 预检 + 打分/决定 + dry-run/自动晋升（默认禁用）+ 单测。
- **自动发现（本分支，依赖 PR#132）**：`admin/discovery.ts` 每日跑 DeepSeek Search 发现（`sourceLifecycle.discovery` 默认关），预检前置去重按候选身份同本 PR。
- **后续**：候选后台页、退场源的一键复活。

## MVP code-level safeguards / current implementation boundary (2026-10-25)

- Candidate kinds accepted by the new lifecycle are **RSS or JSON/API only**. Existing legacy `web_list` sources are left as-is but no new traditional HTML/CSS scraper can enter through this automation.
- Discovery output must **not** self-assert protected official status: `officialLowFrequency=true` requires operator verification during this MVP. Future discovery can propose such a flag, but not auto-authorize it.
- Discovery de-duplication is per candidate identity (canonical RSS URL, or DeepSeek query + publisher prefix), never one candidate per whole domain: the same publisher may hold multiple valuable independent feeds.
- Use `previewCandidate(id, actor)` to call the actual existing `previewSource` before an automatic trial. `markPreviewed` remains the manual audit/attestation path for operators; a boolean supplied by an external search result is **not** proof of successful preview.
- Start of trial clamps `publishedAfter` to no earlier than activation time (UTC), preserving future-only acquisition even if candidate discovery used an older window. Thus its first fetch may have zero articles until the next real publication.
- Current score's exclusivity and cost are **proxies** based on source discoveries and items-per-request; real independent fact contribution and DeepSeek spend must be linked before fully automated unattended retirement of important sources. Never cap high-value sources to a fixed top-N.
- **Code implemented in PR #141, not yet activated:** the daily scheduler and `previewCandidate` → `startTrial` orchestration, with optional source trial activation and default-off switches. The candidate management UI and a real paid DeepSeek smoke test are still outstanding; no production activation is claimed. The underlying candidate registry and score decisions are implemented but remain opt-in.

## 外部接口实际限制（2026-10-25 官方文档核对）

DeepSeek Search 的 `query` 允许 1–128 个 Unicode 字符。自动发现必须对长事件标题截断且保留 `site:` 域名限制；候选 preflight 和 provider 均拒绝超长查询。搜索命中失败不应阻断同轮其他领域，也不能阻止已验证候选在打开试运行开关后进入 T2。官方参考：https://api-docs.deepseek.com/guides/search/ 。代码合并、部署和调度开启须分别验收。
