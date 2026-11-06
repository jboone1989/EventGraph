# 今日整活 — 最小实现计划与现有代码复用证据

**Status:** Draft
**Spec:** ./spec.md
**Base:** develop

## 1. Search Before Build：已核实

### EventGraph develop

- 新闻统一分析：packages/backend/src/editorial/analyze.ts 的 AnalyzeOnceSchema 产出标题、摘要、结构、判断和解读。整活读取既有分析，不调用新闻 analyze_article。
- 新闻发布：packages/backend/src/publication/publish.ts 的 publishArticle 与 publications。新功能只读已提交公开投影，不添加到新闻事务。
- 事件聚合与图片：packages/backend/src/publication/stories.ts 的 coversForStories，以及 articles.media。按 story/fact 关联报道并挑图。
- 图片代理缓存和处理：packages/backend/src/media/{images,imgproxy,renditions,poster}.ts。复用 produceImage、Sharp、图像尺寸适配与缓存。
- 队列与调度：packages/backend/src/jobs/queue.ts、apps/worker/src/{main,schedules}.ts。独立 fun 队列/定时发现，复用 pg-boss。
- 网站与后台：apps/web/app/routes.ts、apps/web/app/routes/admin/。新增栏目和后台页面。
- 分析访问：packages/backend/src/publication/analytics.ts。复用现有页面行为跟踪。
- 重要风险：modules.ts 的 articleChanged 钩子执行时会被 await；**不允许把整活 LLM、图片或 MCP 放进去**。

### 现有跨仓库资产

- human-writing Skill 1.1.0： https://github.com/jboone1989/human-writing/tree/main/human-writing ，MIT 许可。只使用其中 reality、formats、短内容/评论、revision 规则；实现时固定代码引用版本和出处，不新增写作引擎。
- 已有统一分发 MCP 客户端： https://github.com/jboone1989/wechat-traffic-agent/blob/main/src/wechat_traffic_agent/platforms/omnipost_client.py 。已证实接入 Omnipost 的 Streamable HTTP MCP，支持 initialize、tools/call，调用 publish(title, markdown, platforms, dry_run, min_interval_minutes)，并能映射按平台返回的状态。
- 既有内容发布事件抽象：wechat-traffic-agent 的 src/wechat_traffic_agent/publication/{models,dispatch}.py，定义 PublicationEvent 与 DistributionTask，值得参考身份和渠道独立状态，但不要引入整套 Python Agent。
- 当前客户端默认 http://127.0.0.1:8399/mcp，可通过 OMNIPOST_MCP_URL 指定；这个 localhost 是旧部署的默认值，**不能未经验证直接填进 EventGraph 的生产配置**。

**待核实项（T001 必须先做）：** Omnipost MCP 实际服务所在部署、连接方式/认证、tools/list 中 publish 的完整 schema、微头条与微信贴图的准确平台标识、可否上传多图/图片短内容、是否支持 dry_run 和返回确定 URL。现有客户端支持 platforms 列表不等于目标平台已实现。

## 2. 设计

### 数据和发现

新增 packages/backend/src/fun/ 作为小型领域模块；迁移两张表 fun_posts、fun_distributions。fun.discover 每 15 分钟从已公开的 publications 连 articles/media + facts/stories 增量发现。先做确定性过滤，按 topic_key 去重；只有入围的有限个候选调用模型，避免按新闻量放大成本。保留人工从现有新闻创建候选的入口。

### 生成

fun.compose 是独立 pg-boss worker，localConcurrency=1；使用模型管理里的现有动态轻量路由作为一个 fun.compose 用途。原有分析结果、事件时间线、已知新闻配图和可核对来源作为输入。输出短标题、正文、source/article IDs、image ordering、风格、skip reason；用轻量检查挡住空洞、伪造的结果，管理员只需改稿/确认。无图或证据不足直接 skipped。

### 图片

复用现有图像读取/缓存/Sharp；选中的图片保存原始 URL、来源和顺序，并导出实际稳定文件（平台支持的格式）。48 小时签名的 img-proxy URL 只供网站查看，不作为分发结果引用。图片处理失败独立记录，支持换图。

### 网站

新增 /fun、/fun/:id、/admin/fun 和首页入口。展示站内图片短评和相关新闻/事件，公开内容使用既有站点分享元数据和统计方式。草稿不出现在公开索引。网站发布提交完成后，再异步启动 fun.distribute；外部分发绝不能成为本站发布的成功前置条件。

### Omnipost

实现最薄的 Omnipost MCP 调用层，优先连接已有服务，不重实现 Server、不写新的各平台 Adapter。先 initialize → tools/list → dry_run，只有证实支持对应的媒体格式/平台时才允许自动发。已知 publish API 的 title/markdown/platforms 有可能不支持多图或具体内容类型；不可杜撰 upload 参数。若不支持，则统一输出图片文件、可复制文案和来源链接，渠道标成 manual_required。平台回执成功时记 URL/ref；连接断开但可能已发的场景标 unverified，不自动重发。

### 资源与失败隔离

整活调度和队列与 content.analyze、events.group、publication publish 分离；复用 worker 进程但独立任务和预算，禁止在新闻生命周期同步等待。整活停用不影响新闻工作。系统内的候选和分发记录用数据库唯一键做幂等。网站发布与发起分发使用持久化状态，确保重启不漏任务也不重复发帖。

## 3. 最小文件与范围

- 新增 backend fun 领域、DB migration、队列声明及一个独立 handler。
- 修改 worker 注册整活队列及 schedule（不改现有新闻 handler 的执行条件）。
- 复用当前媒体代码，只写少量图片选择与导出。
- 增加前后台 fun route 和必要 API、测试。
- 增加 Omnipost 轻量客户端/能力发现；既有 WeChat/头条适配留在 Omnipost，不混到 EventGraph。

## 4. 验证

- 后端单测：发现过滤、topic_key 去重、日额度、无图跳过、短评事实引用和状态流转。
- 队列集成：模型长期阻塞、图片 502、整活 worker 停机时新闻分析/发布不延迟；重启重试不重复草稿。
- MCP mock：成功、部分成功、无平台支持、无图片媒体能力、明确失败、结果不确定；dry_run 不发送真实内容。
- Web：草稿不可见、发布/隐藏、来源跳转、移动端多图、首页无内容不留空、后台编辑。
- Develop CI、E2E 走现有 Check；不在本需求中调整 main、生产或现有模型配置。

## 5. 必须避免的重复建设

不引入 AI 生成图片，不加另一个完整内容 Agent，不建第二个 MCP Server/社交平台发布器，不在新闻发布事务内写整活逻辑，不增加第二套新闻采集或异步调度基础设施，不为两个平台分别调一次 LLM。