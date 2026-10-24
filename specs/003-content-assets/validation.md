# 终检记录（specs/003-content-assets）

日期：2026-10-24 · 分支 `feature/content-assets`（自 develop `d52f9a2`） · Windows 本机（Node 24.15）

> 本记录按独立评审（Claude Code + GLM，2026-10-24）的 CHANGES REQUESTED 修正过：补齐 CA-01/02/03 的页面级测试、CA-05 覆盖全部 6 个主题、补充薄页时钟对齐说明、清理 BOM，并修正过宽的"✅"口径。

## 检查链

| 检查 | 结果 | 备注 |
|---|---|---|
| `npm run typecheck` | ✅ | 含新增契约字段与页面 |
| `npm run build -w @aihot/web` | ✅ | 模块页面与主题/日报/知识页均参与构建 |
| 全量 `npm test`（全新库） | ✅ 882 通过 / 13 失败 | 11 个为本机环境项（SIGTERM/备份工具/openssl，与既定基线一致）；`feedback`、`news-value` 两个单跑通过（并发负载抖动） |
| `node --test --test-concurrency=2 apps/web/tests/*.test.ts` | ✅ | 新增 `content-assets.test.ts`（4）与 `curation-visibility.test.ts`（3）；`admin-performance`、`report-discovery` 在并发下偶发抖动，单跑通过（评审者本机并发 2 跑三文件 12/12） |
| `npm run adsense:preflight` | ✅ | 政策页 0 占位、联系邮箱已设；已加入 CI `check` 任务 |
| `node scripts/production-smoke.py`（本地起站） | ✅ 页面级 | 新增占位词、sitemap lastmod、robots 爬虫检查通过；数据类检查（热点/时间线/图谱非空）在空库上按设计失败；`SMOKE_EXPECT_HTTPS=1` 的 301 检查需生产代理，未在本地执行 |
| `npm run curation:report`（空库） | ✅ | 输出 0 行不报错；`--json` 可用 |
| 线上实测（本地站，空库） | ✅ | sitemap 22/22 条带 lastmod 且含 `/knowledge`；`/knowledge` 有服务端文字；`/more` 含 `/research`；`/topics/ai-models` 含主题简报 |

## 验收映射

| ID | 结果 |
|---|---|
| CA-01/02/03 | ✅ 页面级：`apps/web/tests/curation-visibility.test.ts`（事件页/条目页「编辑策展于」各一正一负；快讯标记 + `noindex` 断言）；DB：`tests/seo-curation.test.ts`（`curatedAt`/`note` 计算） |
| CA-04 | ✅ `content-assets.test.ts`：有手记的日期渲染、无手记不渲染 |
| CA-05 | ✅ 循环断言 6 个配置主题都渲染简报；未配置的 `bitcoin` 不渲染 |
| CA-06/07 | ✅ `/knowledge` 渲染图谱变化并链回日报；`/knowledge` 进入 sitemap（`discovery-updates` 断言） |
| CA-08 | ✅ `/more` 含研究入口 |
| CA-09 | ✅ CI `check` 任务新增 `npm run adsense:preflight`（评审者用 `gh api` 确认该步 success） |
| CA-10/11 | ✅ smoke 新检查、`curation:report` 本地实测 |
| CA-12 | ✅ 3 个新源进入 `sources.json`（52 个）；2026-10-24 探测：统计局中文 500 条、英文 248 条、FCA 20 条（条目数随时间变化） |
| CA-13 | 待部署后人工核对（S0，UNVERIFIED） |

## 评审后续处理（2026-10-24）

- P1-1：补齐 CA-01/02/03 页面级测试（`curation-visibility.test.ts`），并修正本记录原先"以代码存在性当测试证据"的写法。
- P2-1：spec §2.2 补记薄页判定改读 `stories.digest`（与 sitemap 同源），并说明其副作用。
- P2-2：移除 4 个文件的 UTF-8 BOM（`topic.tsx`、`content-assets.test.ts`、`tasks.md`、`discovery-updates.test.ts`）。
- P2-3：主题简报测试改为覆盖全部 6 个配置主题。
- Nit：提交顺序不重写历史（PR 头部自洽）；`tasks.md` CA9 措辞改为实际改动范围（仅 `docs/adsense-readiness.md`）。

## 未验证项

- 生产部署后的实际表现（301 归一、`/knowledge` 变化区块在真实 Graphiti 数据上的渲染）——UNVERIFIED。
- 新信源在真实采集中的条目质量（首次 backfill 8 条限制内）——部署后观察。
- 全量 DB 套件的 13 个本机环境项失败按既定口径记录（CI Backend tests 全绿作为替代证据）。
