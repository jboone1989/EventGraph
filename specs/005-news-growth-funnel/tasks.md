# 005 · Tasks & durable handoff

Status is evidence-backed; editing a file or opening a PR is not equivalent to running tests, merging, development rollout or production release.

## This PR · US1 (P1)

- [x] Research First: inspect actual `develop` code; independent challenge (prior completed Claude), official Google Search Console/Ads policies and open-source alternatives. Evidence: `research.md`.
- [x] Preserve approved product decisions in `spec.md`; link from repository `AGENTS.md` for future sessions.
- [x] Record implementation architecture, scope limits and metrics in `plan.md`.
- [x] Implement actual page-type grouping of current Search Console page data, preserve original totals and Top 10. See `search-page-types.ts`, `search-console-analytics.ts`.
- [x] Add focused unit tests covering normalized URL paths and zero/ambiguous rows. See `tests/search-page-types.standalone.test.ts` (execution requires CI).
- [x] Render grouped statistics in existing admin Analytics only (no new route/dashboard). See `ExternalAnalytics.tsx`.
- [ ] Verify typecheck / tests and PR diff against specs.
- [ ] Submit PR to `develop`, obtain GitHub Check/E2E + independent Claude PR review; merge only if passes.
- [ ] Verify development deployment and existing authenticated admin report, with actual proof. **Production not in scope.**

## Next PR · P0 inventory (first step before Asia UI)

- [ ] Reconcile `industry/sources.json`, current `develop` and live dev/prod sources; locate newly added Asian sources in actual branch/state.
- [ ] Separate `hot_signal`, `editorial`, first-party official notices and country/language claims; collect 7-day publication and event-membership counts.
- [ ] Only then decide whether tags/regions or source translation can add actual value.

## Next PR · US2 content + click paths

- [ ] Choose 10–20 *actual* news URLs with Search Console impressions and compare within a similar cohort.
- [x] Reuse current source citations, `relatedStories` and `GroupSources` to surface incremental facts and one event next-step, only with evidence. Evidence: PR `feat(item): show the report's event as its What Next layer (005 US2)` — `storyContextFor` in `packages/backend/src/publication/stories.ts` reuses the event page's own joins/latest/status; `EventContext` in `apps/web/app/routes/item.tsx` renders it only when the event has >1 report; follow-ups and related events now also render in English; tests in `tests/content-publication.test.ts`. No model calls, no new tables.
- [ ] Validate mobile first-screen, English copy, source rights, item independent canonical and SEO metadata beyond the suite (item canonical/meta untouched; `seo-meta`/`entity-seo` web tests pass; browser check pending the Search Console cohort above).
- [ ] Compare on-site second navigation after introducing changes; do not claim significant CTR improvements with tiny counts.

## Next PR · US3 return reasons

- [ ] Inspect actual first-/repeat-visit cohort data feasibility; never call sessionStorage tab sessions unique returning users.
- [ ] Reuse `Following` + `local-state` to show changed event content since last read if justified.
- [ ] Evaluate RSS/daily as low-cost passive follow-up; email/notifications require user decision and evidence.

## Explicit STOP list

- [ ] (Non-task) Delete or deindex article pages en masse; global canonical to stories; rebuild homepage/news engine/analytics platform; create Asia pages without actual feeds; bulk auto-generate SEO prose; enable advertisements on unreviewed auto-content.

## Resume after a new conversation

Read `AGENTS.md`, `specs/005-news-growth-funnel/{spec,research,plan,tasks}.md` and the latest PR/branch state. Pick the earliest unchecked task with evidence, not assumptions from the prior chat. Keep the existing `feature → develop → main` policy and production release distinct from dev rollout.

## 2026-11-11 SEO / AI 搜索技术审计接力（仅研究与 QA，不创建第二个 Worker 任务）

