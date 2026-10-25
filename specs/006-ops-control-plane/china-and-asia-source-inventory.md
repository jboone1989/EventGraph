# 中国与亚洲信源 · 完整工作清单及实测账本

> 2026-10-25，根据此前产品决策与这次用户纠正补齐。**不要再次把四条日韩/印度 RSS 当作“亚洲全部接入完成”。**
> Search First：先查现有 `industry/sources.json`、`scripts/seed.ts`、`admin/sources.ts`、`packages/backend/src/market-spot.ts`，再检索发布者官方目录和成熟 RSS 实现。优先重用 RSS / web_list / json_list / 原有后台 preview，无需独立爬虫/RSSHub/新队列。
> 三个最终目标是 **自然搜索流量 → 新闻页点击和事件深读 → 追踪留存**，AdSense 仅在合规页面投放；Ferro 以后复用 EventGraph 公共数据，不单独造第二套信源。

## 已有、缺失与本轮验证

- **已有**：国家统计局数据发布（中/英）2 条；BOJ、RBI、韩国央行英文、日本 FSA 4 条；Binance/OKX 现货并非新闻源，已有独立 `market-spot.ts` 和事件价格快照，**不要作为假文章重复接入**。
- **本轮新增配置 9 条**：中国新闻网财经、时政、国际、大湾区；量子位 AI；IT之家科技；香港金管局新闻稿；PANews 中文文章和中文快讯。四个中新网、量子位、IT之家、HKMA、PANews 两条都在 **2026-10-25 开发容器通过既有 `previewSource` 实际解析**，分别返回候选 30/30/30/30/10/60/428/100/100。新闻和快讯分开，`hot_signal` 不应当直接冒充原创新闻页。
- **配置 ≠ 运行**：manifest 当前 65 条；2026-10-25 已通过开发环境**现有有审计的 `createSource`** 将新增九源入库（开发总数 49→58），然后通过 `fetchNow` 启动九次真实采集。**九源全部 health=`ok`**，两个 `fetch_runs`/源（新入数下表），累计 **318 条原始文章**。但模型处理/发布与事件事实归组**尚未完成验收**；当次快照 **224 条 `publications.visibility='public'`** 主要来自 `hot_signal`，**0 个 `fact_articles` 关联**，不得将这些统计称为 Google 可索引的新闻或有深度的事件。生产未部署本批信源。
- **去重和成本**：中国新闻网不同栏目可能交叉报道，PANews 与西文报道可能复述同一事件。沿用现有文章规范化 URL、来源归组/证据合并机制；初次每个源最多回填 2 篇。多快讯、泛科技信号先 `hot_signal`，把有限模型预算留给 AI/金融/政策深度。

### P0 · 已通过独立采集解析的信源（本轮 PR）

| 类别 | Source ID | 官方 RSS | 模式 / 特点 |
|---|---|---|---|
| 中国财经 | `rss-cn-chinanews-finance` | https://www.chinanews.com.cn/rss/finance.xml | T2 editorial |
| 中国时政 | `rss-cn-chinanews-china` | https://www.chinanews.com.cn/rss/china.xml | T2 hot_signal |
| 国际政治 | `rss-cn-chinanews-world` | https://www.chinanews.com.cn/rss/world.xml | T2 editorial |
| 大湾区经济 | `rss-cn-chinanews-gba` | https://www.chinanews.com.cn/rss/dwq.xml | T2 hot_signal |
| 中国 AI | `rss-cn-qbitai-ai` | https://www.qbitai.com/feed | T2 editorial |
| 中国科技 | `rss-cn-ithome-tech` | https://www.ithome.com/rss/ | T2 hot_signal |
| 香港监管/货币 | `rss-hkma-press` | https://www.hkma.gov.hk/chi/other-information/rss/rss_press-release.xml | T1 editorial |
| 中文加密行业报道 | `rss-cn-panews-articles` | https://www.panewslab.com/rss.xml?lang=zh&type=NORMAL | T2 editorial |
| 中文加密快讯 | `rss-cn-panews-flashes` | https://www.panewslab.com/rss.xml?lang=zh&type=NEWS | T2 hot_signal |

