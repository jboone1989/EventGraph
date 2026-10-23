# 终检记录（T050 / T051）

日期：2026-10-23 深夜 · 分支 `feature/adsense-readiness`（基线 develop `828a319`） · Windows 本机（Node 24.15）

## T050 检查链

| 检查 | 结果 | 备注 |
|---|---|---|
| `npm run typecheck` | ✅ 全绿 | 含新模块 `modules/research`（后端 + web 页面） |
| 全量 `npm test`（全新库 `aihot_final2_test`） | ✅ 894 通过 / 11 失败 | 11 个失败全部为本机环境项，与 develop 基线完全一致（SIGTERM 语义 ×5、备份工具链 ×3、openssl 缺失 ×3，已用「基线分支 + 全新库」双向验证）；含新增 `tests/seo-curation.test.ts`（3）与 `modules/research/tests/research.test.ts`（4） |
| `npm run build -w @aihot/web` + `node --test apps/web/tests/*.test.ts` | ✅ 87/87 | 含新增 `legal-footer.test.ts`（6）与 `research-pages.test.ts`（3）；期间修复两处真实缺陷：页脚英文文案在 /en 的 SSR 泄漏（改为「路径或偏好任一为英文」）、模块侧栏项缺英文标签（给 `NavItem` 加 `labelEn` 通用插口）。full-run 中 `native-video` 出现 1 次时序抖动，单跑通过 |
| `node scripts/smoke.ts --base http://localhost:3000` | ✅ all checks passed | 本地 api(3001)+web(3000) 连全新库 `aihot_smoke_test`，迁移 89 条全部应用（含模块 `0111_research_articles`） |
| `node scripts/adsense-smoke.mjs`（默认关闭态） | ✅ `pass:true` | `/ads.txt` 404、无 meta、无广告脚本 |
| `node scripts/adsense-preflight.mjs` | ✅ OK | 政策页 0 占位词、`contactEmail` 已设 |

## T051 quickstart 场景（本地实测）

| 场景 | 结果 |
|---|---|
| AD-01/02/03 页脚与政策页 | ✅ `/`（及其余抽查页）页脚含「隐私说明 · 使用规则 · 联系 login@livingruntime.com」；privacy/terms 0 占位、含 Jianbo Wang / 邮箱 / 2026-10-24（另由 `legal-footer.test.ts` 6 例自动断言） |
| AD-04 英文政策页 | ✅ `/en/privacy`、`/en/terms` 200（`research-pages`/`legal-footer` 与 curl 实测） |
| AD-05~10 策展与索引 | ✅ `tests/seo-curation.test.ts`：未策展不进 sitemap、批量确认+逐条审计、单来源短综述事件页不收录、同句推荐理由 24h 内去重 |
| AD-09 英文同决策 | ✅ `tests/english-copy.test.ts` 更新后通过（英文页跟随中文策展） |
| AD-11 研究栏目 | ✅ `modules/research` 4 例 + `research-pages.test.ts` 3 例：草稿私有 → 发布进列表/详情/sitemap → 下线退场；页面含署名、方法块、Article 结构化数据；`/en/research` 读英文字段 |
| AD-14 验证两态 | ✅ 关闭态实测 404/无脚本；开启态由 `tests/adsense-setup.standalone.test.ts` 与 `scripts/adsense-smoke.mjs`（`ADSENSE_EXPECTED_ID`）覆盖 |
| AD-15 robots | ✅ 实测含 `Mediapartners-Google`、`Google-Display-Ads-Bot` Allow 段 |
| FR-010 sitemap lastmod | ✅ 空库 21/21 条目全部带 `<lastmod>` |

## 留给运营者（代码外，`docs/adsense-readiness.md` §3）

每日策展（后台 → 内容诊断 → 当日待策展）；首批 ≥3 篇署名研究（`/admin/research` 写作台已就绪）；Cloudflare 301+HSTS；CMP；按 `feature → develop → main` 部署后再到 AdSense 添加站点验证。生产部署与线上核对未做（UNVERIFIED，见宪法第 5 条）。
