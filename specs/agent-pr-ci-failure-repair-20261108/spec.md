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

1. **可信触发和覆盖范围**：v1 以现有**整个 `Check` GitHub Actions 工作流**的 `workflow_run completed + failure` 为唯一事件入口，而不是只检查名称为 `check` 的 Job。该工作流的必需 Job 包括 `check`（Typecheck/单测等）、`docker`、`e2e`、`claude-review`（独立代码审核）。这四项**任何一项失败均在恢复检测范围内**：例如 `check=success, docker=failure`、`check=success, e2e=failure`、三个基础 Job 成功但 `claude-review=failure`，不能因 `check` 成功就忽略整条失败的工作流。解析实际各 Job/步骤结论，区分具体可修复代码或测试缺陷与临时 runner、镜像仓库、模型凭据/额度、审核器输出格式等基础设施失败；后者只产生可观察的人工接管/基础设施恢复信息，不把它伪装为业务代码缺陷或无限派 Agent 修代码。事件必须来自本仓库**已完成的 `pull_request` Run**，PR 属于 `develop`、非 Draft、带 `agent-work` 标签，HEAD SHA 等于失败 Run 的 `head_sha` 和实时 PR HEAD。明确排除 fork、主分支、取消/正在执行/过期 Run、纯 Spec、非代理 PR。
2. **修复输入**：根据 GH API 读取实际失败步骤/日志、当前 PR 的不可变 Issue/Task/Spec 关联和源代码；将日志、PR 文本当作不可信数据。只给原修复 Agent 与当前失败 SHA 绑定的单次授权，不能让 PR 评论扩大权限。
3. **官方安全写入**：仅使用 GH-AW `push-to-pull-request-branch` 对原 PR 的 agent 分支做非 force、最新 HEAD 校验后的可验证提交；不改变 PR 所属 Issue/Spec/Claim；无修改时报告真实原因，不制造绿灯。
4. **安全边界**：修复范围限于当前 Issue 的原业务/测试文件。禁止更改 `.github/**`、审核/部署/Spec/迁移/鉴权/密钥/依赖或重新生成业务规则；需要产品决定/数据删除风险时停在原 PR 上说明，不默默扩大 Spec。
5. **有界恢复**：同一 `(repo, PR, failing HEAD SHA)` 只执行一次；整个 PR 最多 2 次自动修复机会。用 GH Actions 原生运行证据及原 PR 可核验记录去重，不用新表、定时器、额外 Project 或平行队列。若 CI 不可用或修复失败，明确展示“需接管”的原因；禁止无限模型调用。
6. **自动接续**：若修复 push 成功，现有 PR `synchronize` 再跑 Check/Docker/E2E/独立 Review，通过后由原生自动合并入 `develop`，VM13 正常部署；原有成功的 develop Check 继续驱动后续 Todo。失败 PR 持续独占串行槽时要明确可操作原因，不得谎报队列无 Work。
7. **不可绕过**：不得改变 `check` / `docker` / `e2e` / `claude-review` / Spec 审查语义，不伪造 Check 结论、不人为修改规则集、不自动合并红灯 PR、不触碰 `main`、VM09 或生产。

## 验收样本和可见结果

- **首个真实样本：#501 / #491 T002**。修复流水线以 #501 当前真实 TS2559 失败记录作为触发证据；同一 `agent/` PR 新 HEAD 必须经过 Typecheck、Docker、E2E、独立 Review 和 GitHub 原生合并，随后验证 VM13 预览。**业务功能本身由已批准的 `specs/admin-runs-count-and-model-binding-20261107/spec.md@8b01d9475d55487ff36f623c9572e55874a03035` 的产品规则 A（Issue #491/T002）拥有和验收，本恢复 Spec 不重新定义、不扩大为 #477 的批量重试范围。**验收界面是 `/admin/runs`、后台导航栏“运行与积压”徽标：本 UTC 日全类型失败执行单元数与页面“处理失败”卡片及全类型明细总数同口径；页面按既有 20 条分页及筛选展示，导航全局数不随局部筛选变化，同一刷新完成后数字一致，处理成功后从失败计数退出。详尽 Given/When/Then、桌面 1530px/手机 390px 和测试数据以 #491 原 Spec 为准。不能由协调者直接编辑 #501 业务测试冒充恢复 Agent。
- **接续样本：#477 和 #490**。#501 原 PR 合并后，在下一次成功 develop Check 事件上能观察到原生队列自动派工并生成新代理 PR；若有依赖/策略阻止，提供真实原生队列证据而非猜测。
- **安全样本：#482**。Draft 与“删除新闻”风险必须保持阻断；用户要求硬删除来源但保留历史文章和图关系。不得自动强行修复或合并未批准的数据删除语义。
- **防回归测试**：分别注入 `check=failure`、`check=success + docker=failure`、`check=success + e2e=failure`、基础检查均成功但 `claude-review=failure`（有明确代码缺陷报告）、审核器 API/额度错误（不触发代码修复、显示人工接管）、重复/过期 HEAD、fork、无标签、Draft、整个工作流成功、超过修复上限、当前 HEAD 提前变动、越权修改、无实际修改、真实自动复跑和续办。Docker/E2E 失败若只有基础设施/环境原因，也必须明确显示阻断原因和恢复入口，不能静默占用队列或假装已修复。所有未运行的功能浏览器验收标记 UNVERIFIED。