官方来源导航：[中新网](https://www.chinanews.com/rss/)；[PANews](https://www.panewslab.com/zh/rss)；[香港金管局](https://www.hkma.gov.hk/chi/other-information/rss/rss_press-release.xml)。两个 PANews 不与镜像/第三方聚合 RSS 重复登记。

### 实际开发机抓取收据（2026-10-25）

| ID | 首次 + 第二次 `fetch_runs.new_count` | 文章入库 | `new` 待处理 | `analyzed` | `public` | 事件事实关联 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `rss-cn-chinanews-china` | 2 + 28 | 30 | 0 | 0 | 30 | 0 |
| `rss-cn-chinanews-finance` | 2 + 28 | 30 | 28 | 0 | 2 | 0 |
| `rss-cn-chinanews-gba` | 2 + 28 | 30 | 0 | 0 | 30 | 0 |
| `rss-cn-chinanews-world` | 2 + 28 | 30 | 29 | 0 | 1 | 0 |
| `rss-cn-ithome-tech` | 2 + 58 | 60 | 0 | 0 | 60 | 0 |
| `rss-cn-panews-articles` | 2 + 32 | 34 | 33 | 1 | 1 | 0 |
| `rss-cn-panews-flashes` | 2 + 98 | 100 | 0 | 0 | 100 | 0 |
| `rss-cn-qbitai-ai` | 2 + 0 | 2 | 2 | 0 | 0 | 0 |
| `rss-hkma-press` | 2 + 0 | 2 | 1 | 1 | 1 | 0 |
| **合计** | **318** | **318** | **93** | **2** | **225（不全是可索引新闻）** | **0** |

注：该表为一次性快照，后续状态随 worker 变化；绝不把 `hot_signal` 公开记录算成独立 SEO 文章。第一次仅导入 2 篇，**第二次调用 `fetchNow` 会按 `collect.ts` 设计接纳较新的剩余候选**：`initialBackfillLimit` 并非永久总量上限。对于高频快讯/科技流，后续应核对预算与源频率、必要时设置可验证的发布时间界限，而非任其因“2 条限制”产生错觉。

### P1 · 之前讨论过但尚未接通的**中国权威一手信源**

逐一确认官方数据接口或真实可长期运行的列表选择器，优先接公告/统计/政策而不是网站首页全文。

| 优先级 | 目标 | 计划承接内容 | 当前阻断 |
|---|---|---|---|
| 必选 | 中国人民银行 PBOC | 货币政策、公开市场、利率等官方公告 | 未验证可直接部署的官方 RSS/API；需要 `web_list` 或官方开放接口适配 |
| 必选 | 中国证监会 CSRC | 证券监管、上市/基金/政策公告 | 同上 |
| 高 | 国家统计局数据解读 | 已有“数据发布”以外的官方解读 | 官方公布 RSS `https://www.stats.gov.cn/sj/sjjd/rss.xml`，但本轮抓取超时，需从开发机真实预览后决定启用 |
| 高 | 发改委 NDRC、财政部 MOF、商务部 MOFCOM | 宏观、产业、对外贸易/制裁相关政策 | 需要官方列表可解析性验证 |
| 高 | 工信部 MIIT、科技部 MOST | AI、半导体、先进制造、技术标准与政策 | 工信部已有官方 RSS 入口页，但需提取真实源 URL 并通过预览 |
| 高 | 上海证券交易所、深交所、港交所、香港证监会 | 交易监管/上市规则/重大公告 | 官方公告列表或 RSS / API 要分别核实，港交所有官方 RSS 目录 |
| 高 | 国务院、海关总署、外汇局 | 重大政策、贸易与汇率统计 | 先找权威渠道，禁止把政策首页作为正文 |

### P2 · 中国财经、科技及加密媒体广覆盖（必须验证可用性和内容价值）

- 财新、第一财经、界面、金十数据、财联社、证券时报、经济观察网、新华社、人民网、中国经济网：优先正式授权 RSS/API 或其官网可公开解析的 `web_list`。当前**不等于已接入**。财新付费内容只展示标题/摘要和原文链接，遵循现有 `site_fulltext=false`。不拿第三方未经授权“全文代理”绕过付费墙。
- AI/产业：机器之心、新智元、智东西、36氪、AI 企业官方动态（智谱、DeepSeek、阿里通义、百度、腾讯等），官网或官方 GitHub release 优先；机器之心旧 RSS 已被第三方标记无响应；36氪官方确有 RSS，但本轮采集环境返回人机验证页，**不得当已成功接入**。
- 中文加密：BlockBeats（官方 [RSS-v2](https://github.com/BlockBeatsOfficial/RSS-v2)）；官方文档地址 `https://api.theblockbeats.news/v2/rss/article`、`.../newsflash` 本轮在开发机均返回 **HTTP 404**，**未接入**。另核查 Odaily、金色财经等稳定来源。PANews 已作为第一批覆盖。
- 证据反例：经济观察网金融 RSS 可访问却大部分停留在 **2011**，新华社旧国际 RSS 可访问却停留在 **2022-12**，中新网东盟商贸 RSS 停留在 **2026-03**，不应以 HTTP 200 充当“持续新闻源”。
- 亚洲其余：日本 METI、韩国/新加坡宏观金融以及东南亚监管与媒体，先验证已有 BOJ、BOK、RBI、日本 FSA 的实际抓取，再补能持续产出高价值事件的来源。

## 业务验收（下一批不可遗漏）

1. **source completeness**：清晰列出候选、config、enabled、实际最后成功抓取、最近 7 天发现量、有效出版量、事件归组量、失败原因。不要把没有 RSS 的网站当成没有价值的来源。
2. **模型优先**：开发环境 7 个阶段此前指向 NVIDIA，付费 GLM 虽配置并未实际接管；这是消化新闻的真实 P0。必须先处理过期校验和阶段路由，才扩大正式采集。模型回执/配额不能绕开。
3. **后台 UI**：未完成 390/1440 实际浏览器视觉验收、页面取舍与真数据库模型切换，不得标为已完成。信源页可使用现有健康/数量/日志，避免堆新 Dashboard。
4. **搜索/AdSense**：新闻 URL 独立可索引（PR #114），事件作深读，不随意 canonical 到事件。不同来源事实以证据对照创造增量，不能只批量翻译摘要。
5. **生产**：按既定 `develop → main` 发布；必须另外核实 `seed.ts` 的增量插入，PR/镜像通过不算生产启用，原来被后台手动修改的信源不能被 seed 覆盖。

## 本轮结论

用户明确要求此前的中国/亚洲信源、运营后台/GLM 积压和产品增长改动一并纳入后续工作；本文件是**覆盖矩阵**，不是对全部信源或所有页面完成开发的虚假声明。后续 Agent 先检查这里未打勾的条目，并从实际证据补齐。
