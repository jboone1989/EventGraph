# 恢复既有 Spec → Todo → Agent 自动开发与 PR 收尾

**Status:** Owner-approved（2026-11-07，用户要求“做吧”，明确要求实际编码由已集成 Agent 执行）
**Branch:** develop
**Existing systems:** GitHub Projects #2, GitHub Issues, GH-AW v1.0.1 Native Work Queue, eventgraph-native-queue-events, check.yml, independent code review.

## 问题与可复现证据

- 已合并的模型类型 Spec #465 只有 `spec.md`，缺少 `plan.md`、`tasks.md`，因而不满足既有 Spec 015 自动入队要求。此缺口属于此次手工提交方式造成，不应通过新增调度器解决。
- 现有模型实现 PR #464 的 HEAD `97775248cc83a4b0c2ff4f1476725004d79f41a8` 对应的 check、Docker、E2E、Claude Review 都通过，但 PR 仍 open；GitHub 报告 mergeable_state `behind`，自动合并 job 结果为 skipped。根因须由 Agent 基于**当前**事件/条件及 API 记录核实，不能假定仅因 behind。
- GitHub Actions 工作流 `eventgraph-native-queue-events.yml` 已存在，至少一次成功续办运行 #42325621694 能扫描 Spec 任务并正常输出 `No eligible native Work`。其余事件有按门禁 skipped 的情况；不应将所有 skipped 误判为调度失败。

## 用户可验收的行为

1. 实际开发必须通过完整 `spec.md + plan.md + tasks.md`、独立 Spec 审核、合并到 develop 后的既有 Producer，产生 GitHub Issue/Projects Todo/GH-AW Work，由 Agent Worker 提出实施 PR；不得由协调者持续直接推送业务代码。
2. 调查 #464 经明确通过的检查与代码审核后为何自动合并未执行，并仅修正既有 `check.yml` / 相关测试中的最小真实缺陷；既有原生 squash auto-merge 应处理前进中的 develop，不重复调用 Claude 评审同一 SHA。不得直接绕过分支保护、修改 main 或手工重做模型实现。
3. 保持唯一的 GH-AW 队列、Project #2、Existing Worker/Dispatcher、单个未决 agent-work PR 并发约束。不得增加第二套 Agent 调度器、定时任务、自建 API/数据库或新的 review 链路。
4. 以最新实际仓库数据与日志验证：一个完整 Spec 可以确定性地创建且只创建一个对应任务 Issue、挂上 `agent-work` 标签、通过 Project Auto-add 显示 Todo、进入原生 Work Queue、由 Worker 领取并提交 PR。若需要外部仓库变量/权限，报告明确设置项与受阻阶段，不可假称已成功。
5. 在下一个已批准开发 PR 上验证：CI 与独立审核通过后自动合并 develop；仅当前 HEAD 上的结果可授权合并。对已有 #464 只允许复用当前已验证成果及 GitHub 原生合并机制，避免重复实现与无意义的修复提交。

## 验收

- 明确记录 #464 的 skipped 判定实际原因；用回归测试覆盖造成该结果的分支条件并最小修复（若原因确属配置或权限而非代码，提供有效的运行证据与恢复入口）。
- 本 Spec 的一个 Work Item 自动进入原生 GH-AW Work Graph，生成 Issue 并显示在 Projects Todo，最终形成关联的 agent-work PR；如未入队，明确是哪一级和为何阻断。
- PR 的 Spec gate、TypeScript/check、Docker、E2E 和独立审核遵循既有规则，不追加不必要审核。
