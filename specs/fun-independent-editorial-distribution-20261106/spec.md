# 今日整活：独立原创短内容与统一分发流水线

**Status:** Draft — 待所有者审阅。仅编写 Spec，不授权实施或自动入队。
**Date:** 2026-11-06
**Repository / base:** jboone1989/EventGraph / develop
**栏目名：** 今日整活
**Slogan：** 每天看看世界又整了什么活

## 1. 背景和目标

EventGraph 已能连续采集、分析和发布新闻，保存图片、新闻来源、Facts、Stories 和历史进展。新增一条完全独立的原创短内容流水线，从**已公开发布的新闻与事件**中找反差、后续变化和有意思的细节，复用相关新闻图片，参考 human-writing 写 30–120 字的幽默评论，在 EventGraph 网站形成一份原创作品，再分发到今日头条微头条及微信公众号贴图。

同时验证两个收益来源：平台创作收益；社交平台带来的 EventGraph 访问以及 Google AdSense 收益。不要为了发帖数量重复分析新闻，不做新闻长文。

## 2. 不可更改的架构边界

- **新闻发布零依赖：** 新闻采集、analyze_article、归组、publishArticle、原有推送/索引的完成条件和成功率，不能受整活模型、图片或 MCP 影响。整活只读取已提交的公开新闻投影；不得在 articleChanged 同步钩子或新闻发布事务里等待整活。
- **一条独立业务流水线：** 复用 EventGraph 已有 PostgreSQL、pg-boss、动态模型池、Sharp 图片代理与缓存、站点框架；整活自身有独立队列、状态、失败重试、预算。禁止新建采集器、第二套调度服务或第二个新闻分析流程。
- **本站是一份原创的事实来源：** EventGraph 上保存短评和图片作品；头条、微信仅执行排版/字数/媒介适配，不各自重新生成一份正文。
- **现成图片：** 从新闻 articles.media 和相同事件的现有报道中挑 1–4 张；首版不引入图像生成模型、人工插画或复杂海报编辑器。没有可用图的候选可以跳过。
- **统一分发使用已有 Omnipost MCP：** 在 wechat-traffic-agent 已有 omnipost_client.py，统一 publish；先验证运行中 tools/list、平台名称、富媒体能力，不可假定当前已支持微头条/微信贴图。支持则直接使用；不支持则提供手动发布包，后续改 Omnipost，不在 EventGraph 自建另一套社交发布器。
- **自动创作，人工确认：** 系统自动推荐/生成草稿，后台可改文案、换图、重生成、跳过、一键发布。第一版默认管理员确认发布；无逐级审核业务。
- **尊重原始事实：** 按 human-writing 的现实材料、短文、评论写作原则表达判断与吐槽。不得虚构亲历、用户证言或引述，不能为搞笑凭空杜撰细节；确实没槽点就跳过。

## 3. 用户故事

US1：新闻一如既往正常发布。独立整活任务每 15 分钟从已经提交的新闻和事件中挑选候选；10 条说同一事件的报道只产生一个默认候选。

US2：后台「整活工坊」可看到候选和草稿，图为既有新闻配图，标题简短、正文 30–120 字，能查看来源、调整 1–4 张图顺序、修改正文及发布/跳过。

US3：网站 /fun 提供列表，/fun/:id 提供可分享的作品详情，主要展示图片和短评，同时能点回新闻/事件来源；首页显示最新几条。

US4：本站作品发布完成后，微头条和微信贴图成为两个独立的分发状态。可用 Omnipost 自动发布；未证实能力时能下载图片并复制文字后手工发布，再录入平台链接。

US5：整活 LLM、图片、MCP、单个平台出现故障时，原新闻不受影响，其他分发渠道的成功结果也不会回滚。

## 4. 功能要求

### FR-001 候选发现和去重

- 新增独立的 fun.discover，每 15 分钟读取公开且已提交的 publications、articles、facts 和 stories。仅做数据库读取/整活数据写入，不干涉原新闻流程。
- 不要求新闻必须入精选。优先有图、有可验证反差、官方表述变更、科学趣事、普通人能理解的产品体验或有事件后续的主题。
- 用 story/fact，若没有事件则用 article ID，构建稳定 topic_key；为已处理 topic 建唯一键。允许新阶段形成后续篇，但常规重复扫描不能产出重复草稿。
- SQL/TypeScript 先筛，最多 20 个候选再使用模型；无新候选不调用模型。默认目标每天 3–5 件成品，上限 5；允许管理员手工选题和单个重新生成。

### FR-002 新闻配图

- 复用 articles.media、coversForStories、现有图片代理、produceImage、Sharp；按清晰度、相关性与顺序挑 1–4 张。
- 保留原图观感，只在平台需要时缩放/压缩；允许后台换图、删图、调序。没有图可跳过整活，不能反向要求新闻重新抓取。
- 为站外发布导出**稳定的实际图片文件**，不把带 48 小时签名的图片代理 URL 当平台永久媒体资源；保存图片出处和相关新闻链接。

### FR-003 human-writing 生成评论

