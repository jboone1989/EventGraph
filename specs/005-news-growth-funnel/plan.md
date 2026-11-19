# 005 · Implementation plan（Search First → Spec Kit → minimal implementation）

Decision: `spec.md` (2026-10-25) is the approved conversation baseline. Use the already installed official Spec Kit workflow, not a new orchestration framework. Challenge result and alternatives are recorded in `research.md`.

## Reuse-first architectural map

```
Google Search Console API (existing service account)
 └─ packages/backend/src/admin/search-console-analytics.ts
     ├─ independent overall totals (preserve)
     ├─ query/date top rows (preserve)
     └─ page dimension rows → page-type aggregation (US1)
         └─ apps/web/app/features/admin/ExternalAnalytics.tsx (existing UI)

Existing public article (/items/:id)
 ├─ existing source/AI brief/relatedStories
 └─ later: conditional incremental evidence/related event links (US2)
     └─ existing story (/story/:publicId) → topic/follow (US3)
```

## P1 now (smallest code)

1. Parse Search Console's absolute page URLs by pathname (ignore scheme, www vs apex, URL search/query fragments); classify as `news`, `story`, `topic`, `daily`, `other`, including `/en` equivalents.
2. Expand existing **page** query result window from Top 10 to at most 1000 rows using the official API, **retaining the displayed Top 10** and leaving query totals/date logic unchanged. Do not fetch an extra resource. If row count reaches cap show `limited=true`, not “complete”.
3. Aggregate clicks/impressions by type using actual returned rows only. Calculate weighted mean position as `Σ(position × impressions)/Σimpressions`; CTR as clicks / impressions. Ignore malformed/out-of-domain URL rows to avoid contamination (the domain property can include many subdomains). Show row coverage and distinguish sample totals from independent site totals.
4. Show one compact "Google landed where?" table in `ExternalAnalytics` with clicks, impressions, CTR, position, row count and an explicit sampled-data label. Top 10 clickable landing pages remain. Null/error state unchanged.
5. Add isolated tests for parsing/classification/aggregation (no credentials or live Google access). Reuse existing CI, no new migration or dependencies.

**Decision about click-through candidates:** The existing Search Console API sorts by clicks, not by impressions. To avoid falsely calling the click-ranked Top 10 'high impression/low CTR', display type totals first; P1 can sort the already returned up-to-1000 rows by `impressions` when generating `opportunities` but expose that only for authenticated admin and note sample coverage. Do not auto-rewrite any title.

## P0 inventory follow-up (zero code)

Compare `industry/sources.json` with both `sources` tables and any unpublished branch. Output per-source `collected_7d`, `public_editorial_7d`, `story_memberships_7d`, last successful fetch and source health. An Asia region label is not valid until source identity/region/language is independently verified; do not infer story geography from feed name alone. No new columns until demonstrated useful.

## P2 later (independent PR, after P1)

- Inspect `item.tsx` current 'reason', source citation, `relatedStories`, `GroupSources` and mobile layout. Change only proven weak transition and distinct factual information.
- Source-anchored, conditional 'what else happened' first, not another freeform LLM prompt. Respect `site_fulltext=false` rights.
- Select 10–20 *real* high-impression news URLs from P1, compare metadata, actual H1, intro and internal links; keep untouched set as reference. No auto keywords, no sitewide fake FAQ.

## P3 later (independent PR based on evidence)

- Reuse browser follows/read state and public story revision/updatedAt; show 'new developments since visit' only when supported.
- Do not promise 7-day unique returning users from tab-level sessions or invent a push channel.

## Test/release

- Branch `feature/005-news-growth-funnel` from latest `develop`, PR target `develop`. Existing GitHub Check+E2E+Claude independent code review; do not merge to `main` or deploy production.
- Verify live dev rollout separately; GitHub PR CI pass alone is not a successful deployment.
- Final P1 pass: classification tests for `/items`, `/en/items`, `/story`, `/en/story`, `/topics`, `/daily`, unrelated site/URL, zero impressions; admin report when provider unavailable; repeated run consistent; no private search keywords exposed to users.

## Exit criteria / falsification

- No UI duplicating existing analytics, one type summary table in current admin.
- Page-type sample does not sum to independent whole-site total as if exhaustive.
- If Google report has too few rows, mark data insufficient instead of predicting performance; reconsider whether any additional instrumentation is justified before code.

## 2026-11-11 SEO + AI Search 质量审计补充方案（仅计划，不是新产品 Spec）

保留本文件早期 US1 方案作为 **2026-10-25 历史记录**。由于 `/admin/analytics` 和对应 Search Console 组件已从当前 `develop` 移除，**不得依据旧架构重建后台**。本次只延伸现有 `specs/005` 的研究及验收证据，已批准的全站 `noindex` 移除由 [Spec remove-public-noindex](../remove-public-noindex-20261111/spec.md) 独立 T001/T002 处理，避免任务和 PR 重复。

### 先只读审计、后最小修复的执行次序

