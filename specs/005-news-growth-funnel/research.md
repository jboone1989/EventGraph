# 005 · Research First 证据与替代方案

> 核验日期：2026-10-25；范围：EventGraph develop 实际代码、此前现场 DB 只读采样、Google 官方文档、成熟开源实现。先搜已有实现与反例，再制定最小变更；本文件是可持续的研究账本而非虚构市场数据。

## 现有能力（复用）

| 已有实现 | 位置 | 结论 |
| --- | --- | --- |
| Search Console 官方 API/服务账号、30 完整日期、独立总量查询、Top 10 查询词/页面 | `packages/backend/src/admin/search-console-analytics.ts` | 扩展**现有** page 查询/类型聚合即可；不要再建分析平台 |
| 搜索报表展示 | `apps/web/app/features/admin/ExternalAnalytics.tsx`、`/admin/analytics` | 直接显示页面类型与候选着陆页 |
| 站内行为追踪 | `packages/backend/src/admin/analytics.ts`、`docs/analytics.md` | 有 session/page_type/content_id，已统计打开文章/事件、证据点击；目前同一标签页 session 不等于 UV 或跨天复访 |
| 新闻页 | `apps/web/app/routes/item.tsx` | 已有原文引用、推荐理由、事件入口、相关事件、主题、分享/收藏；P2 应优化现有区域，不另造模块 |
| 事件页 | `apps/web/app/routes/story.tsx` | 已有时间线、事件综述、热度/来源；与文章页意图不同，不全站互设 canonical |
| 关注/已读 | `apps/web/app/features/home/Following.tsx`、`apps/web/app/lib/local-state.ts` | 已有本地主题/实体关注和已读 ID，未有跨设备账号/推送 |
| 新闻策略 | PR #114, `packages/backend/src/publication/rules.ts`、`packages/backend/src/publication/sitemap.ts` | public editorial + summary 默认 indexable；保留手动排除/撤回，不退回 curationOnly |
| 页面入口 | `apps/web/app/routes/feed-layout.tsx` | 首页有 LeadStory、精选、关注切换和每日卡，不从头设计 |
| 内容信源 | `industry/sources.json` / `sources` 表 | 配置 52，2026-10-24 开发与生产 DB 各 49；不能推断其他分支最新状态 |

## 官方外部依据（优先一手）

