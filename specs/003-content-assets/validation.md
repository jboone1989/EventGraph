# 终检记录（specs/003-content-assets）

日期：2026-10-24 · 分支 `feature/content-assets`（自 develop `d52f9a2`） · Windows 本机（Node 24.15）

## 检查链

| 检查 | 结果 | 备注 |
|---|---|---|
| `npm run typecheck` | ✅ | 含新增契约字段与页面 |
| `npm run build -w @aihot/web` | ✅ | 模块页面与主题/日报/知识页均参与构建 |
| 全量 `npm test`（全新库 `aihot_content_final_test`） | ✅ 882 通过 / 13 失败 | 11 个为本机环境项（SIGTERM/备份工具/openssl，与既定基线一致）；`feedback`、`news-value` 两个单跑通过（并发负载抖动） |
| `node --test --test-concurrency=2 apps/web/tests/*.test.ts` | ✅ 87/91 | 新增 `content-assets.test.ts`（4）；`admin-performance`、`report-discovery` 共 4 个在并发下抖动，单跑 8/8 通过 |
| `npm run adsense:preflight` | ✅ | 政策页 0 占位、联系邮箱已设；已加入 CI `check` 任务 |
| `node scripts/production-smoke.py`（本地起站） | ✅ 页面级 | 新增占位词、sitemap lastmod、robots 爬虫检查通过；数据类检查（热点/时间线/图谱非空）在空库上按设计失败；`SMOKE_EXPECT_HTTPS=1` 的 301 检查需生产代理，未在本地执行 |
| `npm run curation:report`（空库 + 有数据库） | ✅ | 空库输出 0 行不报错；`--json` 可用 |
| 线上实测（本地站，空库） | ✅ | sitemap 22/22 条带 lastmod 且含 `/knowledge`；`/knowledge` 有服务端文字；`/more` 含 `/research`；`/topics/ai-models` 含主题简报 |

## 验收映射

| ID | 结果 |
|---|---|
| CA-01/02 | ✅ `tests/seo-curation.test.ts`：未策展条目不显示日期，策展后 `curatedAt` 下发；页面行由 `item.tsx`/`story.tsx` 渲染 |
| CA-03 | ✅ 单来源短综述事件 `note=true` 且仍不收录（同一测试） |
| CA-04 | ✅ `content-assets.test.ts`：有手记的日期渲染、无手记不渲染 |
| CA-05 | ✅ 6 个主题配置简报；未配置主题不渲染 |
| CA-06/07 | ✅ `/knowledge` 渲染图谱变化并链回日报；`/knowledge` 进入 sitemap（`discovery-updates` 断言） |
| CA-08 | ✅ `/more` 含研究入口 |
| CA-09 | ✅ CI `check` 任务新增 `npm run adsense:preflight` |
| CA-10/11 | ✅ smoke 新检查、`curation:report` 本地实测 |
| CA-12 | ✅ 3 个新源进入 `sources.json`（52 个），RSS 于 2026-10-24 探测：统计局中/英 500 条、FCA 20 条 |
| CA-13 | 待部署后人工核对（S0，UNVERIFIED） |

## 未验证项

- 生产部署后的实际表现（301 归一、`/knowledge` 变化区块在真实 Graphiti 数据上的渲染）——UNVERIFIED。
- 新信源在真实采集中的条目质量（首次 backfill 8 条限制内）——部署后观察。
