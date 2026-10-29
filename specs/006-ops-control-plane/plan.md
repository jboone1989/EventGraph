# 006 · 实施路线

## P0 当前 PR（少量真实代码）

- 修复 `afterFailure` 仅对当前阶段路由不可用 409 视为短期 Provider 恢复问题：不累积文章失败次数，300 秒后重试。其他配置错误仍保留原规则。
- `selectConfiguredProviderForStage` 使用 routeEnabled 和能力测试通过的模型；优先免费 NVIDIA，明确 routeEnabled 且健康的付费 Provider 可作为 fallback。没有就按 `BudgetExceededError` 暂等，不给文章计失败。
- `retestExpiringModels` 保留原限速/锁/开关，并恢复错过 24h 窗口/失败冷却后的验证。每轮 3、失败 6h 冷却。配套 `provider-retest.test.ts`。
- **付费直连模型已在开发库，但没有任何一阶段显式选择它**。这个 PR 不更改用户既有阶段映射；代码合并、开发验证后通过后台有审计的现有模型选择功能将需要的阶段改为已验证 paid model，再分批恢复旧失败任务。
- 复用 `/admin/runs` 展示 `articles` 的实际状态并明确 blocked=正常预筛过滤；导航根据操作优先级重排并使 /admin 先到运行。
- 添加官方 BOJ/RBI/BOK/日本 FSA 四条低初次回填信源配置，实际入库依赖既有 `seed.ts`、采集开关和真实解析验收。不可一次性覆盖已在库中由用户修改的其他信源。

## 下一 PR

- Provider 管理按阶段展示当前已路由模型、状态和不可路由原因；来源过滤（区域/语言/一手二手）只在实际信源数量经过对账后补入。
- 结合 Graphiti 584 历史失败记录，区分 historical dead jobs 和当前堵塞；在不重复创建处理框架的条件下修复其真正持续故障。
- 若已有页面证实不用，再删除入口/路由/服务端 API/测试和文档。

## 验收

- 独立 Claude Code 方案反审已完成；PR 经现有 GitHub Check/Docker/E2E/Claude Code 代码复审才合并。
- 运行页桌面 1440、手机 390、深浅主题做实际视觉测试；未执行时标为“未验证”，不拿源码审查代替截图。
- 开发 DB 验收：所选付费 GLM 有有效 capability probe，阶段当前选择确实指向其 ID，新产生的模型恢复错误不增加文章 processing_attempts，老 failed 通过受控重新入队处理并记录成功/失败/实际调用费用。
- 生产暂不部署，等待用户既定每周 main 发布；不能把开发成功当生产成功。
