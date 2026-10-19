# Spec Kit 与 Claude 独立验收（EventGraph）

目标是 **让任意开发者（包括普通 ChatGPT）按同一份已批准的需求接受独立 Claude 检视**。Spec Kit 是规格文件和 Agent 命令的提供者；**它本身不是 PR 合并门禁**。保持 Remote 为通用通信通道，复用现有 GitHub Check/E2E/部署，不建立第二套编排器。

## 首次在已有仓库初始化（按需）

官方文档：[Adopting Spec Kit in an Existing Project](https://github.github.io/spec-kit/guides/existing-projects.html)、[Core Commands](https://github.github.io/spec-kit/reference/core.html)。

1. 从 `develop` 创建短期 feature 分支，并确认工作区干净。
2. 在项目根目录安装官方 `specify-cli` 后运行：
   ```sh
   specify init --here --force --integration claude --script sh
   ```
3. **审查生成的全部 diff 后再提交**：`--force` 可能更新由 Spec Kit 管理的文件，不能盲目覆盖仓库现有的 `AGENTS.md`、`CLAUDE.md` 或 CI。需要 Codex/Pi 时使用官方 `specify integration install <key>` 安装对应集成；不复制改写上游命令。
4. 保持现有 `feature → develop → main`；无需安装 Spec Kit Git 扩展。这里预先提交的 constitution/指导文档可独立使用，**并不代表已运行 CLI 初始化**。

## 规格与实现

- 小 Bug、文案、小样式：可直接使用 Issue 的明确验收条件，不要求生成三份文件。
- 跨模块功能：`specs/<feature>/spec.md`（用户可验证行为）、`plan.md`（复用与技术路线）、`tasks.md`（操作和测试）；推荐 `/speckit.specify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`。
- 先核对现有代码、AIHOT 上游、官方文档，写下“复用什么、为什么不新建”。计划中限定可变更范围、不会变更的部分和验收方法。
- 实施前独立确认/批准 Spec。推荐单独的 spec-only PR 合到 `develop`，实现 PR 在描述里固定 `spec.md @ <approved-sha>`。如果 Spec 通过 Issue 批准，也要附明确批准的评论与原文；不要把修改后的 PR 版本自动认定为批准版。
- 若 Spec 调整，重新取得批准，并更新固定引用；不能通过同一实现 PR 修改 Spec 以掩盖偏差。

## Claude Review（适用于 ChatGPT / Codex / Pi 的 PR）

让 Claude 读取当前 `CLAUDE.md`（其包含 `@AGENTS.md`）、已批准 Spec 的固定版本、Plan、Tasks、PR diff、Check/E2E 与实际部署证据。用本仓库 `.claude/skills/spec-review/SKILL.md` 的清单复审。

1. **一致性**：逐条映射验收条件 → 代码 → 测试；未覆盖明确列出。
2. **最小实现**：核对 Search Before Build 证据和上游复用；标明无关重构、重复模块。
3. **实际验证**：区分 GitHub CI 状态、本地测试、开发部署、真实行为；不能以待运行代替通过。
4. **结果**：给出 `PASS` / `CHANGES REQUESTED` / `UNVERIFIED`，列阻塞项与可复现证据。若批准 Spec 不可访问，报告 `UNVERIFIED`，不假装核验通过。

**现状边界**：该方案复用已连接的 Claude CLI 独立审查和 GitHub PR 评论，不会仅凭这些文件自动触发 Claude GitHub Action。若以后需要每次 PR 触发自动 Claude Review，可使用 [Anthropic 官方 claude-code-action](https://github.com/anthropics/claude-code-action) 和经确认的密钥/费用方案，不应私自部署新的审查常驻服务。生产发布继续受原有门禁约束。
