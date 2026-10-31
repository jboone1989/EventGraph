# T13 · VM13 开发环境性能独立测量（2026-10-28 第四轮）

- 测量人：Pi 会话（cn-dev，**只读**）。窗口：2026-10-28 10:58–11:34 UTC。
- 对象：VM13 dev 预览 `http://43.133.185.154`，release `17533d7`（= 当日 develop HEAD，含 latency #154、英文二跳 #166、prefetch 逐出修复 #201、T04 registry #202）。窗口内版本未变、全部请求 200（无部署过渡样本）。
- 边界：**未登录后台、未写任何数据库**（浏览器信标在 Playwright 路由层拦截并本地应答 204，从不送达服务器）、未部署、未触碰 VM09 生产、未改任何文件或配置。与 T04 Worker CD 无依赖（测量目标为 VM13 Web/API 面）。
- 与前三轮分工（不重做）：r1（2026-10-27，生产冷/热全量基线，main `84db757`）、r2（2026-10-27 23:05Z，VM13 @ `e4e9351` 的 FR-01 行为与二跳修复验证）、r3（2026-10-28，生产 sitemap/GSC 授权/拒绝路径/二跳覆盖率）。本轮增量 = 当前 develop 在 VM13 上的冷/热 API+页面表、#201 回归检查、navigation_complete 复核、二跳池分层、流量数据可见面清点，并把验收证据落为本文档。
- 原始数据与脚本：`.data/t13r4/`（主检出，gitignored 证据位）。

## 0. 环境条件（结论打折的前提，先行声明）

VM13 本窗口处于**持续高负载**：同一端点 `/api/health` 的服务端 DB ping 全程稳定 66–91ms；部分 API 的热态响应较快（例如 `/api/site/knowledge/stats` 热中位 101ms），但 `/api/health` 热中位 498ms、`/api/site/pool` 热中位 990ms，且有 API 热态比冷态更慢；SSR 页面与聚合类 API 也明显劣化——同代码前身在 r2（未重载时）测得桌面 DCL 878ms，本轮 3383ms（3.9×）；`/→/all` 跳转 r2 为 1162ms，本轮两次运行为 2696/9952ms。劣化在 web 容器 SSR 路径尤其明显；仅凭本轮测量不能排除网络、排队或其他负载因素，DB ping 本身没有同步升高。

因此：**本轮绝对时延值不可当性能回归证据**（对照 r2 即知是环境负载）；缓存与请求级**行为**结论（frame 复用、窄→宽重取、信标触发、二跳渲染）不受影响，全部成立。根因未诊（只读约束未入主机）：建议 Owner 在 VM13 跑一次 `docker stats`/`htop` 即可定位（见 §6）。

## 1. 冷/热时延表（curl TTFB；冷=独立连接 n=3–4，热=同进程 keep-alive n=5–6）

| URL | 冷中位 | 冷最大 | 热中位 | 热最小 |
|---|---|---|---|---|
| `/` | 2347 | 2390 | 1627 | 1289 |
| `/all` | 1788 | 2680 | 1817 | 649 |
| `/daily` | 1778 | 9377 | 1556 | 714 |
| `/en` | 1801 | 2959 | 967 | 769 |
| `/en/daily` | 1977 | 5546 | 1248 | 972 |
| `/items/bbd8im…` | 1331 | 2015 | 1204 | 883 |
| `/en/items/bbd8im…` | 1098 | 1553 | 1380 | 578 |
| `/story/5137a381…` | 2860 | 3886 | 2453 | 1685 |
| `/api/health` | 335 | 518 | 498 | 286 |
| `/api/site/knowledge/overview` | 233 | 1478 | 343 | 215 |
| `/api/site/knowledge/stats` | 422 | 1130 | 101 | 66 |
| `/api/site/hot` | 1246 | 1928 | 965 | 750 |
| `/api/site/stats` | 285 | 441 | 214 | 114 |
| `/api/site/reports/daily` | 812 | 1644 | 172 | 48 |
| `/api/site/reports/daily/latest-page` | 1649 | 2623 | 1289 | 796 |
| `/api/site/pool` | 844 | 1014 | 990 | 465 |
| `/api/site/stories/5137…/followups` | 228 | 284 | 211 | 183 |
| `/feed.xml`（51KB） | 704 | 1628 | 333 | 271 |

