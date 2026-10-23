# Tasks: AdSense 审核就绪（AdSense Readiness）

**Input**: Design documents from `/specs/002-adsense-readiness/`（spec @ `bbae699`，plan @ `8b54b19`）

**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/http-surface.md ✅ quickstart.md ✅

**Tests**: 包含——本特性改的是收录规则、发布链路与页面骨架，属于 AGENTS.md「验证改动涉及的重要行为」的范围；纯文案（政策页正文）不写测试，由 preflight 脚本断言。

**Organization**: 按规格 §2 的四个用户场景分阶段；MVP = Phase 3（US1 合规与身份）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- 路径相对仓库根（本 worktree）

---

## Phase 1: Setup

- [x] T001 工作区安装依赖并跑基线检查：`npm install`；`npm run typecheck`（记录基线结果，后续对照）

## Phase 2: Foundational（阻塞所有故事）

- [x] T002 [P] 新增 `scripts/adsense-preflight.mjs`：扫描 `site/pages/*.md`（中英）占位词（`请填写`、`请写明`、`开源框架自带的模板`、`To be filled`、`State a contact address`、`State which uses you allow`），断言 `SITE.contactEmail` 非空；命中即 exit 1；在 `package.json` scripts 挂 `adsense:preflight`
- [x] T003 [P] `site/site.ts`：`SITE.contactEmail = "login@livingruntime.com"`；新增 `SEO = { curatedIndexOnly: true }` 配置块（US2 消费；含注释说明依据 spec FR-006 与 AdSense「manual review or curation」条款）

## Phase 3: User Story 1 — 合规与身份（P1）🎯 MVP

**Goal**: 审核者打开任意页面都能确认「真实运营、政策完整、可联系」（spec AD-01~AD-04）。
**Independent Test**: `node scripts/adsense-preflight.mjs` 通过；本地起站后 12 类页面页脚三链接齐全；`/en/privacy`、`/en/terms` 200。

- [x] T010 [P] [US1] 重写 `site/pages/privacy.md`：`版本=2026-10-24`、`生效日期=2026-10-24`、`运营主体=Jianbo Wang`、`联系方式=login@livingruntime.com`；删除全部「请填写/请写明」；§5「联系我们」写明邮箱与反馈渠道；§6 AdSense 表述与当前实际（仅验证、未投放）一致
- [x] T011 [P] [US1] 重写 `site/pages/terms.md`：填齐同上四键；删除「这是开源框架自带的模板」；§3「使用本站的数据」写明允许用途（个人阅读、研究、Agent 匿名只读接口按缓存节奏使用）与需授权用途（商业产品、公开转载、批量再分发）
- [x] T012 [P] [US1] 同步 `site/pages/privacy.en.md`、`site/pages/terms.en.md`：intro 去掉 "still require completion/to be finalized"；补 Operator/Contact/Effective 行；英文条款 §3 与中文实际允许范围一致
- [x] T013 [US1] `apps/web/app/routes/about.tsx` + `site/site.ts` ABOUT 文案：新增运营者块（Jianbo Wang · login@livingruntime.com）、内容生产与编辑流程、AI 使用披露、更正与下架流程（链接 /feedback 与 /privacy）
- [x] T014 [US1] `apps/web/app/root.tsx` SiteShell 主栏底部新增全局页脚：`隐私说明 · 使用规则 · 联系 login@livingruntime.com`（mailto；`/en` 路径英文标签）；admin 早返回不受影响；12 类页面人工核对（quickstart 场景 1）
- [x] T015 [US1] 英文政策页地址：`apps/web/app/routes.ts` 增 `en/privacy`、`en/terms` 路由；`apps/web/app/lib/edition.ts` COUNTERPARTS 增两页；`privacy.tsx`/`terms.tsx` 用 `localized()` 输出英文 title/description/canonical + hreflang 成对；`packages/backend/src/publication/sitemap.ts` 静态条目加 `/en/privacy`、`/en/terms`（带 lastmod=构建日或固定日期）
- [x] T016 [US1] 测试：`apps/web/tests` 增页脚渲染断言（政策/联系链接出现在 SSR HTML）；`scripts/adsense-preflight.mjs` 的扫描逻辑加最小单测（或并入现有 standalone 测试，`tests/` 下按现有模式）

## Phase 4: User Story 2 — 策展与索引（P1）

**Goal**: 被索引的每一页都过人工闸门且非薄页（spec AD-05~AD-10）。
**Independent Test**: 未策展条目 `noindex, follow` 且不在 sitemap；后台批量确认后进入；抽 40 事件页无「单来源且综述<100字」。

