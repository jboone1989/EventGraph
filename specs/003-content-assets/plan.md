# Implementation Plan: 内容资产与知识层增强

**Branch**: `feature/content-assets`（自 develop `d52f9a2`） | **Spec**: [spec.md](./spec.md) @ 本分支首个提交

## 技术路径

| 需求 | 做法 | 涉及 |
|---|---|---|
| 收录归属 | `publications.seo_indexed_at` 进入事件读层（stories.ts）与条目读层（ITEM_COLUMNS）；`StoryDetail.curatedAt`、`SiteItemDetail.curatedAt` 下发；页面显示 | `packages/backend/publication/{stories,items,detail}.ts`、`packages/contracts/src/site.ts`、`apps/web/app/routes/{story,item}.tsx` |
| 快讯标记 | 读层按既有薄页门槛算 `note`（单来源且综述 < `SEO.minSingleSourceDigestChars`），事件页显示「快讯」 | 同上 + `story.tsx` |
| 编辑手记 | `site/editor-notes.ts` 导出日期键文案；`report-detail` 从站点配置读当日手记，`ReportPaper` 新 prop 渲染「编辑手记」；英文仅 `noteEn` | `site/editor-notes.ts`、`site/package.json` exports、`ReportPaper.tsx`、`report-detail.tsx` |
| 主题简报 | `site/topic-briefs.ts` 导出 6 主题、中英文案与更新日期；`topic.tsx` 在头部与列表之间渲染；未配置不显示 | `site/topic-briefs.ts`、`site/package.json`、`topic.tsx` |
| 图谱变化 | `/knowledge` loader 先取最近日报 key，再取 `/api/site/knowledge/daily/:key`，复用 `GraphChanges` 组件；无数据隐藏；中文页入 sitemap | `apps/web/app/routes/knowledge.tsx`、`packages/backend/publication/sitemap.ts` |
| 手机研究入口 | `modules/research/web.tsx` 的 `tools` 增加一行 | `modules/research/web.tsx` |
| 守护检查 | CI check 任务加 preflight；`production-smoke.py` 增占位词/lastmod/robots/301；新增 `scripts/curation-report.ts` | `.github/workflows/check.yml`、`scripts/*`、`package.json` |
| 信源 | 3 个已验证 RSS 写入 `industry/sources.json`（统计局中/英、FCA） | `industry/sources.json`、探测记录 |

## Search Before Build

- 复用 `GraphChanges`（日报既有组件）、`FollowControls`、`KnowledgeAtlas`、`COPY/`页面骨架与 `pageMeta/localized`；实体关注与 Agent 接入页已具备（规格 §2 记录「已验证存在，不改」）。
- 不新增模块：全部落在既有读层/站点配置；编辑手记与主题简报是站点内容（`site/`），不是框架能力。
- 手记渲染放 `ReportPaper` 的新可选 prop，不碰日报生成与修订路径。

## 验证

`npm run typecheck`、`npm test`（新增读层/契约测试）、`npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts`（新增页面测试）、`npm run adsense:preflight`、本地起站跑 `production-smoke.py` 与 `curation:report`。
