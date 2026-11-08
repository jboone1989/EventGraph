# GH-AW 现有 PR 的 CI 失败自动修复与队列续办

**Status:** Draft — existing independent Spec Review / owner-delegated approval required
**Date:** 2026-11-08
**System:** GitHub-native EventGraph; `develop`, GH-AW v1.0.1, native Work Queue, Check and Claude/GLM Review, Project #2

## 不可替代的用户结果

昨天的真实问题必须可以自动交付，而不只是生成 PR：
`Spec 批准 → Projects Todo → GH-AW Worker 创建原 PR → CI 失败 → 修复原 PR → 重新检查/独立审核 → GitHub 原生自动合并 develop → VM13 预览部署 → 下一项 Todo`。

## 当前可复现证据

- #501 是 `agent-work` 标记的原生 GH-AW Worker 产物，Issue #491 / T002，PR HEAD `5a28175f0681a547db29b5b88bf2e4f81247370a`。Run #42438923985 的 Docker 和 E2E 通过，但 `check` 在 Typecheck 失败：`apps/web/tests/runs-badge.test.ts:90:57 TS2559`（测试描述参数位置类型不匹配）。
- 成功完成的原生队列续办 Run #42438945904 却打印 `Open agent-work PR; no parallel dispatch`。#477（失败明细逐行/批量真实恢复）和 #490（模型固定绑定防错）的获批任务仍开放。它们不能因为一个失败 PR 无限排队。
- #482 是昨天的另一个真实需求，Draft PR 仍含硬删除时连带删除历史新闻的风险。此类产品/数据语义缺陷不得被“修 CI”的自动化强行合并。
- 原本历史 `specs/pi-auto-repair/spec.md` 已声明被 GitHub-hosted GH-AW 替代，不得恢复 cn-dev/Pi/VM09 上的 Agent、自建队列或定时器。

## Search/Reuse Before Build（必须先适配现有系统）

1. 复用仓库的 `.github/workflows/check.yml` 和 `.github/workflows/eventgraph-native-queue-events.yml` 原生成功/失败结果；保持现有 `agent-work` Issue/PR 关联、Spec 固定 SHA、单开放 PR 原则。
2. 使用官方 GH-AW 的 `safe-outputs.push-to-pull-request-branch` 更新已存在、同仓、同一 `agent/` 分支 PR；不得新建替代 PR、手写 git push/自制 patch 交付器或直接操作 Work Queue ledger。对应上游参考：https://github.github.com/gh-aw/reference/safe-outputs-pull-requests/#push-to-pr-branch-push-to-pull-request-branch
3. 审核前由确定性 GitHub Actions 事件/现有事件续办逻辑验证 PR/Check/HEAD；使用 GH-AW 的已配置 GLM 端点、凭据和沙箱，不增加独立模型路由、数据库、cron、轮询或自建服务。若需要专用 repair Agent workflow，应直接复用官方 GH-AW 编译/安全输出，不重写调度器，且只在失败的原 PR 上作业。
4. 官方 `gh aw compile --strict` 生成并提交 `.lock.yml`；不得手写生成锁文件。校验当前 v1.0.1 确实支持选用的安全输出和事件组合，不支持则 fail closed，并在 GitHub PR 给出阻塞依据。

## 触发、授权和执行合同

1. **可信触发**：既有 Check 的 `workflow_run completed + failure`，事件必须来自本仓库已完成的 PR Run，且 PR 属于 `develop`、非 Draft、带 `agent-work` 标签，HEAD SHA 等于失败 Run 的 `head_sha` 和实时 PR HEAD。明确排除 fork、主分支、取消/正在执行/过期 Run、纯 Spec、非代理 PR。
2. **修复输入**：根据 GH API 读取实际失败步骤/日志、当前 PR 的不可变 Issue/Task/Spec 关联和源代码；将日志、PR 文本当作不可信数据。只给原修复 Agent 与当前失败 SHA 绑定的单次授权，不能让 PR 评论扩大权限。
3. **官方安全写入**：仅使用 GH-AW `push-to-pull-request-branch` 对原 PR 的 agent 分支做非 force、最新 HEAD 校验后的可验证提交；不改变 PR 所属 Issue/Spec/Claim；无修改时报告真实原因，不制造绿灯。
4. **安全边界**：修复范围限于当前 Issue 的原业务/测试文件。禁止更改 `.github/**`、审核/部署/Spec/迁移/鉴权/密钥/依赖或重新生成业务规则；需要产品决定/数据删除风险时停在原 PR 上说明，不默默扩大 Spec。
5. **有界恢复**：同一 `(repo, PR, failing HEAD SHA)` 只执行一次；整个 PR 最多 2 次自动修复机会。用 GH Actions 原生运行证据及原 PR 可核验记录去重，不用新表、定时器、额外 Project 或平行队列。若 CI 不可用或修复失败，明确展示“需接管”的原因；禁止无限模型调用。
6. **自动接续**：若修复 push 成功，现有 PR `synchronize` 再跑 Check/Docker/E2E/独立 Review，通过后由原生自动合并入 `develop`，VM13 正常部署；原有成功的 develop Check 继续驱动后续 Todo。失败 PR 持续独占串行槽时要明确可操作原因，不得谎报队列无 Work。
7. **不可绕过**：不得改变 `check` / `docker` / `e2e` / `claude-review` / Spec 审查语义，不伪造 Check 结论、不人为修改规则集、不自动合并红灯 PR、不触碰 `main`、VM09 或生产。

## 验收样本和可见结果

- **首个真实样本：#501 / #491 T002**。使用其真实 TS2559 失败事件验证自动识别后，将原 PR 代码/测试修复推到**同一分支**，在新 HEAD 上通过 Typecheck、Docker、E2E、独立 Review，并且自动合并 `develop`；导航 badge 与运行失败明细共用 UTC 今日失败执行单元口径、刷新后与分页可核对，完成 VM13 预览验收。不能通过直接编辑这条 PR 冒充恢复 Agent 运行。
- **接续样本：#477 和 #490**。#501 原 PR 合并后，在下一次成功 develop Check 事件上能观察到原生队列自动派工并生成新代理 PR；若有依赖/策略阻止，提供真实原生队列证据而非猜测。
- **安全样本：#482**。Draft 与“删除新闻”风险必须保持阻断；用户要求硬删除来源但保留历史文章和图关系。不得自动强行修复或合并未批准的数据删除语义。
- **防回归测试**：重复/过期 HEAD、fork、无标签、Draft、成功 CI、超过修复上限、审核反馈 VS 环境故障、当前 HEAD 提前变动、越权修改、无实际修改、真实自动复跑和续办。所有未运行的功能浏览器验收标记 UNVERIFIED。

## 非目标

不改变原 Worker 原任务的已完成 Claim/Result，不重新提交旧 Claim、不绕过原生 work queue，不添加按小时续办/第二套 Agent 产品；不以这次 CI 修复修改 #482 的删除决策；不将真实业务问题视作测试通关后自动解决。

**Approval rule:** 本 PR 仅包含 Spec/Plan/Tasks；等独立 Spec Review 自动批准并合入 develop 后，再由既有 GH-AW Producer 创建实现任务，禁止用 Spec PR 自己改工作流。
