# Work items — native GitHub Agent delivery recovery

## Work Items

### T001 — 恢复并验证现有 Agent 开发与 develop 自动合并闭环
**Scope:** 对照当前 GitHub Actions、Producer 和 PR #464 的真实证据，复用既有 EventGraph GH-AW Native Work Queue、GitHub Projects #2 及 check.yml；查明为什么所有检查和代码审核通过仍未执行 develop 原生自动合并，最小修复确有根因的条件/测试。无需重新实现模型管理功能，也不得创建新的调度体系。
**Depends on:** none
**Acceptance:**
- 检查 PR #464 的精确 HEAD、审核状态、behind/mergeability 及 auto_merge_develop 的实际表达式条件，给出可以从当前仓库日志复核的根因。
- 仅在确有现存缺陷时改动已有检查、分支更新或自动合并逻辑，并添加针对该根因的回归测试；保持单个 HEAD 仅必要审核，不绕过 CI 或独立审核。
- 通过已合并 Spec 产生当前 T001 的唯一 Issue、Projects Todo 与原生 Work Queue 任务；核对相关 GitHub Actions/Work/PR 标记，遇到变量或权限阻断则明确报告。
- Agent 通过当前已部署的 Worker 提出一个关联本 Issue、Task T001 与已批准 Spec SHA 的 PR，目标 develop；按现有 check、Docker、E2E、review 与自动合并门禁执行，不修改 main 或生产。