**当前事实基线**：`develop` HEAD `198ffc7eb712b7469a1e89ef4e6498b61d542303`；PR [#567](https://github.com/jboone1989/EventGraph/pull/567) 是**已合并的 noindex 移除 Spec**，并非完成的实现。旧 US1 的 Search Console 管理后台在本次 `develop` 不存在；上面已完成勾选是 **2026-10-25 的历史实施记录**，不可当作今天部署证据。

### 本次文档 PR（只读研究，唯一交付）

- [x] 对照当前 `develop` 的 SSR、`seo.ts`、`sitemap.ts`、`indexnow.ts`、robots、路由和测试，记录无需重造的能力与真实缺口。
- [x] 核对 Google 官方 Sitemap、News Sitemap、AI 搜索、Article Schema、Indexing API 适用范围与成熟开源工具替代；记录可核实链接。
- [x] 将六维 SEO/AI Search 质量验收矩阵、工具复用决策、修复顺序写入现有 `research.md` 与 `plan.md`；**不修改已批准的 `spec.md`**。
- [ ] 本次 PR 的 GitHub Check/独立 Review 结果按实际状态记录；仅在门禁通过后合入 `develop`。纯文档合并不代表 SEO 修复/部署完成。

### 后续只读核验和缺陷归属（未执行，勿标完成）

- [ ] **P0 / 复用 #567**：等待 `remove-public-noindex-20261111` T001/T002 的唯一实现 PR；按 URL、实际 HTML、X-Robots-Tag、HTTP 状态检查中英文公开路由，不产生第二张 noindex 实现 PR。
- [ ] **P0 / 抓取库存**：受控抽样真实 Sitemap 与 canonical/hreflang、服务端正文及手机内链，核实可被发现、页面去重和错误响应；记录 10–20 条 URL 证据。
- [ ] **P0 / 更新时间**：复现 `sitemap.ts` 为无真实时钟的页面填入构建时间的问题；确定哪些页面需要真实修改时间、哪些应省略 `lastmod`，形成一个独立最小修复的验收测试。复现前不直接修改生产。
- [ ] **P1 / News Sitemap 决策**：核实本站作为新闻内容发布方的适用性、过去 48 小时的真实公开 editorial 项目、原始发布时间、出版名称、中文/英文版本；必要时复用现有 sitemap 数据生产，绝不建第二套采集与索引逻辑。
- [ ] **P1 / IndexNow**：核查当前部署的启用状态、密钥校验文件、发送回执和错误率；已有任务有效则不改，不接入 Google 普通新闻 Indexing API。
- [ ] **P1 / GSC 恢复可观测性**：确认官方 Search Console 是否已授权并能获取近 28 天数据，按页面类型/URL Inspection 抽样。缺权限标 `UNVERIFIED` 并保留官方外链；不恢复已退役的自建后台，也不将 Cloudflare 爬虫次数当作搜索曝光。
- [ ] **P1 / 页面与 JSON-LD**：选定 10–20 个真实新闻及事件 URL，对照可见标题、H1、来源、发布日期、NewsArticle 与面包屑；确认无虚假关联或把无源图谱事实展示为证据。
- [ ] **P2 / AI 搜索验证**：在实际 ChatGPT/Google AI 搜索问题上采集引用 URL 与日期，另记 API/MCP 真实调用；不把搜索爬虫请求等同于引用、付费意愿或访问用户。
- [ ] **P2 / 工具实施门槛**：Unlighthouse 小样本离线审计可以直接使用；仅在发现现有测试无法覆盖的确切缺陷时引入 Lighthouse CI / schema-dts / lychee。不得为一张清单重复增设 CI、定时器、报表和 SaaS。

**合并/验证守则**：一个真实问题对应一个现有 Spec / Issue 与一个实现 PR；`feature → develop → main`；既有 GH-AW Worker、CI、E2E、审核和预览部署证明需逐项独立核实。不能因为本次文档 PR 提交/合并而将以上未执行项目标为完成。
