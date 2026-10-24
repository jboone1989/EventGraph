# Implementation Plan: AdSense 审核就绪（AdSense Readiness）

**Branch**: `feature/adsense-readiness`（自 `develop` @ `828a319` 切出） | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md) @ `bbae699`（会话内口头批准，2026-10-23）

**Input**: Feature specification from `specs/002-adsense-readiness/spec.md`

## Summary

把站点从「自动聚合、政策页占位、匿名运营」整改到可提交 AdSense 审核：填齐中英政策页与运营者身份（Jianbo Wang / login@livingruntime.com / 2026-10-24），全站页脚挂政策与联系链接，补英文政策页 URL；把「精选自动进索引」改为「编辑策展后才进索引」（复用 `publications.seo_indexed_at`/`seo_excluded_at` 与后台 `setSeoDecision`），加薄页门槛与推荐理由去重；新增原创研究栏目；技术面完成 robots/验证开关/占位符预检。Cloudflare 301/HSTS 与 CMP 是运维动作，仓库只交付文档与检查。

分三个可独立验收的切片（详见 tasks.md）：

- **切片 A（合规与身份，本分支先做）**：政策页内容、contactEmail、关于页、全站页脚、`/en/privacy` `/en/terms`、robots、发布预检（占位词 fail-closed）。
- **切片 B（策展与索引）**：默认不索引 + 按日策展、薄页门槛、sitemap 一致性与 lastmod、推荐理由去重、英文稿同决策。
- **切片 C（原创栏目）**：`modules/research` 模块（页面、存储、收录、结构化数据）+ 首批文章占位。

## Technical Context

**Language/Version**: Node.js 24 直接运行 TypeScript（后端无构建）；前端 React Router v7（rolldown/vite 构建）。

**Primary Dependencies**: `apps/web`（SSR 页面）、`apps/api`（Fastify 公开/后台接口）、`packages/backend`（publication 读层是所有公开出口的唯一来源）、`@aihot/site`（site.ts/pages/brand）、`@aihot/contracts`（adsense 验证契约已存在）。

**Storage**: PostgreSQL 17（`database/migrations/`，编号递增、每文件一条在线可执行语句）；研究栏目表放 `modules/research/migrations/`。

**Testing**: `npm run typecheck`；`DATABASE_URL=postgres://127.0.0.1:5432/<名>_test npm test`；`npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts`；`node scripts/smoke.ts`；`node scripts/adsense-smoke.mjs`（两态）。

**Target Platform**: 生产 VM09 + Cloudflare Tunnel；读者为匿名公开访问。

**Project Type**: web（workspaces 单仓）。

**Constraints**: 读者打开页面不触发模型调用；所有公开出口只经 `packages/backend/src/publication/`；公开内容匿名；安全阀默认关闭；不改 Agent API v1 契约。

**Scale/Scope**: sitemap 约 1,200 URL；策展粒度 = 天（每日约 10–30 条）。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 结论 |
|---|---|
| 1 Search Before Build | 通过：复用 `seo_indexed_at/seo_excluded_at` + `setSeoDecision`（publish.ts:441）+ 后台内容页标记 UI；复用 `CopyPage`/`renderMarkdown` 渲染政策与研究文章；复用 `adsenseVerificationId` 验证契约与 `adsense-smoke.mjs`；英文版复用 edition.ts 的 /en 路由复用机制（routes.ts 里同文件多 id）。无并行系统。 |
| 2 Testable requirements | 通过：spec §4 的 AD-01~18 对应 tasks 的每项验收。 |
| 3 Approved requirement baseline | 通过：spec 冻结于 `bbae699`，实现提交逐条引用。 |
| 4 Minimal implementation | 通过：切片 A/B/C 各一个有界目标；研究栏目做成 `modules/research`（AGENTS.md 规定的站点自有功能位置），不动共享框架。 |
| 5 Truthful evidence | 遵守：分别报告 本地测试 / 构建 / 生产部署；CMP 与 Cloudflare 属运维，标 UNVERIFIED 直到线上确认。 |
| 6 Existing safeguards | 遵守：不动回执/预算熔断；不加第三方脚本；迁移守约（新文件名、单语句、`CONCURRENTLY`）。 |

无违规，无需 Complexity Tracking 豁免。

## Project Structure

### Documentation (this feature)

```text
specs/002-adsense-readiness/
├── spec.md              # 已批准 @ bbae699
├── plan.md              # 本文件
├── research.md          # 设计决策与替代方案
├── data-model.md        # 策展/研究文章/政策页数据
├── contracts/http-surface.md  # 公开 HTTP 面变化
├── quickstart.md        # 本地验证场景
└── tasks.md             # $speckit-tasks 产出
```

### Source Code (repository root)

```text
site/
├── site.ts                    # contactEmail、SEO 策展开关、关于页/页脚文案
├── pages/privacy.md|.en.md    # 填齐运营者/邮箱/日期/版本，删占位
├── pages/terms.md|.en.md      # 同上
├── public/robots.txt          # 显式 Allow AdSense 爬虫
apps/web/app/
├── root.tsx                   # SiteShell 底部全局页脚（隐私/条款/联系）
├── routes.ts                  # /en/privacy、/en/terms、（切片C）research 路由
├── lib/edition.ts             # COUNTERPARTS 增加 /privacy /terms
├── routes/privacy.tsx|terms.tsx  # 英文版 meta/canonical/hreflang
├── routes/about.tsx           # 运营者身份/编辑方针/AI 披露/联系
packages/backend/src/publication/
├── rules.ts                   # isIndexable 策展语义（读 site 配置）
├── sitemap.ts                 # 薄页门槛、lastmod、政策/研究条目
├── detail.ts                  # 事件页可索引判定下发
apps/api/src/routes/
├── static.ts                  # sitemap 组装（如需注入研究条目）
apps/web/app/routes/admin/     # （切片B）按日策展入口
modules/research/              # （切片C）原创研究模块
scripts/
├── adsense-smoke.mjs          # 增加占位词预检
docs/adsense-readiness.md      # 运维项（301/HSTS/CMP/验证）核对说明
```

**Structure Decision**: 沿用现有 workspaces 布局；新增仅 `modules/research/`（切片 C）。

## Complexity Tracking

无 Constitution 违规，不需要豁免条目。
