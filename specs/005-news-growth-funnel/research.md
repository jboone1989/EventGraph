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
