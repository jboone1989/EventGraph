# 模型免费导入：按真实厂商连接选择，保持后台响应式布局

**Status:** Owner-approved scope (2026-11-07 用户明确要求修复三个 Groq 连接的导入选项、反对写死厂商，并提供布局故障截图）；仍须独立 Spec Review 通过及合并后才能恢复实现。
**Target:** develop only. Do not merge to main or deploy production under this Spec.
**Implementation:** Continue existing draft implementation PR #483 only after this Spec has been independently reviewed and merged; never open another implementation PR.

## Problem and evidence

1. 用户在「厂商连接」配置了三个分别命名的 Groq 账户，但原先模型导入区域难以清楚区分每个连接；运营要求三条独立记录都能单独导入，不能按 vendor 去重。
2. 2026-11-07 实际后台截图：页面标题「模型管理」及说明被压缩成一字一行，多个「导入 xxx 免费模型」按钮水平拥挤。标题和主体信息不可正常阅读。
3. `apps/web/app/routes/admin/models.tsx` 把 `loaderData.providers` 展开为每个连接一个按钮，而 `AdminPage` 的 actions 在 `sm:flex-row` 里使用 `shrink-0`，导致多个按钮占据所有横向宽度。
4. 后端 `GET /api/admin/providers` 已返回 `providers` 数组（每条有 `id/name/vendor`）；`POST /api/admin/providers/:id/free-catalog/sync` 和 `.../:id/openrouter-free/sync` 已按 **连接 UUID** 执行。无需新表、迁移、接口或账号合并。
5. `packages/backend/src/providers/registry/free-provider-catalog.ts` 是有约束的已核实免费目录，**不能**把「厂商连接列表动态化」误解为任何未知 vendor 都能免费同步。现有独立连接与 UUID 语义见 `specs/model-instance-identity-routing-20261106/spec.md`。

## User-visible contract

1. 「模型管理」标题、说明、刷新操作与免费导入区域各有明确层次；顶部操作区不会撑满标题。桌面宽度约 1530px、手机宽度 390px，以及两者之间的断点，标题必须横向可读，页面不出现因按钮增长导致的一字一行。
2. 免费模型导入只有**一个导入操作**。用户首先从下拉菜单选择已配置的**某条厂商连接**，再执行「导入所选连接」。导入选项从 `GET /api/admin/providers` 实时加载的 `providers` 生成，而非前端维护账户或厂商实例的硬编码列表。
3. 同一厂商的多个连接绝不能被合并或去重；选择值始终是该连接的 `id`。显示连接名称及厂商，名称重复时也要可以识别两条不同的连接。给现有三个 Groq 连接分别展示选项，并可分别发送到正确的 `/providers/:id/...`。
4. OpenRouter 保留现有免费模型同步流程；受支持的其他免费目录保留原有 `free-catalog/sync` 及套餐确认。不能假装所有任意自定义连接都支持「免费目录」：如所选厂商暂无目录，明确提示「当前连接不支持一键导入，可手动新增模型」，禁用一键导入或提供清晰的不可用状态，而不是发请求再让用户遇到 HTTP 错误。
5. 新增厂商连接后，再进入/刷新模型管理页面，该连接即出现在选择列表中。导入后模型仍属于该连接，保持后台既有的初始禁用、不自动路由、同连接幂等导入规则；不改工作流绑定、模型计费或 API key。
6. 操作结果必须包含实际连接名称与新增/已存在数量；操作失败明确可读。没有连接时禁用导入，并引导用户前往现有「厂商连接」页面。
7. 保留模型列表的分页、筛选、新增、删除、测试与刷新模型功能。不要改变全站其他页面的布局或把修复扩展为新设计系统。

## Acceptance

- 模拟三个 Groq 连接（包括同一个 vendor、不同 ID/名称）：列表有三个独立选项；逐个选择时发往所选 UUID，不涉及其他连接。
- 另建一个连接时只增加一个选项，而不是一个顶部按钮；没有为 Groq 编码固定的连接数量和名称。
- OpenRouter 路径、可免费同步的其他厂商路径、未知 vendor 的禁用状态均被测试；免费套餐确认仍有效。
- 1530px、约 768px 与 390px 宽度下检查标题横向可读、导入操作不挤压标题；桌面和手机都能完成选择与导入。
- TypeScript 类型检查、涉及的浏览器测试与 GitHub Check/Docker/E2E、独立代码审核通过后，才能合并实现 PR。不能把 Docker/E2E 绿灯等同于 Typecheck/Spec 审核成功。

## Scope / reuse / exclusions

- 优先复用现有 `AdminPage`、`Select`、`Button`、`ProviderManagement`、provider CRUD、free-provider-sync；不新增导入状态表、厂商枚举数据库、抽象适配器或后端兜底。
- 只允许调整模型导入页面与共享页面头部的必要布局约束；更广泛的厂商创建页面模板不是本修复目标。
- Spec PR **只改文档**。实现仅在此独立 Spec 已合并 develop 后恢复原有 #483，基于本 Spec SHA 对照逐条验收。