## 首次落地的启动死锁（必须正面解决）

已验证 `#501` 当前占用唯一 `agent-work` PR 串行槽，所以新 T001 如果仅入队，将被现有 `open != 0` 门禁直接跳过。**不能把任务提交成功当作已开始修复。**

本功能首次安装允许且仅允许一次「控制面 bootstrap」，**这是经本 Spec 批准后、独立于 Producer 队列的正常 feature PR 交付步骤，而不是需要原 Work Queue 执行的第二个 Agent Work**：批准并合并本 Spec 到 `develop` 后，协调者可以只为控制面安装提交一个非 `agent-work`、不修改 #501 业务代码的 feature PR，引用本 Spec 的固定批准 SHA；仅新增/最小修改 GitHub 原生失败事件入口、GH-AW 官方 repair workflow 和相应验证测试，使用官方 v1.0.1 编译生成 lock；完整通过 Check/Docker/E2E/独立代码审核，走正常自动合并到 `develop`。由于 `workflow_run` 需要使用默认分支上的 workflow 文件，安装完成后仍须走已有 `develop → main` 审核、**Merge Commit** 发布路径，将控制面工作流带到 `main`；不得直接推送/绕过 main 保护或人为影响生产业务数据。最后用 GH Actions 原生方式对 #501 的当前失败 HEAD 做一次有界的 bootstrap 触发/重放并核对真实结果，不能假定历史 workflow_run 事件会自动重放。后续失败恢复必须完全由 GH-AW 自动执行，bootstrap 授权不延伸到其他业务 PR。

**任务分工，避免 Producer 死锁或重复实现**：合并的 `tasks.md` 中 `T001` 是**安装后的回归覆盖/验收补足 Work**，由现有 Producer 创建 Issue/Work，不能被要求在 #501 尚未修复时执行，也不得二次实现 bootstrap 修复器。唯一控制面 bootstrap 是普通功能 PR（不带 `agent-work`），不消耗原生 Work Queue Claim；#501 原 PR 恢复/合并后，串行槽释放并触发既有事件续办，T001 才能够作为常规后续任务执行。对 T001 的排队状态必须可见，不能把创建 Issue 当作完成。

**CI 触发真实性：** GH-AW 官方说明默认 `GITHUB_TOKEN` 的安全输出 push 不保证产生新的 pull_request CI 事件。必须配置已存在的仓库自动化凭证（如 `GH_AW_GITHUB_TOKEN`）作为受限安全输出的 GitHub token，或使用官方 `github-token-for-extra-empty-commit`，并以实际最新 HEAD 的 Check Run 验证；不能假定推送=重跑。参考：https://github.github.com/gh-aw/reference/triggering-ci/

新 GH-AW 源必须由官方 v1.0.1 CLI 生成 lock，bootstrap 阶段不得手写、复制过期 lock，也不得启用未经审核的临时生产代码。

## 非目标

不改变原 Worker 原任务的已完成 Claim/Result，不重新提交旧 Claim、不绕过原生 work queue，不添加按小时续办/第二套 Agent 产品；不以这次 CI 修复修改 #482 的删除决策；不将真实业务问题视作测试通关后自动解决。

**Approval rule:** 本 PR 仅包含 Spec/Plan/Tasks；独立 Spec Review 通过并自动合入 `develop` 后，**先**以唯一正常功能 PR 安装上述控制面 bootstrap（不可由当前被 #501 堵塞的 Worker 执行），**再**让 #501 在同一原 PR 被 GH-AW 实际修复和合并。既有 GH-AW Producer 自动创建的 `T001` 仅作 bootstrap 后的补充回归/验收 Work，不重复安装修复器；全部功能 PR 仍按原有 CI/独立审查自动合并，严禁在本 Spec PR 直接改工作流。