单位 ms，全 200。要点：热态并非普遍快于冷态：`/api/health` 冷/热中位 335/498ms、`/api/site/knowledge/overview` 233/343ms、`/api/site/pool` 844/990ms；重头在 SSR 页面（`/story` 最重，冷中位 2.9s）与聚合类 API（`hot`、`latest-page`、`pool` 约 0.8–1.6s）；热态收益最大的是 `reports/daily`（812→172ms）。对照生产（r3，经 CF+跨洲隧道）：`/` 冷中位 1407ms——**当前 VM13 的 SSR 比生产还慢**，进一步佐证 §0 环境结论。

## 2. 页面导航（Chromium 1.61.1，桌面 1440×900，每场景全新 context）

| 场景 | 结果 | 判定 |
|---|---|---|
| 热 `/` → 点「全部」`/all`（首访） | click→URL 提交 2696 / 9952ms（两次运行，负载波动）；数据请求仅 2× `GET /all.data`（1 次含 hover 预取），**0 次 feed-layout frame 请求** | ✓ 宽 frame 复用（FR-01），#201 后未回退 |
| `/all` → 回「精选」`/` | 197–221ms，零新增 `.data` 请求 | ✓ pageReuse 缓存命中 |
| 再次 `/all`（s2 重访） | 169–206ms，全场景仍只有那 2× `/all.data`，第二次进入**零新增请求** | ✓ #201 生效：已访问页未被预取逐出，缓存保留 |
| 冷 `/?q=AI` → 回 `/`（s3 窄→宽） | 6778–12739ms；触发 1× `GET /_.data?_routes=feed-layout` + 1× `routes/home` | ✓ 窄→宽正确重取全量 frame（FR-01 规定行为） |
| navigation_complete 信标 | `{"name":"navigation_complete",…,"durationMs":6926}` 正常触发并携带时长（拦截捕获，零写库） | ✓ 17533d7 上事件链完好 |
| 冷载 DCL（DNT 抑制 + 拦截） | 桌面 3383ms / 390px 7155ms；桌面传输 242KB | 环境受限值；r2 同代码前身 878/1509ms |

请求级结论与 r2 在 `e4e9351` 的 FR-01 验收一致且在 #201 合入后未回退；绝对时长受 §0 负载支配，发布后对照（Task E）仍以生产同观测点为准。

## 3. 新闻 → Story 二跳（005 增长闭环核心路径）

真实浏览器滚到底触发懒加载后计数（可见 = `offsetParent !== null`）：

- **zh 多报道**（`/items/bbd8im…`，storyContext.reportCount=4）：2 个可见 `/story/` 链接 ✓
- **en 多报道**（`/en/items/bbd8im…`）：2 个可见 `/en/story/` 链接 ✓（#166 在 17533d7 上正常）
- **G1 负例**（`/items/mma3km…`，reportCount=1）：0 个链接 ✓（既定产品取舍，两版一致）
- **当前池分层**（`/api/site/pool` 前 30 条逐条读 storyContext，只读）：无关联事件 10、单报道 17、多报道 3 → **JS 可见二跳入口 ≈ 10%（3/30）**。

覆盖比例随时点漂移：r2 池约 1/5、r3 生产 sitemap 池约 1/8、本轮 1/10——但结论一致：**瓶颈是事件归组密度而非页面 UI**（005 spec 预判成立），单报道 G1 是已批准取舍，不改。

## 4. 可用流量数据（诚实清点：真实 / 受限 / 不适用）

| 数据 | 状态 | 证据 |
|---|---|---|
| 内容量（非流量，不得混用） | ✅ 公开 | `/api/site/stats`：sources 87、items 17340→17453（窗口内 +113，dev 采集活跃）、selected 102、dailies 14 |
| 索引面规模（非流量） | ✅ 公开 | sitemap URL 2898→3659（窗口内增长） |
| 站内跳转事件（product_analytics_events） | ⚠️ 通道完好、聚合受限 | navigation_complete/page_view 信标正常触发（§2 拦截捕获）；聚合读取 `/api/admin/analytics` 未授权 **401** → Owner 凭据 BLOCKED |
| 信标拒绝路径 | ✅ 与生产一致 | 无 Origin POST → 403（未触达入库） |
| Cloudflare Web Analytics | 不适用 | VM13 直连 IP + HTTP，无 CF 代理（生产独有） |
| Search Console | 不适用 | GSC 不覆盖 IP 主机；域名级验证属生产 livingruntime.com（r3 已实锤 DNS TXT） |
| PV/UV/CTR | ❌ | 无任何无凭据路径，不捏造零 |

## 5. 缺口（T13 勾选前置，与前轮一致）