1. [Google Search: Helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — 引用外部新闻需要提供真正增量，不是只换词重写；AI 使用本身不直接构成违规，重点在价值和目的。
2. [Search Console Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) — 官方支持 `page`、`query`、`date` 等维度，受匿名化/返回行限制；总量和前 N 行**不可直接相加**。
3. [Google title link](https://developers.google.com/search/docs/appearance/title-link) — Google 参考 `title`、H1、内链锚文本等生成搜索标题，改 meta 不保证 Google 照搬。
4. [Google canonical documentation](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) — 仅适合重复/近重复 URL；一篇独立新闻与聚合事件页不能仅因同主题就统一 canonical。
5. [Google Publisher Policies: Low value](https://support.google.com/publisherpolicies/answer/11112688?hl=en) 和 [Replicated content](https://support.google.com/publisherpolicies/answer/11190248?hl=en) — 低价值内容及未经人工审核/策展的自动生成内容不应放广告。搜索允许索引 ≠ Google 广告资格。

## 外部开源思路（明确不复制）

- [Miniflux API](https://miniflux.app/docs/api.html) 已具备 RSS 分类、已读/未读和日期筛选；但 EventGraph `local-state`、`Following` 和站内新闻页已有此类能力：**不引入 Miniflux** 或另建阅读器，仅借鉴增量阅读/时间窗口的交互逻辑。
- [GDELT 2.0](https://gdeltproject.org/data.html) 提供跨语言事件与 Knowledge Graph，是反例/参考：它的数据处理规模、地区抽取和事件归组可供理解，但 EventGraph 已有 Graphiti+事件层，**不部署第二个知识图谱引擎**。

## Claude 反方意见与结论（2026-10-24 原生 Claude 独立只读审查）

- **接受**：新闻页纯摘要的增量价值可能较低；索引资格不是排名保障；首页已有事件主卡，此刻大改 ROI 不明；本机 Follow 不能自动证明留存；亚洲信源库存和实际贡献尚不明确；AdSense 投放资格独立于 Search 索引。
- **驳回（Claude 后续明确撤回）**：未掌握查询层 Search Console 数据就把新闻页批量 `noindex`；把所有新闻 canonical 至事件；断言二者一定关键词蚕食；把所有 AI 翻译/摘要直接定性为违规；继续按已移除的英文“两报道收录门槛”方案工作。
- **保留争议为实验**：文章与事件两种页面谁更能带来自然搜索曝光？以当前 GSC 类型/URL 基线、相近内容/排名比较，而非靠猜测。
- **证据局限**：Claude 只读本地 Git ref 过旧，未看到 #114 squash `601911aa`；以上过时认识已在第二次对话中修正。官方条款应优先于旧内部 `specs/002-adsense-readiness` 的历史解读。

## 预案之外的风险/判断

- 不能从生产近 7 天约 7,881 采集推导 7,881 条可阅读 editorial 新闻：其中 DEV AI 的 6,295 是 `hot_signal`；真正的新增亚洲 feed 先对账。
- GSC API 只返回排前面的页面、受匿名化及 `rowLimit` 影响。类型聚合应明确是**返回样本**，不能与另行查询的全部站点总量混淆。
- 两周流量样本可能低到无法比较 CTR 统计显著性；先做有方向性的“有效页面数、曝光、阅读二跳”，避免假 KPI。

## 2026-11-11 增量复核：SEO / AI Search，Search Before Build

> 本节是 **2026-11-11 `develop` 代码与 GitHub PR 的新快照**；上面的 2026-10-25 记录是历史证据，不代表功能仍在当前分支。此增量研究不修改已批准的 `spec.md` 产品决策，也不视为某功能已部署。

### 已有能力与真实状态（优先复用）

| 当前证据 | 结论 / 下一步 |
| --- | --- |
| `apps/web/app/lib/seo.ts`：`pageMeta`、`localized`、Organization / Dataset / Article / Breadcrumb JSON-LD | 已有 title/description/canonical/OG/hreflang/JSON-LD 工具；只做 SSR 输出、事实一致性、中文英文和版本检查，不另装 SEO Meta 管理包 |
| `apps/web/react-router.config.ts`：`ssr: true`；`apps/web/app/routes/{item,story,explore,knowledge-entity}.tsx` | 已有 SSR、详情页与图谱；检查爬虫看到的完整 HTML、正文、真实超链接及移动端；不新建静态预渲染系统 |
| `packages/backend/src/publication/sitemap.ts` | 已有 45,000 URL 上限和五分钟缓存；含 story/item/report/topic 索引门槛及中英文 URL。**发现真实风险**：没有可靠 `lastmod` 的静态/集合页用 sitemap 生成时间填充，可能误报重大修改。保留既有 URL 来源，校正更新语义与质量后再考虑 News Sitemap |
| `packages/backend/src/operations/indexnow.ts` 和 `packages/backend/src/config.ts` | 已实现变更指纹和 IndexNow 提交；`INDEXNOW_SUBMIT_ENABLED` 默认关闭。先核查部署开关、密钥验证和提交回执；**不要第二套通知器**，不要把 IndexNow 当 Google 索引 API |
| `site/public/robots.txt` | 包含 Sitemap、私有/后台 API 的 Disallow；没有 `Disallow: /explore`。搜寻身份由爬虫验证与实际 HTTP 响应确认，不仅依据 user-agent 字符串 |
| `apps/web/tests/{seo-meta,entity-seo}.test.ts`、`tests/{seo-curation,topic-seo.standalone}.test.ts` | 已有验证基线。扩展已有测试，不单独建 SEO 测试框架 |
| PR [#567](https://github.com/jboone1989/EventGraph/pull/567) 合并 develop（2026-11-11） | **仅为已批准的 noindex 移除 Spec，非实现**；尚不能宣称线上 noindex 已被移除。后续 T001/T002 归属 `specs/remove-public-noindex-20261111`，本 005 不重复建任务 |
| PR [#115](https://github.com/jboone1989/EventGraph/pull/115) 曾提供 Search Console 页面类型数据，但 `develop` 中已无 `search-console-analytics.ts`、`ExternalAnalytics.tsx`、`/admin/analytics`；PR [#448](https://github.com/jboone1989/EventGraph/pull/448)、[#486](https://github.com/jboone1989/EventGraph/pull/486) 涉及分析入口退役 | 2026-10-25 的“已有 GSC 后台”叙述 **已过期**。先确认 Google Search Console 仍有权限与可用数据；只调用官方只读 API / 已连接的分析服务，不恢复旧后台或自建统计服务 |
| Cloudflare 2026-11-10 16:00 至 11-11 16:00（北京时间）的请求抽样 | `/explore` 3,949、`/en/explore` 2,827 次请求，Googlebot（自报 UA）总计 294；这是 **HTTP 请求，不是搜索曝光/收录/UV**。需结合 GSC URL Inspection 和 Performance 才能判断真实搜索瓶颈 |

### 官方规范（已核对的原始资料）

1. [Google AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)：AI Overviews/AI Mode 的网页基础仍是常规索引资格、可抓取正文、内链和页面质量；**不需要**额外 AI 专属文件或伪造 schema，也不保证抓取/引用。
2. [Google Sitemap 指南](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)：`lastmod` 应对应真正的重要修改；Google 忽略 `changefreq`、`priority`。缺乏可靠内容时钟则不要伪造当前时间。Sitemap 是发现提示，不是索引保证。
3. [Google News Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap)：如采用新闻 Sitemap，只收最近两天**真实符合条件的新闻文章**，须包含合法 News 元数据；可独立建一份或在现有 sitemap 上扩展，非所有 RSS/热点信号都可冒充新闻。
4. [Google Article 结构化数据](https://developers.google.com/search/docs/appearance/structured-data/article)、[结构化数据规范](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)：保留已有 `NewsArticle`，重点核对发布/修改日期、作者/发布者身份、图像与**可见正文**的事实一致；不要为虚假的 FAQ/评分造数据。
5. [Google 抓取诊断](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors)：检查真实日志、HTML 链接、移动端内链、HTTP 状态；正常网站当天发文不等于当天收录。
6. [Google Indexing API](https://developers.google.com/search/apis/indexing-api/v3/using-api) 仅适用于 JobPosting 或特定 BroadcastEvent 视频，**不可**用来提交 EventGraph 普通新闻。
7. [OpenAI 搜索爬虫说明](https://platform.openai.com/docs/bots)：区分 OAI-SearchBot 与 GPTBot；抓取许可与真实搜索引用是不同指标。
8. [Google Search Console Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)：点击、展示、CTR、平均排名与页面/查询维度需区分，API 存在匿名化、行数和时间滞后。URL Inspection 逐条核实样本，不从样本推断全站收录比例。

### 成熟组件替代方案（不自动增加依赖）

| 需求 | 首选现成方案 | 是否立即引入 |
| --- | --- | --- |
| 公共页面 SEO/性能抽样 | [Unlighthouse](https://github.com/harlan-zw/unlighthouse)：站点爬行、抽样 Lighthouse 报告 | **可选一次性审计**；先控制页面数/请求速率，不在每次 PR 中对生产全站扫描 |
| PR 关键路由性能回归 | [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) | 只有在现有 E2E 无法覆盖且发现可复现性能回归时，才加最少代表路由；不启用第二套 CI |
| JSON-LD 类型约束 | [schema-dts](https://github.com/google/schema-dts) | 现有 `seo.ts` 已输出 schema；先修真实校验缺口，不为装包而装包 |
| 失效链接 | [lychee](https://github.com/lycheeverse/lychee) | 优先现有页面/E2E 检查内部锚链；外站新闻源会短时 403/429，不得直接作为 PR 阻断 |
| Sitemap、IndexNow | **现有项目实现**；若确需格式/分片能力，再评估 [sitemap.js](https://github.com/ekalinin/sitemap.js) | **不替换**已运行的库存、缓存和提交任务 |
| 关键词、索引、排名 | Google Search Console 官方工具；OpenSEO 等可选只读接入 | 不造排名抓取器/自建 GSC dashboard；收费工具只在现有报告不足且预算同意后引入 |

### 尚未验证，不能声明已解决

- 现网真实 HTML 是否仍有 `noindex` / `X-Robots-Tag`、Google 选择的 canonical、索引覆盖率、Google News 资格、GSC 最近 28 天搜索词及曝光；需要生产 URL 抽样、GSC 权限和时间窗口证明。
- IndexNow 部署密钥/开关和 Bing 成功接收；静态代码存在不代表服务启用。
- AI 搜索是否实际引用 EventGraph：爬虫抓取或 UA 数量不是引用或商业价值证据。
- 不得因 URL 数量、Sitemap URL 数、Cloudflare 请求数推断搜索流量、广告资格、增长效果。
