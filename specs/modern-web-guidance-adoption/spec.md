# modern-web-guidance skill 采纳（APPROVED）

Status: **APPROVED**（依据 Owner 2026-11-11 在协作会话中的明确指示：安装 Chrome/Edge/Firefox/MDN 团队维护的 `modern-web-guidance` 并提交入库；本 Spec PR 获 Owner 批准合并即为该指示的确认记录。实施 PR 须以本批准 PR 合入 develop 后的 merge commit SHA 钉扎）。

## 范围

引入现代 Web 平台最佳实践检索能力，供编码 Agent 在 Web 前端任务中使用；只改 Agent 指令文档、来源记录与忽略规则，不改产品代码、测试、迁移、公开 API、CI 工作流或部署脚本。

**不在范围**：AGENTS.md 既有五 skill 清单的更新（留待 Owner 后续决定）；任何自动模型调用；离线指南缓存入库；浏览器兼容政策的全站改造。

## 需求

- **FR-1（正典与发现入口）**：正典正文位于 `.agents/skills/modern-web-guidance/SKILL.md`，内容为上游 npm 包 `modern-web-guidance` 随包的 skill 指令（search/retrieve 工作流）；`.claude/skills/modern-web-guidance/SKILL.md` 为轻量发现指针，指示 Agent 先读正典正文再行动，沿用 `docs/agent-skills-adoption.md` 的「一正典正文 + Claude 轻量指针」约定。两文件均以普通文件入库。
- **FR-2（来源可追溯）**：`skills-lock.json` 记录上游 source（`GoogleChrome/modern-web-guidance`）、`skillPath` 与 `computedHash`；`docs/agent-skills-adoption.md` 新增小节，说明出处（npm 包、上游仓库、维护团队）、安装方式、junction 替换为指针的原因、`guides/` 不入库的理由与运行时入口。
- **FR-3（语料不入库）**：安装器写盘的约 2MB `guides/` 本地语料不入库，`.gitignore` 新增 `.agents/skills/modern-web-guidance/guides/`；运行时一律经 `npx -y modern-web-guidance@latest search|retrieve` 获取指南，不读本地 `guides/`。
- **FR-4（不以 junction 入库）**：本仓库 `core.symlinks=false`，安装器在 `.claude/skills/modern-web-guidance` 创建的 Windows junction 若入库会被展开为语料副本；入库形态必须是普通指针文件，junction 仅存在于本地安装状态。

## 验收

1. 实施 PR 钉扎本文档批准版本（`Spec: specs/modern-web-guidance-adoption/spec.md@<40位SHA>`）。
2. PR diff 仅含：两个 SKILL.md、`skills-lock.json`、`.gitignore` 一条、`docs/agent-skills-adoption.md` 小节，总量远小于既有 80KB 评审 diff 上限。
3. Claude Code 会话技能列表出现 modern-web-guidance；`npx -y modern-web-guidance@latest search` 对真实查询返回结构化结果。
4. `git status` 在安装语料存在时保持干净（`guides/` 被忽略）；不新增依赖、服务、环境变量或产品开关。
