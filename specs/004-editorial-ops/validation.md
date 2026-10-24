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

## 未验证项

- 生产部署后的表现（含 301/308 归一，见 specs/003 validation）——UNVERIFIED。
- FR-004（邮件订阅）/ FR-005（公开频道推送）：仅规格，未实现（需运营者提供 SMTP/机器人凭据与发送策略确认）。
- 日历数据密度：首批仅 FOMC 两个会期；BLS/ECB 日期待运营者核对官方页后补录（宁缺毋滥）。
