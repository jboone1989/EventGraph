# EventGraph Analytics · 页面浏览与广告运营

**目标**：先看每个页面被打开多少次，再看 Google 搜索带来多少点击；AdSense 开通后以官方广告报表核算展示量与收益。站内 PostgreSQL 是运营首页 PV 的唯一统计口径，Cloudflare 用于对照，Search Console 用于搜索增长，PostHog 仅保留原有可选采集能力。

## 看板

登录后台访问 `/admin/analytics`。核心指标为 **今日/昨日/近 7 天/近 30 天 PV（UTC）**、每日页面浏览趋势、页面类型 PV、逐篇新闻与事件打开次数、来源域名。逐篇内容排行使用现有 `item_open`/`story_open` 行为事件，**不与全站 PV 相加**。后台不再展示 PostHog 会话数、Graph 使用会话和客户端耗时等与当前广告运营目标无关的指标。站内事件计数来自浏览器，DNT/GPC、脚本受阻及网络故障可能导致漏计；不等于广告展示次数或独立用户数。

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

## 外部数据的后台展示

`/admin/analytics` 仅展示 Cloudflare 7 天 PV 对照，以及 Search Console 30 个完整太平洋日期的搜索指标和落地页类型（新闻候选链接保留在折叠明细中）。PostHog 报表不再由该页面调用。`ready` 表示读取到数据，`empty` 表示 API 已成功返回但当前窗口无数据，`unconfigured` 表示缺少配置，`error` 表示读取失败；后两者不显示零值。各平台统计口径不同，PV 不相加。

服务端凭据仅通过 `.env` 传入 API/worker，**不得放入 web.environment、`NEXT_PUBLIC_*`、HTML 或 Git**。当前 Compose 后端的 `env_file: .env` 已支持这些变量：

| 数据源 | 服务端配置 | 后台展示 |
| --- | --- | --- |
| Cloudflare | `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_WEB_ANALYTICS_SITE_TAG`、`CLOUDFLARE_ANALYTICS_API_TOKEN`（Account Analytics:Read） | 近七天 RUM PV、每日趋势 |
| PostHog（可选旧采集） | `POSTHOG_PROJECT_ID`、`POSTHOG_PERSONAL_API_KEY`（仅该项目，`query:read`）、`POSTHOG_REGION`、`SITE_URL` | 运营后台不展示也不调用 PostHog 报表；若自行使用其平台可保留配置 |
| Search Console | `GOOGLE_SEARCH_CONSOLE_PROPERTY=sc-domain:livingruntime.com`、`GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON` | 搜索点击、曝光、CTR、平均排名、每日趋势、Top 10 搜索词与落地页 |

Search Console：在 Google Cloud 项目中启用 Search Console API，创建服务账号，把其邮箱添加为目标 Search Console 资源的受限用户。将服务账号 JSON 压成一行并用单引号包住，写入上述环境变量。运行时使用官方 `google-auth-library` 获取 `webmasters.readonly` 令牌。网域 DNS 验证只证明所有权，不授予服务器读取报表的权限。新验证的资源首批数据可能仍在处理；报表请求最近30个完整太平洋日期，使用 Google 的最终数据。搜索总量单独查询，不能相加关键词 Top 10 代替。

Google OAuth 换令牌和 Search Console 报表请求都使用站点现有的出站通道；配置 `EGRESS_PROXY_URL` 后，两者一起通过该代理，并保留地址检查、响应大小限制和超时。修改代理或凭据后重建 API 容器使配置生效。

cn-dev 已有的代理通过 SSH 转发到主机 `127.0.0.1:18123`，容器不能直接使用该回环地址。可叠加 `docker-compose.cn-egress.yml`，将 `EGRESS_BRIDGE_BIND` 设为 `aihot_default` 的私网网关地址，`EGRESS_PROXY_URL` 设为 `http://<网关地址>:18124`，一起启动 `egress-bridge`、`api`、`web`。桥接进程仅绑定指定私网地址，复用已有代理，不增加公网监听。

PostHog：公开 `POSTHOG_PROJECT_TOKEN` 负责采集，Personal API Key 负责读取，需分别配置。采集将站内 `page_view` 映射到 PostHog `$pageview`，把 `distinct_id` 放在 `properties` 中，并禁用 person profile；只发无查询参数的页面 URL 和已知行为属性。报表只读取 `source=eventgraph` 且 `site_host` 与 `SITE_URL` 域名一致的数据，避免混入开发或其他项目数据；部署前的无标记事件不计入该口径。匿名会话仍非独立用户。

配置后在**目标部署目录**执行原有 Compose 启动命令重建 Web 并重建 API 容器，使其读取新配置。保留该环境原有的 Compose 覆盖文件和 profiles。Cloudflare 已自动注入时不要再填公开 Beacon token，避免双重采集。首次验收依次检查：API 授权成功、实际页面产生一条正常浏览、平台收到事件、后台报表可读取。API 返回成功不保证平台立即完成摄取。

## 开通顺序与校验

在开发或生产环境，先备份数据库并完成 `scripts/migrate.ts` 的 0087/0088 迁移，然后同时启动更新的 API 和 Web；只更新 Web 不会启用入库端点。打开前台并点击一篇事件、Graph 节点和原文，后台 `/admin/analytics` 应在刷新后出现行为记录。匿名事件 API 返回 204，非法字段返回 400，跨域事件返回 403。

在浏览器网络面板验证 `/api/analytics/events`，在后台确认非零事件计数。若配置外部平台，在其管理页面确认站点状态和访问数据。**代码提交 / 部署 ≠ 第三方账号已启用，也不表示已有历史流量。**

## 新闻→事件增长实验（Spec 005）

以 `specs/005-news-growth-funnel/spec.md`、`research.md`、`plan.md`、`tasks.md` 为本轮产品/SEO 的跨会话基线。新闻详情页仍是独立搜索入口，事件页用于深入探索，主题/关注用于后续阅读；不要全站批量 `noindex` 新闻、将新闻 canonical 到事件，或另建分析平台。

在已有后台 Search Console 区域，按实际返回的落地页 URL 归类新闻、事件、主题、日报及其他，显示点击、曝光、CTR 和页面数。**这是有行数上限的返回样本**，不等于网站独立的 Search Console 总量；Top 10 搜索词也有匿名化限制。新闻候选页只按样本中的曝光挑选，不自动生成标题。数据量较小时只记录方向，不能声称 CTR 提升。

AdSense 的投放资格与 Google 搜索索引是两个判断：保留 PR #114 默认允许合格公开页面被索引的规则，但不得把“可索引”自动等同于“可以投放广告”，详见 Spec 005 的官方政策引用。

## 广告运营与每周改进

AdSense 尚未开通时，运营页面只能显示真实 PV 和搜索数据，**不显示模拟广告展示量、收入或 RPM**。开通后以 AdSense 官方报表为准；Page RPM = 预估收入 / 页面浏览量 × 1,000。同一次页面打开不保证有广告展示，不得通过自动刷新或其他无效流量手段刷量。

每周优先核对全站 PV 趋势、新闻/事件的页面排行、Google 搜索点击和已有曝光的落地页。一次只改一个影响访问量的优先问题，并记录改动日期。