- 使用现有模型 CRUD/自动轻量路由，新增至多一个模型用途 fun.compose，独立用量记录；每个成品尽量一次模型调用，不能再次调用新闻 analyze_article。
- 从 human-writing 1.1.0 中使用现实事实、短内容、观点评论、改稿相关规则，固定所用版本及出处，避免另造通用写作引擎。
- 输出短标题、30–120 字短评、事实来源 IDs、图片次序、风格（反差吐槽、互联网记忆、普通趣闻），以及不适合创作时的 skip_reason。
- 语气可以犀利、有趣、有分寸，不强行每条都搞笑，不写假口语或模板化 AI 排比。管理员可以直接改写，网站和平台复用同一最终修订文本。

### FR-004 独立任务和状态

- fun.discover：独立 schedule 发现候选；fun.compose：独立 pg-boss 生成队列；fun.distribute：只在本站作品发布后触发的异步分发。
- 默认生成并发 1，单日自动成品上限 5；独立重试与错误状态。停止/禁用这条流水线不得停止新闻队列或影响新闻成功回执。
- 任务重启、同事件多报道、模型超时、图片 502 均不产生重复作品。保留整活历史，不参与新闻运行数据每天 UTC 清空逻辑。

### FR-005 网站原创栏目与后台

- 新增 /fun、/fun/:id、首页轻量入口和 /admin/fun。没有已发布整活时不要显示首页空模块。
- 详情以图片+短评为主，显示原始新闻/事件、必要的事实来源、发布日期和可分享预览；移动端适配。
- 草稿不公开；发布后读者可访问。编辑、隐藏、撤回整活作品不修改原新闻或事件数据。
- 站内发布成功后异步建立独立分发记录，不等待外部 MCP。

### FR-006 Omnipost MCP 分发

- 在接入前确认运行中 Omnipost 的 initialize、tools/list、publish schema、平台标识、图片上传/媒体字段、dry_run 行为。旧客户端已知入参是 title、markdown、platforms、dry_run、min_interval_minutes；这不等同于保证支持微头条与微信贴图。
- 一份已发布作品分别建立 toutiao-micro、wechat-tietu 两个分发状态；唯一身份 (fun_post_id, revision, channel)。若实测支持对应媒体类型，则通过 Omnipost publish 提交，保存 job_id、status、remote_ref 和 remote_url。
- 缺少平台/图片能力时提供图片文件批量下载、可复制文案、手动确认发布及外部链接回填，状态标记 manual_required，不能伪装成发布成功。
- MCP 连接超时等**发送结果未知**时标记 unverified，不盲目重发。头条成功、微信失败时，各平台状态互不影响。平台适配能力如需扩展，应在 Omnipost 工程实现，不复制进 EventGraph。

### FR-007 指标和收益

- 后台按作品显示本站访问量（现有 analytics）、各平台链接、已获取的阅读数据、平台收益及对应模型消耗。
- 当前没有平台数据 API 时允许人工录入；未知显示未知，不根据阅读量虚构收入。
- 使用渠道归因参数统计微信/头条给 EventGraph 带来的访问。平台自身创作收益和本站 Google 广告收益分开核算。

## 5. 数据和状态

新增两张整活表，不修改 articles、analyses、publications 既有生命周期：

- fun_posts：id、topic_key、关联 story/fact/article IDs、source_refs、images（来源/顺序/发布快照）、title、body、style、input_hash、revision、status、skip_reason、created_at、published_at。
- fun_distributions：fun_post_id、revision、channel、status、omnipost_job_id、remote_ref、remote_url、last_error、views、revenue、sent_at；唯一键 (fun_post_id, revision, channel)。

作品状态：candidate → composing → draft → published；还可 skipped、failed、hidden。
分发状态：pending → publishing → success；另有 manual_required、unverified、failed。

## 6. 可验收的条件

- AC-01：模拟整活模型延迟、图片错误、MCP 掉线、整活队列停机，新闻 publishArticle、新闻展示和通知结果均不受影响；主流程不等待整活。
- AC-02：无新候选时不调用模型；原新闻无需增加任何分析调用。
- AC-03：同一事件 10 条报道默认只产生一个候选/草稿；重启和重复发现不重复生成。
- AC-04：有图可展示 1–4 张已有新闻图片并下载稳定平台素材；无图跳过整活，不调用图像生成。
- AC-05：human-writing 规则用于事实充分的短评，30–120 字为默认目标，可编辑、重生成、跳过并保存来源。
- AC-06：/fun、/fun/:id、/admin/fun、首页入口可用；草稿不公开；整活隐藏不影响原新闻。
- AC-07：先留存 Omnipost tools/list 与 dry_run 证据；实际支持的渠道可发布并保存回执，不支持的渠道导出图片文案包。
- AC-08：部分平台成功/失败分开记录；unverified 不自动重复投稿。
- AC-09：后台展示真实可得的流量、渠道与收益数据，不能将缺失数据推测为收益。
- AC-10：每日自动生成上限和并发限制有效；整活预算、队列及异常不会干扰新闻主流水线。

## 7. 非目标与审批

本版不改新闻采集/分析/评分/Graphiti/归组；不做长文、不做 AI 绘图、不造自建分发 MCP、不做浏览器模拟登录发布、不部署 main/生产。

本文件作为单独 Draft Spec PR 提交，等待所有者审核。根据 EventGraph 的 Spec 015 规则，只有把 Spec 标成 Owner-approved、由所有者合入 develop 之后，tasks.md 才能交给 GitHub Projects / GH-AW 原生队列。单纯要求“写 Spec”不表示批准实现。
