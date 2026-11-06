# 今日整活 — Implementation Tasks

**Status:** Draft。单独 Spec PR 审批并合入 develop 后，按照 Spec 015 的原生 GitHub Projects / GH-AW Work Queue 机制自动处理。不得在本 Spec PR 中实现。

## Work Items

### T001 — Audit Omnipost and create independent fun discovery
**Scope:** 核验现有 Omnipost MCP 真实能力，新增整活独立数据与候选发现/去重。
**Depends on:** none
**Acceptance:**
- 明确记录 Omnipost tools/list、publish schema、dry_run 对微头条、微信贴图及多图上传的实际支持情况；未证实不能标为可用。
- 新增 fun_posts、fun_distributions 两张表，topic_key 与作品版本/平台唯一键具备幂等保证。
- fun.discover 每 15 分钟独立查询已提交公开新闻、事件和图片，不改动新闻发布事务。
- 同一事件的 10 条新闻默认只生成一个候选；无新候选不调用模型。
- 关闭/失败整活发现时，原新闻仍可正常处理并发布；有自动化测试。

### T002 — Compose human-writing commentary with existing news photos
**Scope:** 从现有事件中选图并使用现有动态轻量模型路由生成短评草稿，支持低成本编辑。
**Depends on:** T001
**Acceptance:**
- 复用 articles.media、coversForStories、现有媒体缓存与 Sharp，推荐 1–4 张原图，支持换图与调序；无图跳过，不使用 AI 生图。
- fun.compose 独立 pg-boss 队列，默认 localConcurrency=1、每天最多 5 件自动成品，模型用途与新闻 analyze_article 分离。
- 按固定 human-writing 规则从有出处的新闻材料生成约 30–120 字短评，含短标题、关联事实 IDs、图片顺序与跳过原因。
- 管理员可重生成、改文案、跳过，不影响原新闻状态；模型失败只影响整活。
- 单元/集成测试覆盖限额、事实不足、图片缺失、模型失败和重复重试。

### T003 — Publish EventGraph fun column and editor UI
**Scope:** 在网站和后台增加「今日整活」，本站为唯一原创作品源，外部渠道仅消费已发布版本。
**Depends on:** T002
**Acceptance:**
- /fun、/fun/:id、首页轻量入口和 /admin/fun 页面可用，支持预览、编辑、图片排序、发布和隐藏。
- 作品页面图片优先，附简短评论、来源、相关新闻和事件链接；移动端可正常浏览多图。
- 草稿不公开、不出现在站点地图；没有已发布作品时首页不显示空模块。
- 站内发布成功后异步产生两个平台任务，但不等待任何平台执行结果。
- 修改、隐藏或撤回 fun 内容不改变 articles、analyses、publications 或原新闻发布结果。

### T004 — Distribute via existing Omnipost MCP with manual export fallback
**Scope:** 复用 Omnipost MCP 对微头条、微信贴图统一分发，按平台保存回执，并支持无接口时的人工发布包。
**Depends on:** T003
**Acceptance:**
- 实测确认支持的渠道可通过已有 MCP publish 发布图片与文案，回写 job_id、remote_ref、remote_url、结果状态。
- 对不支持微头条/贴图/图片上传的平台显示 manual_required，提供稳定实际图片文件下载、复制文案和回填已发 URL。
- 不把限时 img-proxy 链接作为平台永久媒体素材，不在 EventGraph 自建另一套平台适配器。
- 微信失败不回滚成功的头条记录或站内作品；每个平台记录唯一且可重放验证。
- 连接超时等结果未知标记 unverified，不自动盲目重发；MCP mock 覆盖所有结果分支。

### T005 — Analytics and end-to-end failure isolation
**Scope:** 添加渠道归因与已知收益统计，验证整活全链路不拖慢原新闻。
**Depends on:** T004
**Acceptance:**
- 后台展示网站访问量、两平台分发状态/链接、能获取或手动录入的阅读量与收入，缺失指标显示未知。
- 统计 EventGraph 内容带来的平台收益与由平台回流的站内访问，不把流量当作收入。
- 模拟模型长时间延迟、图片下载失败、MCP 掉线、整活队列停机、渠道部分成功；新闻采集分析、归组、发布和通知不受影响。
- 验证同事件去重、日生成上限、并发、重试幂等与禁止不确定重发。
- 完成聚焦的 backend、worker、Web 测试，并通过 develop 既有 Check/E2E；不发布 main。
