# 终检记录（specs/004-editorial-ops，第一片：FR-001/002/003）

日期：2026-10-24 · 分支 `feature/editorial-ops`（自 develop `eb8705a`） · Windows 本机（Node 24.15）

## 检查链

| 检查 | 结果 | 备注 |
|---|---|---|
| `npm run typecheck` | ✅ | 含新契约字段、admin 页、日历页 |
| `npm run build -w @aihot/web` | ✅ | |
| `node --test --test-concurrency=1 apps/web/tests/*.test.ts` | ✅ **98/98** | 新增 `calendar.test.ts`（3）；`curation-visibility` 改造（302 断言）；`content-assets` 手记改走接口字段 |
| DB（editor-notes / seo-curation / discovery-updates） | ✅ **10/10** | 迁移 0112 自动应用（90 个）；种子幂等两跑 |
| BOM 扫描（PR 全部改动文件） | ✅ 0 个 | 沿用 PR #100 评审标准 |
| 本地起站实测（3100/3101，空库） | ✅ | 见下 |

## 本地起站实测

- `/calendar` 200：标题、订阅链接、FOMC 两条目渲染；`/en/calendar` 200：英文标题（`&amp;` 转义正确）与条目、meta title `Policy &amp; data calendar · EventGraph`
- `/calendar.ics` 经 web 代理 200，`text/calendar; charset=utf-8`，631 字节，`BEGIN:VCALENDAR` / 稳定 UID / `DTSTART;VALUE=DATE`（http-policy 的 api-owned 清单已加该路径）
- `/sitemap.xml`：`/calendar` 在列，24/24 条带 lastmod
- `/admin/notes` 未登录 302 → `/api/auth/login?return=%2Fadmin%2Fnotes`（EO-02 的实际证据）
- `production-smoke.py`：新页 `/calendar` 与 `/calendar.ics` 检查通过；剩余 3 个失败为空库数据检查（既有设计）

## 验收映射（specs/004）

| ID | 结果 | 证据 |
|---|---|---|
| EO-01 | ✅ | DB：saveNote→loadReport 携带（含 noteEn 置空）；web：content-assets 手记两态渲染 |
| EO-02 | ✅ | 未登录 302（实测）；adminHandler 为全部后台路由共用守卫；写操作审计（editor-notes 测试断言 `notes.save`/actor） |
| EO-03 | ✅ | editor-notes 测试：种子插入 + 管理员修改后二次种子不覆盖 |
| EO-04 | ✅ | calendar.test：中英两版、条目、订阅链接 |
| EO-05 | ✅ | calendar.test：text/calendar、BEGIN:VCALENDAR、UID 唯一、转义；实测真实 api 路由 |
| EO-06 | ✅ | discovery-updates 断言 + 实测 sitemap 24/24 lastmod |
| EO-07 | ✅ | curation-visibility：快讯 302 → `/items/:id`；普通事件 200 不转 |
| EO-08 | 待发布前人工核对（S0） | 桌面/手机侧栏与「我的」入口 |
| EO-09 | ✅ | 本 PR 无 SMTP/Telegram/飞书 相关代码与占位环境变量 |

## 行为变化声明（沿 PR #100 评审要求）

- 快讯事件页从「渲染 + noindex + 快讯标记」改为 **302 转发到唯一报道的条目页**（specs/004 §2.3 取代 specs/003 FR-003 的页面表现；`StoryDetail.note` 保留用于判定）。
- 日报手记数据源从 `site/editor-notes.ts` 改为 `editor_notes` 表（文件降级为一次性种子，`ON CONFLICT DO NOTHING` 不覆盖后台）。
- 侧栏新增引擎「更多」组（日历）；研究模块的侧栏条目并入同组（`sidebar()` 合并逻辑同步调整，研究条目仍在、顺序不变）。
- `/calendar.ics` 加入 api-owned 路径清单（web 代理直达 api）。

## 评审后修复（2026-10-24）

- **e2e 水合不匹配（React #418）**：首版 `sidebar()` 把模块条目 push 进共享的 `更多` 段对象，重复调用累加（服务端 1 份、客户端水合 2 份）。已改为纯函数（每次构建新对象），本地连续 3 次请求侧栏 `/research`×1、`/calendar`×1，e2e 复跑全绿（`beb52dc`）。

## 评审后修复（2026-10-24，第二轮：PR #102 使用者 Review 四项）

1. **迁移与部署**：`deploy-image.sh` 的一致性检查拒绝带未执行迁移的镜像是既有保护；0112 与手记种子走标准顺序（备份→停服→`migrate.ts`→`seed.ts`→启动），已写入 `docs/deploy.md` 更新说明（「编辑手记入库」条目）。
2. **手记缓存**：日报 detail/latest 页缓存对 daily 从 3600/600 收紧到 **120 秒**（与 api `s-maxage=120` 一致）；新增断言 `max-age ≤ 120`（content-assets）。
3. **EIA 事实**：节奏文案改为「石油通常周三、天然气库存通常周四（美东 10:30，节假日顺延）」，中英同步；测试断言两个星期名都出现。
4. **后台默认日期**：`new Date().toISOString()`（UTC）改为 `beijingDate(Date.now())`，北京时间 0–8 点不再默认到前一天。

## 未验证项

- 生产部署后的表现（含 301/308 归一，见 specs/003 validation）——UNVERIFIED。
- FR-004（邮件订阅）/ FR-005（公开频道推送）：仅规格，未实现（需运营者提供 SMTP/机器人凭据与发送策略确认）。
- 日历数据密度：首批仅 FOMC 两个会期；BLS/ECB 日期待运营者核对官方页后补录（宁缺毋滥）。
