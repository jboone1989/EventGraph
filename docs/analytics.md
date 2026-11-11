# EventGraph 运营分析入口

EventGraph 后台的“效果 → Cloudflare 分析”直接打开运营者在 `site/site.ts` 配置的 Cloudflare 控制台地址。浏览次数、Bot 流量等以 Cloudflare 官方统计为准，不再维护 PostgreSQL PV 仪表盘或自行拼接不同来源的数值。

- Cloudflare：配置 `SITE.cloudflareAnalyticsUrl`；只有对应 Cloudflare 账户有访问权限的用户才能打开。可选 `CLOUDFLARE_WEB_ANALYTICS_TOKEN` 用于浏览器官方 Beacon；如果 Cloudflare 已自动注入，不要重复启用。
- Google Search Console：在 Google 平台查看搜索点击与曝光，站点验证仍支持 `GOOGLE_SITE_VERIFICATION`。
- Google AdSense：网站获批后，在 AdSense 官方控制台查看广告展示与收益；Cloudflare page views 不等于广告展示次数。

## 旧功能下线

本次移除 `/admin/analytics`、`/api/admin/analytics`、`/api/analytics/events`、应用端自定义事件采集器，以及旧报表拉取服务。迁移 `0126_retire_product_analytics.sql` 会删除旧 `product_analytics_events` 表及其历史站内事件数据；任何需要留存的数据应在执行该迁移前备份。此操作不删除 Cloudflare、Search Console 或 AdSense 平台中的官方历史数据，也不影响新闻与事件正文。

生产发布仍按独立发布流程执行；合入 `develop` 不意味着自动发布到 `main`。