1. **基线与现场证据**：固定 `develop` HEAD、最新 SEO PR、部署 SHA；按页面类型抽样首页、`/items`、`/en/items`、`/story`、`/en/story`、`/knowledge/entity`、`/topics`、`/daily`、`/explore`（含 `?story=`/`?case=`）、实际非 200 路由。逐条记录 URL、HTML 状态、title/H1/description、canonical、hreflang、JSON-LD、robots meta/header、正文 SSR 和可跟随内链；不从路由字符串推断线上结果。
2. **索引发现**：检查线上 `robots.txt` / `sitemap.xml` 与源代码库存一致、只收合法公开 200 URL、真实 `lastmod`、中英文不误归一。若已确定 `noindex` 移除实现 PR 在途，则复用其测试，不竞争改 `seo.ts` / route meta。
3. **变更通知**：只读检查已有 IndexNow 开关、校验文件与最近回执；默认关闭不可视为 bug。Google 使用 Sitemap / GSC，不接入不适用普通新闻的 Indexing API；是否补充 Google News Sitemap 需先确认新闻资格、发布时间/媒体署名可提供，且已排除重复实现。
4. **页面质量/信息架构**：抽样真实公开新闻、事件和实体，检验事实与原始来源一致，保证 `NewsArticle` 与可见文本一致；从新闻到事件到实体的内链能在服务端 HTML 中出现；手机/桌面可达；未完成的图谱关系不伪造。
5. **真实效果**：GSC 可用时取最近 28 个 **完整** 日期的站点总量、查询和页面样本，标明行数覆盖限制；URL Inspection 选 10–20 条 URL 对照收录/抓取/Google canonical。没有授权则状态为 `UNVERIFIED`，只展示 Cloudflare 的爬虫流量，不能改口称其为曝光。AI 搜索引用按相同问题与时间人工抽样核实页面 URL，不能用 UA 次数替代。
6. **缺陷关闭门禁**：仅对已有证据证明的缺陷，按所属已批准 Spec 走 **一个问题/一个实现 PR**，复用现有 GH-AW、CI、E2E 和 `feature → develop → main`；PR 必须列出复现 URL、预期 HTML/状态、测试、合并与 deploy 回执。不要把本次文档 PR 冒充功能实现或审核通过。

### 六维验收矩阵（以后所有 SEO 相关 PR 复用）

| 维度 | 具体检查 | 拒收条件 |
| --- | --- | --- |
| Crawling / Indexing | 实际 HTML/meta/header、robots、Sitemap、200/301/404/503、canonical、GSC URL Inspection | 公共有效页被禁索引或错误响应伪装成 200；私有页被公开；Sitemap 广告了 404/私有 URL |
| 内容可用性 | title/H1/描述一致、新闻原创信息增量、官方来源链、准确发布日期/修改时间 | 标题误导、LLM 伪造事实、无证据生成 FAQ/比较、虚假 `lastmod` |
| 信息架构 | 服务端正文和真实 `<a href>` 内链；新闻→事件→实体（仅真实关联）、重复/孤儿页 | 只在 JS 客户端出现关键链接或链到不存在页面；新闻全部 canonical 到事件 |
| 结构化数据 | `NewsArticle`、`BreadcrumbList`、`Organization`、`Dataset` 与页面可见内容一致 | 假作者/发布者、错误文章日期、错误图像、标记不可见事实 |
| 中英文/性能 | zh/en canonical + 双向 hreflang、主内容/链接一致、响应时间与移动端 Lighthouse 抽样 | 英文页面 canonical 到错误语言、空页面却返回成功索引信号、严重可复现的移动端问题 |
| 搜索/Agent 效果 | GSC impressions/clicks/CTR/position 与 crawl/index 分开；AI 引用有实际 URL/回答证据；API/MCP 调用单独统计 | 混淆请求、UV、收录、引用、转化；无 GSC 数据却声称 SEO 增长 |

### 工具复用决策

- **第一优先**：当前 React Router SSR、`seo.ts`、`sitemap.ts`、`indexnow.ts`、现有 Web/Node/E2E 测试；官方 GSC 和 Cloudflare。
- **辅助审计**：Unlighthouse 仅针对受控小样本、低并发独立运行；Lighthouse CI 只有验证了现有 CI 不覆盖的真实性能缺陷才考虑加。不要默认引入持续爬取生产网站的任务。
- **结构化数据/断链**：有具体问题才考虑 `schema-dts` / `lychee`；它们不是新框架，更不是必须安装的依赖。外部新闻源 403/429 不应作为无条件失败门禁。
- **止损条件**：若 28 天 GSC 曝光样本不足，不自动生成 SEO 页面或新增收费 SaaS；先判断可索引页数、抓取日志、内容质量，再决定实验。

本节不修改 `spec.md`、不补用户未批准的功能范围、不触发新的自动 Work Item。只有证据确认的独立缺陷才以既有批准 Spec 或新的最小批准 Issue 分派。
