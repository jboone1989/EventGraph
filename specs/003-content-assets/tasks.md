# Tasks: 内容资产与知识层增强

**Input**: `specs/003-content-assets/`（spec @ 本分支首个提交）

- [ ] CA1 收录归属读层：stories.ts 取 `seo_indexed_at` 并算 `curatedAt`/`note`；items.ts 取 `curated_at`；contracts 两个接口加字段；detail.ts 映射
- [ ] CA2 收录归属 UI：story.tsx 显示「编辑策展于」与「快讯」；item.tsx 显示「编辑策展于」；更新 `page-metadata` 与相关夹具
- [ ] CA3 编辑手记：`site/editor-notes.ts` + 导出 + `ReportPaper` prop + `report-detail` 接线 + web 测试
- [ ] CA4 主题简报：`site/topic-briefs.ts` + 导出 + `topic.tsx` 渲染 + web 测试（6 主题）
- [ ] CA5 图谱变化：`knowledge.tsx` loader 组装变化数据 + 渲染 + sitemap 中文 `/knowledge` + 测试
- [ ] CA6 手机研究入口：`modules/research/web.tsx` tools + web 测试
- [ ] CA7 守护：CI preflight；production-smoke 增项；`scripts/curation-report.ts` + npm 脚本
- [ ] CA8 信源：统计局中/英、FCA 写入 sources.json + 探测记录
- [ ] CA9 文档：`docs/adsense-readiness.md`/`deploy.md` 相关说明；`site/changelog.json` 条目
- [ ] CA10 终检：typecheck、web 构建+测试、全量 DB 套件、preflight、production-smoke（本地）、curation:report，记录到 `validation.md`