- [x] T020 [US2] `packages/backend/src/publication/rules.ts` `isIndexable` 消费 `SEO.curatedIndexOnly`：开启时要求 `seo_indexed_at` 非空（selected 不再自动收录）；`publish.ts` 调用点传入配置；更新/新增 `tests/` 单测覆盖两态
- [x] T021 [US2] 事件页门槛：`packages/backend/src/publication/detail.ts` 下发 `storyIndexable`（≥1 条策展报道 且 非单来源-短综述：`报道数≥2 或 length(digest)≥100`）；`apps/web/app/routes/story.tsx` 与 `sitemap.ts` 的 story 查询用同一判定；`tests/` 覆盖单来源短页不收录
- [x] T022 [US2] 后台按日策展：`apps/api/src/routes/admin.ts` 新增批量端点（一次事务内对一组 articleId 调 `setSeoDecision`，走现有审计）；`apps/web/app/routes/admin/content.tsx` 加「当日待策展」过滤 + 整批确认/排除按钮；`content-item.tsx` 文案同步（「精选自动」→「需策展」）
- [x] T023 [US2] 推荐理由去重：`packages/backend/src/publication/publish.ts` 发布时对同一发布日已出现的 reason 文本去重（后到置空）；`tests/` 单测两条同 reason
- [x] T024 [US2] sitemap `lastmod` 补齐：`sitemap.ts` stories 用 `latest_at`、items 用发布时间、静态页用固定日期；断言全量条目含 lastmod 的测试
- [x] T025 [US2] 英文页同决策：`sitemap.ts` 英文条目跟随中文策展状态；`item.tsx`/`story.tsx` 英文版 noindex 与中文判定一致；契约测试证明 Agent v1 输出不变

## Phase 5: User Story 3 — 原创研究栏目（P2）

**Goal**: 站内有署名、有方法、可索引的原创分析（spec AD-11）。
**Independent Test**: `/research` 列表 ≥1 篇已发布；文章页含作者/时间/方法与 `Article` JSON-LD；进 sitemap。

- [ ] T030 [US3] `modules/research/` 模块骨架：module 声明（`site/modules/index.ts` 注册）、`modules/research/migrations/` 建表（data-model §2 字段与状态约束 draft/published/retired）、后台 CRUD 页（草稿/发布/下线，审计）
- [ ] T031 [US3] 公开面：`/research` 列表与 `/research/:slug` 文章页（复用 `CopyPage`/`renderMarkdown` 风格）、`/en/research/:slug`（仅 title_en 非空）、`Article` JSON-LD（author/datePublished/dateModified）、publication 读层集成与 sitemap 条目
- [ ] T032 [US3] `about.tsx` 原创研究块链接 `/research`；由运营者撰写首批 3 篇（本任务产出为栏目与占位草稿，正文内容标注由使用者提供——spec FR-014 送审前完成）

## Phase 6: User Story 4 — 技术就绪（P2）

**Goal**: 三个入口归一、爬虫可抓、验证可开、运维有清单（spec AD-12~AD-17 的代码部分）。
**Independent Test**: `robots.txt` 含两个 AdSense 爬虫 Allow；`adsense-smoke` 两态通过；部署文档清单更新。

- [x] T040 [P] [US4] `site/public/robots.txt`：增 `User-agent: Mediapartners-Google` 与 `User-agent: Google-Display-Ads-Bot` 的空 Disallow 段（contracts/http-surface.md 目标形态）
- [x] T041 [P] [US4] `scripts/deploy-prod.sh`：把 `LRSITE_RELEASE` 映射到应用读取的 `AIHOT_RELEASE`（修「线上版本不可见」，repo-gap-audit §7.8）
- [x] T042 [US4] `docs/adsense-readiness.md` 更新为送审前运维清单：Cloudflare apex/http→https://www 301 + HSTS、CMP（Google Privacy & messaging）、`ADSENSE_VERIFICATION_ENABLED`+ID（含 `production.flags.env.example` 同步与 `--enforce` 说明）、申请节奏；`docs/deploy.md` 交叉引用
- [ ] T043 [US4] 运维执行（人工，非代码）：Cloudflare 规则与 CMP 配置；完成前在 PR/验收中标 UNVERIFIED（constitution 第 5 条）

## Phase 7: Polish & Cross-Cutting

- [ ] T050 全检查链：`npm run typecheck`；`DATABASE_URL=postgres://127.0.0.1:5432/aihot_test npm test`；`npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts`；`node scripts/smoke.ts --base http://localhost:3000`；`node scripts/adsense-smoke.mjs`（默认态）；`node scripts/adsense-preflight.mjs`
- [ ] T051 按 `specs/002-adsense-readiness/quickstart.md` 逐场景核对并记录结果（AD-01~AD-15 中可本地验证项）
- [x] T052 [P] `site/changelog.json` 增加本次读者可见变化条目（政策页补全、页脚联系入口、收录规则调整、研究栏目）；`docs/` 相应更新

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 →（US1 → US2 → US3 → US4 顺序，或 US1/US2 并行——不同文件为主，仅 `sitemap.ts` 在 T015/T021/T024 相遇，需串行）
- US3 依赖 Phase 2 的 site 配置（无 US1/US2 硬依赖，但发布顺序在它们之后，避免一次 PR 混多个有界目标）
- US4 的 T040/T041/T042 可与任何故事并行（[P]）
- T043（运维）阻塞送审，不阻塞代码合并

### Within US1
T010–T012 并行（不同 md 文件）→ T013（about 用到新邮箱）→ T014/T015 并行 → T016 收口测试。

## Implementation Strategy

**MVP = Phase 1+2+3（US1）**：完成后站点即满足 AD-01~AD-04，可独立部署验证。随后按 US2（决定内容面）→ US3（加原创）→ US4（技术收尾）递进；每阶段走一次独立 PR 或分批提交到本分支，合并前跑 T050 全链。

## Notes

- 所有收录语义变化必须在 `tests/` 有先行失败用例（T020/T021/T023/T024/T025）。
- 不改 Agent API v1；不动精选评分；不加第三方脚本；迁移只加不改。
