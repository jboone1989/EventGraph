# AdSense 送审前最小整改（2026-11-11）

**Status:** Owner-approved — 2026-11-11 用户明确要求“按照刚才的 AdSense 审核评估，直接检查 EventGraph 的 GitHub 仓库和部署，按 Spec-first 原则完成申请前的最小整改，沿用现有自动开发与部署流程”。本规格仅落实其已认可的空研究页治理、现有站点预检、过时公开声明与文档纠偏，不授权发布广告或更改用户的内容策略。
**Target:** feature → develop → main；开发验收仅 VM13；生产按原定 main 流程，不触碰 VM09。
**Existing baseline:** `specs/002-adsense-readiness`、PR #88、PR #114、`specs/005-news-growth-funnel`；本规格是当前差异的收敛，不重做原功能。

## 证据 / Search Before Build

- 2026-11-11 公开 https://livingruntime.com/research 仍显示“第一篇研究在准备中”，中文导航持续曝光此空栏目；英文版使用同一个研究模块。
- 公开 `/about`、`/terms` 及英文条款均声称“经人工策展后进入站内收录”；但 PR #114 已移除人工批准作为默认索引前置。需修正可核对的发布声明，不可仅修改内部文档。
- `modules/research/web/routes/research.tsx` 已通过 `/api/research/articles` 读取已公开研究；`modules/research/web.tsx` 给侧栏与“我的”提供入口；`apps/web/app/routes/about.tsx` 有研究入口。保留后台研究管理、数据库和现有数据。
- `scripts/adsense-preflight.mjs` 已检查合规占位符，`scripts/adsense-smoke.mjs` 已检查验证代码开关和 ads.txt，`site/public/robots.txt` 已放行广告爬虫，`site/pages/privacy*.md` 已有验证与未来广告说明。复用这些实现。
- `docs/adsense-readiness.md` 仍把旧的人工策展索引、30 天和 150 页写成申请前置；PR #114 与 `specs/005-news-growth-funnel` 已确定有公开摘要的新闻默认可索引，不把 AdSense 内容质量审查与索引许可混为一谈。
- Google 官方站点审核强调原创价值、实际可达页面、导航体验和政策合规，不存在强制“150 页 / 30 天”门槛：https://support.google.com/adsense/answer/7299563 、https://support.google.com/adsense/answer/12176698 。

## 用户故事与验收

### US1：不把空研究栏目当作已发布作品
1. 当 **0 篇已公开发表的研究** 时，`/research` 与 `/en/research` 保留可打开的历史稳定 URL，但返回 `noindex,follow`；不从 sitemap 推送该空列表页，不显示“研究”导航入口（电脑侧栏、移动端“我的”以及“关于”页可点击入口均一致）。不要删除模块、后台编辑器或研究草稿。空列表可明确解释尚无公开文章，不得虚构文章。
2. 当 **≥1 篇已公开发表的研究** 时，不需要再次改代码/重新构建，现有中文及英文入口恢复可见；列表页恢复正常可索引行为，实际条目依据现有发布规则出现。页面刷新/caching 允许现有 120 秒 TTL；无内容或无英文稿不得伪造。
3. **读取失败为第三种明确状态，采用 fail-closed，不冒充“尚无研究”。** 公开研究 API/数据库失败且不能确认有已发表文章时：桌面侧栏、移动“我的”、关于页的研究入口暂时隐藏；`/research` 与 `/en/research` 直接访问显示“研究暂时无法加载 / Research temporarily unavailable”而非“第一篇准备中”，响应 HTTP 503，带 `noindex,follow`；sitemap 在无法确认已发表内容时排除研究栏目列表页。故障恢复、成功读到至少一篇后按现有缓存 TTL 自动恢复入口与索引；须有明确的服务端错误状态和既有日志，不把错误转换成 articles=[] 或 HTTP 200，也不影响其他公开新闻页。SSR 与 hydration 读取同一状态，不得闪现错误的栏目入口。不要把管理员草稿计入公开数量。
4. 需覆盖桌面与 390px 移动端导航、中文及英文页面、0→1→0 发布态，直接访问空研究路由、公开单篇 URL 以及数据源出错。复用现有 React Router 和模块/缓存机制，不新建队列、模型调用、后台表或独立站点配置开关。若无法用现有数据低成本决定导航显示，先在实现 PR 如实说明成本与设计选择，禁止偷偷每次导航额外请求模型。

### US2：送审文档、公开声明与预检不再误导
5. 修订 `docs/adsense-readiness.md` 中已过时的“代码尚未上线”“隐私模板未填”“每天人工策展 + 30 天 / 150 页为 Google 必需条件”“站点必须固定用 www”之类断言；与实际 `develop`/生产域名和 PR #114 策略一致。区分**已由代码实现**、**需读取运行环境验证**、**用户持真实 ca-pub ID 才能开启验证**。绝不把流量请求量等同真人 PV，不承诺 Google 批准。
6. 复用 `npm run adsense:preflight`、`scripts/adsense-smoke.mjs` 与现有 smoke/CI，为研究空态/索引/入口补针对性回归；核查政策/条款、robots、sitemap、HTTPS 实际发布结果，缺乏证据的检查明确标记“未验证”，不伪造通过。
7. 已上线的关于页与中英文使用规则仍表述“经编辑人工策展后进入站内收录”，但 #114 已实行符合条件的公开新闻默认可索引。按实际能力改为“自动编辑/聚合、部分内容可人工审看，不保证逐篇人工核验”；中英文一致，不修改对外身份、联系方式或版权约定。更新表述时只修正事实，不将自动生成包装成真人审校。
8. AdSense 所有权验证仅在已有真实 publisher ID 时配置；**不**启用 Auto Ads、`adsbygoogle.js`、新广告位或追踪，不提交凭证。实际展示广告后的 Cookie 披露/CMP 另行处理。

## 非目标 / 防回归

- 不新增假研究、自动生成充数文章、不用虚构案例增厚页面。
- 不因为新闻为 AI 摘要而全站 noindex，不恢复人工逐篇策展，不改新闻事件索引或 canonical。
- 不更改生产数据库、队列/模型路由/后台数据、不碰 VM09，不绕过 CI、Spec Review、GLM 独立评审或 GH-AW 的原生 Work Queue。
- 不自动向 Google AdSense 提交审核，不声称审核已经通过。

## 完成定义

- 独立 Spec PR 先经正常 review 合并到 develop；后续由原生 GH-AW Producer 建立唯一任务、Worker 创建唯一实现 PR。
- 实现 PR 固定引用此 Spec 在 develop 的 SHA；typecheck、相关回归、Check/Docker/E2E、独立审核全部实际通过才按现有自动合并策略推进。
- develop 合并后由现有 GHCR 镜像→VM13 自动部署，检查真实预览页面/HTTP 和版本；无预览凭据或环境故障应报告具体阻断，不宣称已部署。