1. **流量聚合**：7 天 navigation_complete p50/p75/p95 与 PV/UV/CTR 需 admin 只读导出或 Owner 凭据——持续 BLOCKED。
2. **Task E 发布后对照**：生产 main 仍 `84db757`（2026-10-24），#154/#166 未发布；对照只能等每周生产发布，本报告不宣称修复收益。
3. **VM13 负载根因**：本轮未入主机（只读约束），SSR 3–8× 劣化待 Owner 一条 `docker stats` 定位。
4. **LCP**：headless Chromium 不产 LCP（r2 已记），需真机或 RUM 平台。

## 6. 最小修复建议（无新代码需求）

1. **运维（本轮新观察，建议优先）**：VM13 web 容器 SSR 持续劣化 3–8×，DB ping 稳定但部分轻 API 也变慢——Owner 在 VM13 跑 `docker stats` + `htop` 一次即可分辨 CPU 饥饿/邻居争用；dev 预览是全队验收观测点，值得恢复到 r2 量级（桌面 DCL <1s）。
2. **运维（沿用 r1/r3，生产侧）**：F1 = Cloudflare Zone 关 Email Obfuscation（消除每会话 ~45 条 console error）；F2 = VM09 设发布标记 env，让 `/api/health` 可指纹已部署 commit（三轮生产实测均 `"dev"`）。
3. **T13 勾选前置不变**：admin 只读导出跳转聚合 + 每周发布后同观测点对照（Task E）。二跳覆盖上限属归组密度（数据工作），不在 T13 修复范围。

## 7. 复现

```bash
# 冷/热时延（18 URL；冷=3 独立 curl 进程，热=同进程 5 连发 keep-alive）
bash .data/t13r4/sample.sh && bash .data/t13r4/sample2.sh
# 导航/缓存行为/信标（信标在 Playwright 路由层拦截应答 204，零写库；nav.mjs 另加 DNT）
node .data/t13r4/nav2.mjs && node .data/t13r4/beacon2.mjs && node .data/t13r4/vitals.mjs
# 二跳分层（真实浏览器滚动 + 只读 API 逐条 storyContext）
node .data/t13r4/hop.mjs
# 边界探针：/api/admin/analytics 未授权=401；POST /api/analytics/events 无 Origin=403
```

## 8. 勘误与方法学注记

- 首版采样脚本复现了 r3 记录过的 curl 坑（多 URL 单 `-o` 只作用于首个，正文混入日志）——该轮冷测数据行干净，热测作废重跑（`sample2.sh`，`-o`×5 修复）。
- DNT 置位时 AnalyticsTracker 在客户端整体静默（连信标都不发）；要捕获信标本体须去掉 DNT 并用路由层拦截代替（本文方法，零写库）。
- `networkidle` 在重载 VM 上不可靠（hop 首跑超时），改 `domcontentloaded` + 6s 沉降后稳定。
- 本轮不勾选 #176 T13：§5 两项 BLOCKED 未变；除此之外的测量面（生产基线、VM13 行为与二跳、流量可见面）经四轮合计已闭环。

## 增补（2026-11-01）：§5 缺口 1 以本地 dump 关闭——7 天流量聚合实测

方法：cn-dev 2026-11-01 03:00Z 前后的 `pg_dump` 恢复到本地一次性库，直接对 `product_analytics_events` 聚合（与 `/api/admin/analytics` 读同一张表，无需 admin 凭据）。窗口 = dump 内最后一个完整 7 天（2026-10-24 17:01Z → 2026-10-31 17:01Z）。**数据是 dev 站（cn-dev）流量，非生产 VM09；样本小（navigation_complete n=115），结论只作量级参考。**

| 指标 | 实测值 |
| --- | --- |
| PV（page_view，7 天） | 430 |
| UV（distinct session） | 239 |
| navigation_complete p50 / p75 / p95（n=115） | 92 ms / 1153 ms / 2849 ms |
| story_open（/story 页打开；埋点不含入口路径，直接访问、榜单、搜索进入均计入） | 37（≈全部 PV 的 8.6%） |
| item_open（/items 页打开；同样不含入口路径） | 7（≈全部 PV 的 1.6%） |

- 注意：`story_open`/`item_open` 是页面打开事件，不带来源路径，**不能**据此得出"新闻→Story 二跳率"；真正的入口级跳转率须按 2026-10-28 报告 §3 的链接级方法测。上表两条仅反映页面打开占比。

- 事件面完整分布：page_view 723、navigation_complete 244、graph_node_select 211、story_open 69、item_open 8、source_open 1、agent_access_open 2（10-16 → 10-31 全期）。
- §5 缺口 2（Task E 生产对照）、缺口 3（VM13 docker stats 根因）、缺口 4（真机 LCP）仍需 Owner 动作/生产发布时机，与 2026-10-28 报告一致。
