# EventGraph · Spec Kit 的实际接入与验收

本仓库在 `feature/spec-kit-claude-review` 分支已用 **GitHub 官方 specify-cli 1.2.1** 初始化，不是仿制实现：`.specify/` 提供原生模板、Bash 脚本和工作流；`.agents/skills/speckit-*/` 是 Codex Skills；`.claude/skills/speckit-*/` 是 Claude Code Skills。合并到 `develop` 后，所有后续 feature 分支自然继承它们。**Remote、应用、现有 CI/CD 均不需要改动。**

官方参考：[现有项目接入](https://github.github.io/spec-kit/guides/existing-projects.html)、[快速开始](https://github.github.io/spec-kit/quickstart.html)。

## 对新开发任务使用

- 小 Bug 也先写一个**轻量 Spec**（问题、可复现根因、期望结果、验收方式），不强制拆出 plan.md/tasks.md；纯文案/文档可直接走 PR；可执行 CI、生产配置和部署脚本的变更也需事先确定轻量 Spec。不要用‘小修复’口头标签绕过 Spec。
- 跨模块功能：让开发 Agent 执行 `speckit-specify → speckit-plan → speckit-tasks → speckit-analyze → speckit-implement → speckit-converge`。在 Codex 使用 `$speckit-...`，在 Claude Code 使用 `/speckit-...`（由各自集成安装的 Skills 提供）。
- **Search Before Build**：先核对 EventGraph 当前代码、AIHOT 上游及官方资料，写入 `plan.md` 的复用依据，禁止另造并行系统。
- `specs/<feature>/spec.md` 写用户可验证的行为，`plan.md` 写技术方案，`tasks.md` 写任务与测试。只通过 Agent Skills 使用官方流程，不额外部署调度服务。
- **必须先单独合入 Spec PR，再做实现 PR**；用户决定范围后才能开工。实现 PR 描述中写 `Spec: specs/<feature>/spec.md@<40位提交SHA>`，同时写明实际审批记录。Spec 需已存在于目标分支，且与锁定提交内容一致；在实现 PR 中临时补 spec.md 不符合门禁。
- 分支策略仍为 `feature → develop → main`，不安装 Spec Kit 可选 Git 扩展；常规开发合并到 `develop`，每周才发布 `main`。

## GitHub 强制门禁

现有 `Check / check` 任务中运行 `scripts/ci/check-spec.mjs`，复用 develop 的现有 Ruleset（`check` 为必需状态）；不用第二套 CI。该脚本基于 PR 改动和 base/head SHA 判定：产品实现/配置/测试修改必须引用目标分支**事先存在且未变更的 Spec**；纯文档、Spec、CI 治理修改，以及同仓库的 `develop → main` 正式提升合并不阻塞（此前实现 PR 已在 `develop` 检查）。直接提交到 `main` 的其他实现 PR 不豁免。缺失、伪造提交 SHA、Spec 在本实现分支新建、**与实现代码在同一 PR 修改已批准 Spec**、Spec 中途漂移均使 Check 失败。

PR 自动触发与 `workflow_dispatch` 都执行同一门禁：后者必须通过 GitHub API 精确找到该 SHA 的唯一未关闭 PR；找不到即失败，而不是静默跳过。只有直接在 `main` 或 `develop` 分支执行的非 PR 检查不需要功能 Spec。`industry/prompts/*.md` 属于运行时配置，不能作为普通 Markdown 文档免检；纯文档例外只接受指定目录内的文本格式，不包括脚本。\n\n脚本证明的是 Spec 版本存在、锁定且在实现前；**无法自动证明用户真的批准、或每一条需求都已实现**。Claude 必须进一步核对 PR 的审批依据和实际行为，不允许用填模板或测试替身冒充验证。

## 任意 Reviewer 的验收方法

ChatGPT **也可以**独立核对，不要求必须交给 Claude：

1. 读取固定的已批准 Spec，比较 `spec.md`、`plan.md`、`tasks.md` 与实际 PR diff；逐条列验收条件 → 实现文件 → 测试 → 真实运行结果。
2. 检查 Search Before Build 证据、范围外重构、重复实现、权限/隐私和兼容性回退。
3. `speckit-analyze` 是文档一致性检查；`speckit-converge` 在实施后可追加缺失任务，**不是只读 PR diff Review**。Review 仍须直接检查代码和 GitHub CI。
4. 报告 **PASS / CHANGES REQUESTED / UNVERIFIED** 和可复现的证据；不能把绿灯 CI 当作产品已验收，也不能把 PR 合并等同于开发环境已部署。

## 维护

CLI 是开发工具，不要求在生产或 Remote 安装。在需要初始化新仓库或升级时，本机可安装 `specify-cli==1.2.1`，并使用 `specify integration status` / `specify integration upgrade <key>`；不要重新 `init --force` 覆盖已管理的文件。当前 PR 仅接入文件与规范，**不会自动触发任何 Claude Review 服务，也不会自动合并/部署**。
