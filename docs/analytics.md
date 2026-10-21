# EventGraph Analytics · 数据反馈闭环

**目标**：了解访问 → 事件阅读 → Graph/证据探索 → 来源阅读的真实使用情况。默认使用站内匿名事件统计，Cloudflare、PostHog、Google Search Console 是可选外部数据源。

## 看板

登录后台访问 `/admin/analytics`。显示最近 30 天的 PV、匿名会话、事件阅读、Graph 节点选择、来源跳转、搜索、按天趋势、内容排行、语言和来源域名，以及客户端导航 P75。**该站内会话数不是 UV**；真实独立访客请看 Cloudflare。七天「有效知识探索」定义为：同一匿名标签页会话内至少打开一次事件，并选择至少一个 Graph 节点或访问原文。它衡量的是有效探索会话，而不是经身份确认的独立用户。

- `page_view` 浏览公共页面；管理员页面不记录
- `story_open` / `item_open` 打开事件 / 报道
- `graph_node_select` / `graph_relation_select` 点击实体或选择关系
- `source_open` 点击带来源标记的原文链接
- `rss_open` 点击 RSS 订阅链接
- `search_submit` 搜索动作（不记录搜索词）
- `navigation_complete` 客户端页面跳转耗时（ms）
- `agent_access_open` / `feedback_open` 打开接入或反馈页面

后台查询通过现有 `/api/admin/*` 身份校验。访客匿名事件由 `POST /api/analytics/events` 接收并写入 `product_analytics_events`，不记录 IP、User-Agent、邮箱、全文 URL、查询参数或搜索词；随机会话 UUID 存在 `sessionStorage`。DNT/GPC 浏览器不上传。事件入口限制字段、请求来源和频次；数据按约 90 天周期清理（依靠入库触发机会性清理，低流量场景请另外调度删除维护任务）。

## 外部平台（可选）

1. **Cloudflare Web Analytics**：Cloudflare 控制台将网站添加到 Web Analytics，复制公开 site token 到环境变量 `CLOUDFLARE_WEB_ANALYTICS_TOKEN`。若 Cloudflare 已为此域名自动注入 Beacon，避免重复接入。
2. **PostHog**：创建项目并复制公开的 `phc_...` project token 到 `POSTHOG_PROJECT_TOKEN`，区域通过 `POSTHOG_REGION=us|eu` 设置。本代码只发送有限的匿名关键事件到 PostHog 公共 Capture API，不集成 session replay / autocapture，也不发送用户输入。
3. **Google Search Console**：建议使用 Cloudflare DNS 验证域名；也可复制 HTML 验证字符串到 `GOOGLE_SITE_VERIFICATION`，前台自动生成 `<meta name="google-site-verification" ...>`。验证成功后在 Search Console 查看曝光、关键词、CTR 与索引情况。

上述公开标识只传入 Web 容器（Docker Compose 的 `web.environment`）。报表 API 私钥与公开采集标识是两类配置，不能互相替代。站内事件继续写入 PostgreSQL；外部报表通过 API 实时读取，进程内缓存五分钟，不复制平台原始事件或创建虚假历史数据。

## 把三个平台的报表读回后台

`/admin/analytics` 分别展示三个平台的指标、时间窗口、最后成功读取时间和授权状态。`ready` 表示读取到数据，`empty` 表示 API 已成功返回但当前窗口无数据，`unconfigured` 表示缺少配置，`error` 表示读取失败；后两者不显示零值。各平台统计口径不同，PV 不相加。

服务端凭据仅通过 `.env` 传入 API/worker，**不得放入 web.environment、`NEXT_PUBLIC_*`、HTML 或 Git**。当前 Compose 后端的 `env_file: .env` 已支持这些变量：

