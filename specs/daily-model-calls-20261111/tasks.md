# 模型每日调用统计：GH-AW Work

**Spec:** `specs/daily-model-calls-20261111/spec.md`
**Plan:** `specs/daily-model-calls-20261111/plan.md`
**Status:** Owner-requested；Spec Review 和 owner 合并 develop 后由原生 Producer 入队。

## Work Items

### T001 — 真实模型请求的全量每日聚合 API 与覆盖测试
**Scope:** 在当前 develop 上核查所有模型调用入口，基于持久 receipt_attempts/receipts 按 UTC 自然日统计全量请求尝试、状态、模型实例、工作流、业务/测试、Token/重试；补最低必要的非敏感内部模型实例追踪字段，排除非模型工具，增加有参数边界和管理员鉴权的只读 API 与契约。不得改预算/模型选择/重试逻辑，不建第二套日志或定时任务。
**Depends on:** none
**Acceptance:**
- 1 条 receipt 的多次 attempt 分别统计；响应复用不计；仅 live，UTC 左闭右开；按天序列无重复且各状态总和一致。
- 普通 chat、embedding、Graphiti chat/embedding、模型测试有覆盖，deepseek_web/Jina/SocialData 等非模型调用明确排除；未识别入口与历史覆盖限制显式暴露。
- 不同连接同名模型按真实内部 ID 分开，缺失 ID 的历史数据不造 UUID；当使用 usage 缺失时标注未提供，成功率/Token 不假算。
- 聚合 API 只读/鉴权/日期与分页有界，错误不冒充 0；真实查询性能可接受且不阻塞导航、模型测试和新闻队列。
- 为凌晨 UTC 边界、重试/失败、路由回退、双连接同名模型、测试与工具排除、鉴权、无数据/不完整数据提供自动化测试；附按现有 DB 回执的 read-only 交叉验算。

### T002 — 后台“模型调用统计”页面与真实预览验收
**Scope:** 复用现有 Admin UI 与路由组件创建 /admin/model-usage（导航位于模型管理附近），展示今天/昨天/7/30 天 UTC 请求次数、状态、每日趋势、按模型实例/厂商/阶段/业务或测试分布、重试、已知 Token；提供日期/模型/阶段/状态过滤、分页、明确空/错误/不完整/加载态，做到桌面与手机可用。
**Depends on:** T001
**Acceptance:**
- 页面无需模型请求；选定日期/筛选后卡片、日趋势、模型表与阶段表均取同一 API 口径；未标记阶段/历史未识别实例/Token 缺失不虚构数据。
- 7/30 天按 UTC 自然日连续展示；成功+失败+未知+进行中=总尝试；测试请求可单独区分，非模型请求不计。
- 使用现有 AdminPage/Stat/DataTable/FilterChips/Pager 或已安装组件，不新造表格系统；长模型名/内部 ID 可完整查看且不挤掉字段，390px、desktop 和键盘访问正常。
- API 失败不能显示 0，未完成数据不能冒充成功；权限正确且不公开，不影响已有三队列及 admin SSR/nav 性能。
- 自动化测试 + develop 预览实际 API/SQL 交叉验算 + 桌面及 390px 浏览器截图/操作证据；CI/独立评审通过后按原流水线自动合并。
