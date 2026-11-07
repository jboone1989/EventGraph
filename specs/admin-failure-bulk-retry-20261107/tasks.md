# Implementation tasks

## Work Items

### T001 — 修复全流程失败表的真实重试、批量操作及紧凑交互
**Scope:** 在现有 develop 的后台 /admin/runs 与对应 Admin API/后端中实现真实可用的逐行和所选批量恢复，尤其 Graphiti graphiti_chat/embedding 模型 429 通过真正父任务重新入队；保持回执安全约束和原队列；压缩长 ID 与表格列宽并做好桌面/移动端操作；补真实测试。
**Depends on:** none
**Acceptance:**
- 逐行重试按钮可以点击并能通过真实 API 把允许恢复的失败项入待处理；后端返回正确结果并校验状态和权限，不假报成功。
- Graphiti 的 graphiti:<hash> 模型失败通过证据关联原父任务，429 允许恢复而不创建孤立测试调用或重复重放；缺关联或 pending/unknown 回执明确禁选并显示原因。
- 失败行具有复选框、全选/取消当前页、可见的重新处理已选 (N)；批量有有限并发与去重、支持部分失败、正在处理期间禁重复提交，并刷新真实队列；一次混合批量错误不导致其他行中断。
- graphiti:<长 hash> 缩短为前 8–12 位加省略号且保留完整 ID 的查看/复制方式；表格列宽紧凑，操作在桌面及 390px 移动端可触达，错误内容可读。
- 定向后端/React UI/Playwright 回归覆盖 Graphiti 429、普通失败项、无法安全恢复项、批量部分失败、去重、状态变化；typecheck、Web build 和 PR CI 结果有证据。
- 仅提交 feature/agent 实施 PR 到 develop，审核通过正常合并；不涉及 main、生产、额外队列或独立任务调度器。
