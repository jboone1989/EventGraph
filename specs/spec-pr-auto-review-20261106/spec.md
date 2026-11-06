# Spec PR 自动评审（CI 内置）

**Status:** Owner-approved（2026-11-06 用户确认：可以）
**Date:** 2026-11-06
**Target:** develop

## Problem

目前 `.github/workflows/check.yml` 将纯 Spec 文档 PR 判断为 `docs_only`，原 `claude_review` 仅对代码 PR 运行，因此 Spec PR 可以得到绿色 Check 却没有任何自动质量评审。EventGraph 的 Spec → Project → Agent 开发方式缺少 Spec 质量门禁。

## Requirements

1. 更改 `specs/<feature>/spec.md`、`plan.md`、`tasks.md` 的 **docs-only PR** 必须执行**一次** Spec AI 审核。保持现有代码 PR 的 Claude Review 机制不变；普通文档 PR 无需模型调用。
2. Spec 审核复用现有 `anthropics/claude-code-action@v1`、`OPENROUTER_API_KEY`、`CLAUDE_REVIEW_MODEL`、`CLAUDE_REVIEW_BASE_URL`，不得创建新收费评审服务、循环触发器或异步补审任务；对于每次新的 PR HEAD，只运行一次。
3. Spec reviewer 以 PR 实际 diff 为不可信数据，聚焦需求是否清晰、plan 是否真实复用现有能力、是否重复造轮子、任务与依赖能否落地、验收是否客观可测。只提交可定位、可执行的阻断问题；不将写作格式、过度谨慎或 Draft 状态本身作为缺陷。
4. 审核输出必须有显式 `spec-review` job；评审执行失败、结果格式异常或发现阻断问题均令**现有必需 `check` 状态失败**。不能依赖额外管理员手动修改 branch ruleset 才能生效。
5. 已有 code review 和 auto-merge 只有在 Spec 审核通过后才能继续。**Spec PR 不自动合并**，审核通过后仍由仓库所有者手动确认、标记 Owner-approved 并合并，以确保 Spec 015 的审批门禁不会被 Bot 合并所绕过。
6. Draft Spec PR 也应该能得到自动审核，而不会自动合并；只检查 spec 文件变更的 PR，不为其它纯文档消耗模型额度。
7. 提交只包含最小的现有 Check 工作流改动及聚焦测试；不更改新闻产品、模型路由、GH-AW 原生队列或发布配置。

## Acceptance

- A: 修改 Spec 文件的纯文档 PR → spec-review 实际执行、输出结论、check 必须在其完成后才能成功。
- B: review 返回有阻断 findings / 非法 JSON / 运行失败 → spec-review 和必需 check 均失败，自动合并不会启动。
- C: 纯普通文档 PR → 无 AI review，check 正常；代码 PR → 原 Claude Review 只运行一次。
- D: Spec PR 即使审核通过也不自动合并；Draft PR 可以接受审核；普通代码 PR auto-merge 仍按原条件执行。
- E: 只在 PR 打开/同步/重新打开/ready_for_review 事件发生，不添加定时器、不创建重复审批调用。

## Not in Scope

不改审核模型、价格、生产部署、开发 Agent 执行机制或 GitHub Work Queue；不自动批准 Spec；不修改 #434 Spec 业务要求。
