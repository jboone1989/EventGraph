# Delivery plan

## Search Before Build

- 基线为 `develop`。先检查已开放 PR、`apps/web/app/routes/admin/runs.tsx`、`apps/web/app/features/admin/ui.tsx` 中的 `DataTable`、`packages/backend/src/admin/runs.ts`、`apps/api/src/routes/admin.ts`、`packages/backend/src/jobs/queue.ts`、Graphiti 入库代码及 receipt schema，明确每类失败项的原工作身份。
- 复用 `requeueFailedArticles`、`requeueFailedJob`、`requeueFailedSchedule`、`rerun`、source fetch；模型重试不得直接 `POST /model/test`，须恢复可定位的业务原执行单元。
- 查现有 `tests/admin-backlog-diagnosis.test.ts`、`tests/admin-ops.test.ts` 与 `apps/web/tests/admin-overview.test.ts`、对应 Playwright mock；复用交互与服务端测试框架。

## Implementation order

1. 先形成真实 model receipt → parent work 的可复核安全映射及“不可重试”定义；后端构造权威单条重试动作，明确重复/过期/权限/收据未确认处理。
2. 前后端共用一套可恢复项类型与 API；有限批量、返回逐项结果；与现有 queue 状态及审计对齐，不重复 dispatch 同一父任务。
3. 调整 DataTable 选择列、短 ID、列宽、可见操作列与响应式布局。完整 ID 保留在 accessible title/复制操作；不要展示假的可点控件。
4. 精准补齐后端与浏览器测试，含 Graphiti 429、单条/批量、部分失败、重复点击、移动端。先跑定向测试、typecheck/build，再经仓库正常 CI/Review 合并到 develop。

## Release / validation

只创建 Agent 实施 PR，base=develop；正常 check/docker/e2e 与 review Gate 完成后才允许合并。默认沿用 develop 预览部署，不直接发 main/生产。记录每个验收场景的实际成功/失败证据而非只记录“按钮被点击”。
