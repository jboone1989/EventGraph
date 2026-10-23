# Research：设计决策与替代方案（Phase 0）

依据：规格 §3 FR + 对当前代码的核对（plan.md Constitution Check 第 1 条）。所有决策给出替代方案与不选的理由。

## D1 英文政策页怎么做（FR-005）

- **决策**：复用现有机制——`routes.ts` 为 `privacy.tsx`/`terms.tsx` 增加 `/en/privacy`、`/en/terms` 路由 id（与 `/en/hot` 等同文件复用一致）；`lib/edition.ts` 的 `COUNTERPARTS` 增加两页，使 hreflang 成对；英文页 canonical 指向自身。
- **理由**：英文内容已在 `site/pages/*.en.md`（#84 引入），语言开关机制已存在（root SiteShell 对 `/en` 路径自动切英文）；只缺稳定 URL。
- **替代被拒**：新建独立英文路由文件（重复渲染逻辑）；维持现状靠站内切换（审核者无英文入口，spec AD-04 不过）。

## D2 全站页脚（FR-002/FR-003）

- **决策**：在 `root.tsx` 的 `SiteShell` 主栏 `{children}` 之后渲染一行小字页脚：`隐私说明 · 使用规则 · 联系 login@livingruntime.com`（mailto），文案进 `site.ts`（`SITE.contactEmail` + 新 `SITE.legalLinks` 或直接由组件读 POLICY 名称），英文路径显示英文标签。admin 早返回，天然不带。
- **替代被拒**：逐页加页脚（24+ 个路由重复）；只在首页加（spec 要求所有公开页）。

## D3 策展闸门（FR-006~008）

- **决策**：`site/site.ts` 新增 `SEO.curatedIndexOnly: true`（本站策略：精选不再自动进索引，只有后台标记 `seo_indexed_at` 的页面进）。`rules.isIndexable` 读该配置；后台 `content.tsx` 列表加「当日待策展」过滤与批量确认（新增一个批量端点，复用 `setSeoDecision` 事务与审计）。事件页可索引性从读层下发：其报道中至少 1 条被策展。
- **理由**：`publications.seo_indexed_at/seo_excluded_at`、`setSeoDecision`（publish.ts:441）、admin 内容页单条开关与审计都已存在——只改默认语义，不造新系统。开关放 `site/` 是 AGENTS.md 规定的站点自有配置位。
- **替代被拒**：直接删掉 `selected ||`（隐式翻转，测试与回滚不透明）；另建 review 表（与现有 SEO 决策重复）。

## D4 薄页门槛（FR-009）

- **决策**：事件页可索引条件 = 非单来源 或 AI 综述 ≥100 字（`length(digest) >= 100`，来源数复用 sitemap 已有的 `story_sizes` 计数），叠加 D3 的策展条件；web 端 `story.tsx` 的 noindex 与 sitemap 用同一判定（从 `publication/detail.ts` 下发，单一来源）。
- **替代被拒**：按热度/评分（spec 未定义，拍脑袋）；只改 sitemap 不改页面 robots（两处口径会漂移）。

## D5 推荐理由去重（FR-011）

- **决策**：在发布链路（`publication/publish.ts` 单一收口）对同一发布日已见过的 reason 文本做去重：后到的置空（提示词已允许「材料不足返回空串」，空 reason 的展示已兼容）。
- **替代被拒**：改提示词让模型保证不重（不可控）；首页渲染时过滤（治标，其他出口仍重复）。

## D6 sitemap lastmod 与一致性（FR-010）

- **决策**：stories 用 `st.latest_at`；items 用其发布时间（列表已有）；政策/研究等静态条目用构建时常量或文件的日期字段；`/daily/` 尾斜杠与 `/topics` 双品牌标题的修复 = 部署 #82（已在 develop，随本分支上线）。
- **理由**：此前注释「没有公开修改时钟，猜不如省」针对 items；发布时间即公开修改事实，可作 lastmod。

## D7 原创研究栏目（FR-013~016）

- **决策**：按 AGENTS.md「只有这个站要的功能做成模块」新建 `modules/research/`：自有表（`modules/research/migrations/`，草稿/发布状态、署名、方法、双语字段）、公开页 `/research` 与 `/research/:slug`（经 site/modules 的 MODULES 注册）、后台编辑页、公开读经 `packages/backend/src/publication/` 的模块服务端挂点。
- **风险与兜底**：模块在 publication 读层的挂点以 `docs/architecture.md`「模块」一节为准；实现时若挂点不满足（如 sitemap 注入），允许在引擎侧加最小插口并在 PR 说明——不另建平行读层。
- **替代被拒**：文件式文章（`site/pages/research/*.md`，API 侧 `?raw` 不可用、无草稿流程）；塞进日报系统（混淆两种内容形态）。

## D8 发布预检与运维项（FR-001/017/020/021）

- **决策**：新增 `scripts/adsense-preflight.mjs`：扫描 `site/pages/*.md` 占位词（请填写/请写明/模板/To be filled/State a contact）、断言 `SITE.contactEmail` 非空；接入现有检查链（CI 与部署文档引用）。`deploy-prod.sh` 把 `LRSITE_RELEASE` 映射到 `AIHOT_RELEASE`（修「线上版本不可见」）。Cloudflare 301/HSTS、CMP、`ADSENSE_VERIFICATION_ENABLED` 属运维/账号操作：更新 `docs/adsense-readiness.md` 为可勾选清单，标 UNVERIFIED 直到线上确认。
- **替代被拒**：把占位词检查写进网页运行时（读者无需为此付出请求成本）；在本仓库实现 CMP（Google 认证 CMP 在 AdSense 后台配置）。
