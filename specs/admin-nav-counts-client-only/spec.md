# 后台导航角标客户端加载隔离

**状态：待 Spec Review 批准**

## 已复现故障
2026-11-10 VM13 预览：已部署的 8379094 镜像在 14:17:39 UTC 对 `/admin/models` 产生 SSR aborted 500；`/api/admin/nav-counts` 于 14:17:42 UTC 才返回 200，耗时 24451ms。当前 `navCounts()` 会执行全流程明细统计，慢查询不得阻断页面。

## 行为契约
1. `/admin/models`、`/admin/model-bindings`、`/admin/runs` 等所有后台页面必须在通过 `/api/admin/me` 身份校验后及时开始 SSR，不得等待导航角标。
2. 导航角标仅在客户端挂载后请求 `/api/admin/nav-counts`；路由变化时重新请求，取消旧请求，失败时不显示角标，不把失败伪装成数值零。
3. 保持原有 UTC 当天计数口径、桌面和手机导航、后台登录跳转、`private, no-store` 与安全响应头。
4. 不修改业务队列、模型配置、数据库、生产部署或 `failedFlowUnitCount` 的口径。
5. 用现有 Playwright 测试覆盖慢/失败角标、移动端和未认证场景。CI 绿、独立审核通过后合并 develop，并自动部署 VM13，验证已认证后台不再发生同类 500。

## 非目标
后续独立优化 `failedFlowUnitCount()` 的查询成本；本修复先隔离 SSR。
