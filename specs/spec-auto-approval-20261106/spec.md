# 自动批准并合并通过 AI 审核的 Spec PR

**Status:** Owner-approved（2026-11-06 用户明确指示：「审核完了自动批准」）
**Branch:** develop

## Problem

现有 Spec Review 通过后仍须手动修改 **Status: Draft**、手动将 Draft PR 改为 Ready 并合并，阻断已有 Spec → GitHub Issues / Projects → 原生 GH-AW Work Queue 路径。用户要求审核通过后自动批准；审核失败停下，不占用 Docker/E2E。

## Contract

1. 仅适用于同仓库、以 develop 为目标、且变动范围为文档的 Spec PR（修改 `specs/<feature>/{spec,plan,tasks}.md`）。普通文档 PR 不调用 LLM；代码 PR 不启用 Spec 批准。
2. 复用现有 `spec-review`（Claude Code Action）结果。仅在该 job 成功、现有必需 `check` 成功并匹配当前 PR HEAD 时，才执行自动批准；review 失败/没运行/输出无法解析时 fail closed。
3. 自动将唯一受审 Spec 的 `**Status:** Draft` 更改为 `**Status:** Owner-approved`，并记录「由 owner 授权的 Spec Review 自动批准」证据。若已经是 Owner-approved 则不重复修改。提交状态变化只发生在 Spec PR 分支，不得修改 develop 直接推送或绕过保护。
4. 自动把 Draft PR 标记 Ready，并使用现有 `GH_AW_GITHUB_TOKEN` 和 GitHub 原生 squash auto-merge。因为状态变更创建新 commit，必须在**新 HEAD 的 Spec Review 与 Check 再次通过**后才合并；不得用旧 SHA 的结果放行新 commit。不得因为重复 workflow event 重复修改或循环评审。
5. PR 审查通过并合并后，保留现有 Spec 015 的 owner-merged + Owner-approved 双条件，照旧由现有 Producer 建立 Issues 并提交 GH-AW Work Graph，不增加第二个 Producer、定时器或调度器。
6. Spec PR 无须 Docker/E2E；对 CI/workflow 本身的修改仍需跑现有全部代码检查、Docker/E2E、代码 Review。
7. 只对同仓库真实 PR 执行，必须校验 PR base、HEAD、draft、文件数/路径和 Status。若 Spec 内容在审核后被修改，则须在修改后的 HEAD 上重新审核；不得通过自动修改绕过审核。

## Acceptance

- 纯 Spec Draft PR → spec-review 通过 → 自动更新 Status → 新 HEAD 审核通过 → Ready + squash merge → 原 Producer 将 Work Items 转化为 Todo。
- review 失败、缺少结果、非 Spec 文档 PR、Spec 混入业务代码、PR HEAD 已变或无明确单个 Spec → 不自动批准或合并。
- 相同 revision 多次触发，不产生循环、重复批准或重复合并；review 成本为每个实际不同 HEAD 至多一次，状态变更只发生一次。
- 纯 Spec PR 的 Docker/E2E skipped；普通代码 PR 的原 code review/auto merge 仍正常。