| 数据源 | 服务端配置 | 后台展示 |
| --- | --- | --- |
| Cloudflare | `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_WEB_ANALYTICS_SITE_TAG`、`CLOUDFLARE_ANALYTICS_API_TOKEN`（Account Analytics:Read） | 近七天 RUM PV、每日趋势 |
| PostHog | `POSTHOG_PROJECT_ID`、`POSTHOG_PERSONAL_API_KEY`（仅该项目，`query:read`）、`POSTHOG_REGION`、`SITE_URL` | 近30天 PV、匿名会话、每日趋势、行为计数 |
| Search Console | `GOOGLE_SEARCH_CONSOLE_PROPERTY=sc-domain:livingruntime.com`、`GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON` | 搜索点击、曝光、CTR、平均排名、每日趋势、Top 10 搜索词与落地页 |

Search Console：在 Google Cloud 项目中启用 Search Console API，创建服务账号，把其邮箱添加为目标 Search Console 资源的受限用户。将服务账号 JSON 压成一行并用单引号包住，写入上述环境变量。运行时使用官方 `google-auth-library` 获取 `webmasters.readonly` 令牌。网域 DNS 验证只证明所有权，不授予服务器读取报表的权限。新验证的资源首批数据可能仍在处理；报表请求最近30个完整太平洋日期，使用 Google 的最终数据。搜索总量单独查询，不能相加关键词 Top 10 代替。

Google OAuth 换令牌和 Search Console 报表请求都使用站点现有的出站通道；配置 `EGRESS_PROXY_URL` 后，两者一起通过该代理，并保留地址检查、响应大小限制和超时。修改代理或凭据后重建 API 容器使配置生效。

cn-dev 已有的代理通过 SSH 转发到主机 `127.0.0.1:18123`，容器不能直接使用该回环地址。可叠加 `docker-compose.cn-egress.yml`，将 `EGRESS_BRIDGE_BIND` 设为 `aihot_default` 的私网网关地址，`EGRESS_PROXY_URL` 设为 `http://<网关地址>:18124`，一起启动 `egress-bridge`、`api`、`web`。桥接进程仅绑定指定私网地址，复用已有代理，不增加公网监听。

PostHog：公开 `POSTHOG_PROJECT_TOKEN` 负责采集，Personal API Key 负责读取，需分别配置。采集将站内 `page_view` 映射到 PostHog `$pageview`，把 `distinct_id` 放在 `properties` 中，并禁用 person profile；只发无查询参数的页面 URL 和已知行为属性。报表只读取 `source=eventgraph` 且 `site_host` 与 `SITE_URL` 域名一致的数据，避免混入开发或其他项目数据；部署前的无标记事件不计入该口径。匿名会话仍非独立用户。

配置后在**目标部署目录**执行原有 Compose 启动命令重建 Web 并重建 API 容器，使其读取新配置。保留该环境原有的 Compose 覆盖文件和 profiles。Cloudflare 已自动注入时不要再填公开 Beacon token，避免双重采集。首次验收依次检查：API 授权成功、实际页面产生一条正常浏览、平台收到事件、后台报表可读取。API 返回成功不保证平台立即完成摄取。

## 开通顺序与校验

在开发或生产环境，先备份数据库并完成 `scripts/migrate.ts` 的 0087/0088 迁移，然后同时启动更新的 API 和 Web；只更新 Web 不会启用入库端点。打开前台并点击一篇事件、Graph 节点和原文，后台 `/admin/analytics` 应在刷新后出现行为记录。匿名事件 API 返回 204，非法字段返回 400，跨域事件返回 403。

在浏览器网络面板验证 `/api/analytics/events`，在后台确认非零事件计数。若配置外部平台，在其管理页面确认站点状态和访问数据。**代码提交 / 部署 ≠ 第三方账号已启用，也不表示已有历史流量。**

## 每周改进

每周固定对照：访客/自然搜索趋势、访问→事件→Graph/来源转化、中文/英文差异、热门事件与切换 P75。一次只调整一个高优先级问题，记录改版日期与基线，隔周对照数据；数据不足时不下结论。不要为了追求 PV 人为刷事件。
