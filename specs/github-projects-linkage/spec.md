# GitHub Projects 队列联动：只读观测板（APPROVED）

Status: **APPROVED**（Owner 于 2026-11-01 以"直接实现 GitHub Projects + GH-AW + Agent Workers 联动"的明确指示批准本 MVP；实施 PR 须以本批准版本合入 main 的提交（本批准 PR 合并后的 merge commit SHA）钉扎）。

## 范围

1. **只读镜像，不改准入语义**：唯一 Work 准入通道仍是 owner `agent-ready` 标签 + Producer；原生 work-queue 账本（`work-queue` 分支）仍是唯一队列存储。Projects 板只做观测视图，不参与调度，不改 Claim/交付语义，符合 [Spec 012](../012-github-hosted-agent-queue/spec.md) "不手写队列存储"的约束。
2. **确定性、零模型调用**：同步脚本不调用模型、不引入新服务、不新增环境变量；凭证沿用既有 `GH_AW_GITHUB_TOKEN` secret，若该 token 缺少 user Projects 读写权限，工作流输出指向 token 设置的明确错误而不静默。
3. **事件驱动，不加定时轮询**：只挂 workflow_run（Dispatch Gate / Worker / Worker Completion / develop·main 的 Check 完成）与 workflow_dispatch。

## 板与字段

- 用户 `jboone1989` 名下 Projects V2 板，标题 `EventGraph Agent Queue`；不存在则幂等创建。
- 单选字段 `Status`：`Queued`（带 `agent-ready` 标签的开放 Issue）、`In review`（`base=develop`、`label=agent-work` 的开放 PR）、`Merged`（最近 20 个已合并的 agent-work PR）。
- 一个草稿条目 `Queue snapshot`：每次同步以 work-queue 账本摘要（Work/Result 操作计数与最后操作时间）更新；账本分支不存在时显示为空队列。

## 同步规则

- 以内容 node id 幂等 upsert：已存在的条目不重复添加，仅更新 `Status`。
- 板上条目不删除，保留历史；脚本只维护上述三个内容集合与一个 snapshot 条目。
- 同步失败只失败本工作流，不影响既有 Dispatch Gate / Worker / Completion / Check 任何 job 的成败。

## 验收

1. 实现 PR 引用本文档批准版本 SHA。
2. `workflow_dispatch` 手动运行：板被创建或更新成功；若 token 权限不足，输出明确的授权指引错误。
3. 带 `agent-ready` 标签的开放 Issue 与带 `agent-work` 标签的开放/已合并 PR 在板上可见且 `Status` 正确；`Queue snapshot` 条目含账本计数。
4. 既有 Dispatch Gate / Worker / Worker Completion / Check 工作流行为不变。
