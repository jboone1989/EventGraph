# Implementation Plan: 编辑运营能力

**Branch**: `feature/editorial-ops`（自 develop `eb8705a`） | **Spec**: [spec.md](./spec.md)

| 需求 | 做法 | 涉及 |
|---|---|---|
| 手记后台 | 引擎表 `editor_notes`（迁移 0112）；`packages/backend/src/admin/notes.ts`（list/save+审计）；`loadReport` 为 daily 附 `editorNote`；admin API + `admin/notes.tsx`；种子把 `site/editor-notes.ts` 存量入库 | `database/migrations/0112_editor_notes.sql`、`admin/notes.ts`、`publication/reports.ts`、`contracts/site.ts`、`apps/api/src/routes/admin.ts`、`apps/web/app/routes/admin/notes.tsx`、`scripts/seed.ts` |
| 日历 | `site/calendar.ts` 数据 + `/calendar`/`/en/calendar` 页 + `/calendar.ics`（static.ts `sendTextWithEtag`）+ sitemap 静态条目（数据哈希）+ 侧栏「更多」入口 | `site/calendar.ts`、`site/package.json`、`apps/web/app/routes/calendar.tsx`、`routes.ts`、`edition.ts`、`publication/sitemap.ts`、`routes/static.ts`、`components/shell/nav.ts` |
| 快讯收敛 | `story.tsx` loader：`note && reportCount===1` → 302 `/items/:id`（英文 `/en/items/:id`）；移除快讯 Badge 与旧断言 | `apps/web/app/routes/story.tsx`、web 测试 |

## Search Before Build

- 手记表/后台复用 research 模块与 `admin/content.ts` 的既有模式（审计写法、`adminHandler`、admin 页表单骨架）；不新建并行机制。
- `/calendar.ics` 复用 `sendTextWithEtag`（feeds/sitemap 同款）；iCal 内容为纯文本生成，无依赖。
- 侧栏入口走 `nav.ts` 引擎清单（labelEn 槽位 specs/002 已加）。

## 验证

`npm run typecheck`；`npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts`；DB：新增 `tests/editor-notes.test.ts` + 既有 seo-curation/discovery-updates；`production-smoke` 不动（/calendar 页面级后续加）。
