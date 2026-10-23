# EventGraph · Spec Kit 的实际接入与验收

本仓库在 `feature/spec-kit-claude-review` 分支已用 **GitHub 官方 specify-cli 1.2.1** 初始化，不是仿制实现：`.specify/` 提供原生模板、Bash 脚本和工作流；`.agents/skills/speckit-*/` 是 Codex Skills；`.claude/skills/speckit-*/` 是 Claude Code Skills。合并到 `develop` 后，所有后续 feature 分支自然继承它们。**Remote、应用、现有 CI/CD 均不需要改动。**

官方参考：[现有项目接入](https://github.github.io/spec-kit/guides/existing-projects.html)、[快速开始](https://github.github.io/spec-kit/quickstart.html)。

## 对新开发任务使用

- 小 Bug、文案、样式：仍可直接以 Issue 的验收标准修复，不必生成三份文件。
- 跨模块功能：让开发 Agent 执行 `speckit-specify → speckit-plan → speckit-tasks → speckit-analyze → speckit-implement → speckit-converge`。在 Codex 使用 `$speckit-...`，在 Claude Code 使用 `/speckit-...`（由各自集成安装的 Skills 提供）。
- **Search Before Build**：先核对 EventGraph 当前代码、AIHOT 上游及官方资料，写入 `plan.md` 的复用依据，禁止另造并行系统。
- `specs/<feature>/spec.md` 写用户可验证的行为，`plan.md` 写技术方案，`tasks.md` 写任务与测试。只通过 Agent Skills 使用官方流程，不额外部署调度服务。
- 推荐在实施前通过独立 Spec PR 或用户批准的 Issue 确定规格；实现 PR 写明批准的 `spec.md` **commit SHA + path** 或批准的 Issue 评论。不把实现分支内自行修改的 Spec 当作批准版。
- 分支策略仍为 `feature → develop → main`，不安装 Spec Kit 可选 Git 扩展；常规开发合并到 `develop`，每周才发布 `main`。

## 任意 Reviewer 的验收方法

ChatGPT **也可以**独立核对，不要求必须交给 Claude：

1. 读取固定的已批准 Spec，比较 `spec.md`、`plan.md`、`tasks.md` 与实际 PR diff；逐条列验收条件 → 实现文件 → 测试 → 真实运行结果。
2. 检查 Search Before Build 证据、范围外重构、重复实现、权限/隐私和兼容性回退。
3. `speckit-analyze` 是文档一致性检查；`speckit-converge` 在实施后可追加缺失任务，**不是只读 PR diff Review**。Review 仍须直接检查代码和 GitHub CI。
4. 报告 **PASS / CHANGES REQUESTED / UNVERIFIED** 和可复现的证据；不能把绿灯 CI 当作产品已验收，也不能把 PR 合并等同于开发环境已部署。

## 维护

CLI 是开发工具，不要求在生产或 Remote 安装。在需要初始化新仓库或升级时，本机可安装 `specify-cli==1.2.1`，并使用 `specify integration status` / `specify integration upgrade <key>`；不要重新 `init --force` 覆盖已管理的文件。当前 PR 仅接入文件与规范，**不会自动触发任何 Claude Review 服务，也不会自动合并/部署**。
