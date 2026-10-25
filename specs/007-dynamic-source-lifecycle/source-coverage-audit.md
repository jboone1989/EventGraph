# 信源覆盖审计 —— 事件链、地缘风险与市场传导（2026-10-25）

## 目的与口径

- 目标：评估本站对「事件链政策制裁贸易、军事冲突（双方+独立第三方）、海运物流、能源、网络、灾害、地区政治、多国媒体、企业供应链与 SEC 披露、金融市场」等领域的信源覆盖，找出缺口，给出可执行候选。
- **仓库配置 ≠ 实时采集**：`industry/sources.json`（develop 72 条）只是种子清单；「已注册」仅表示配置存在，不等于开发/生产库中已成功采集、已入库文章或已进入事件分组。真正的运行态要看各环境 `sources` 表与 `fetch_runs`。本文所有「已注册」都指 develop 分支配置，不声称任何线上采集成功。
- **单一媒体 ≠ 领域覆盖充分**：某领域只有一家媒体（哪怕是 BBC）不视为覆盖；一手官方来源与多家独立二手互相补充才算及格线。
- 直连抽查（下表「抽查」列）：2026-10-25 在 cn-dev 开发机直连出口上用 curl 对候选 URL 做的一次性 HTTP 探测（跟随跳转、普通 UA），**只证明当时网络可达性与内容形态，不是采集器兼容性或长期可用性证明**。`000=超时` 可能是本机出口对该站的问题，不代表站点失效。

## 全局结论（先读这个）

1. **事件链一手（制裁/出口管制/贸易政策）是最大缺口**：develop 上只有 EU Council 一个相关源。OFAC 无 RSS，USTR 有官方 RSS（今日抽查 200）。美国方向应走 Federal Register API（OFAC/BIS/USTR 文件全在，官方 JSON，免费），这是比抓网页可靠得多的一手管道。
2. **军事冲突"双方视角"完全没有**：develop 上没有俄罗斯/中东/冲突当事方官方或媒体源；PR#133 补了 6 家英文国防媒体（二手）与日本防卫省（一手）。第三方（联合国、红十字、ReliefWeb）只有 UN Geneva 一家。
3. **海运物流为零**：任何信源都没有。UKMTO 无确认 RSS；可用起点是 gCaptain（二手，今日 200）与 MARAD/NMFTC 公告（待测）。
4. **网络（CISA 等）全部被 Akamai 式 bot 拦截（403）**：当前采集器无法直接用；NVD API 2.0 可行但要免费 key（要授权）。
5. **能源只有 EIA**（美国一手数据）。IEA RSS 403、Ember 403；OPEC/JODI 待测或要 key。
6. **灾害已及格**：GDACS + USGS（均为一手 hot_signal）。缺人道灾情文本面，可补 UN OCHA/ReliefWeb。
7. **金融市场与央行覆盖最好**（Fed/SEC/BIS/ECB/BOJ/RBI/BOK/HKMA/FCA/St.Louis/BLS×4），但仍缺市场异动即时面（交易所公告/市场数据 API）。
8. **中国官方已有 PBoC/CSRC/MIIT/NBS**（注：PR#133 分支上的 3 条在 develop 已以 `rss-cn-{pboc,csrc,miit}-official` 存在，勿重复接入）；缺 MOFCOM（贸易战事件链必需）、NDRC、外交部。
9. **多国媒体**：develop 有 BBC×2；PR#133 待合并 8 家（Guardian/NPR/France24/AlJazeera/ArabNews/NPR/Diplomat + 3 家国防媒体，共 10 条）。Reuters/AP/彭博/Bloomberg 均无免费 RSS（要授权/无法用）。

## 分领域明细

### 1. 制裁（事件链一手）

| 现状 | 评估 |
|---|---|
| 一手 | 仅 `rss-eu-council-press`（EU 理事会新闻，含制裁决定）。缺美英日中全部制裁执行机构。 |

候选（一手优先）：

| 候选 | 地址 | 性质 | 状态 | 依据 |
|---|---|---|---|---|
| Federal Register API（OFAC/BIS/USTR 文件统一出口） | `https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=treasury-department-office-of-foreign-assets-control&order=newest` | 一手 JSON | **待测**（API 官方公开免费；今日参数拼错得 400，端点存在） | 用 `json_list` 接，免爬虫 |
| OFAC Recent Actions | `https://ofac.treasury.gov/recent-actions` | 一手网页 | **无法用**（无 RSS；`news.xml` 404；页面可作 DeepSeek Fetch 下阶段对象） | 今日抽查 404 |
| USTR 新闻 RSS | `https://www.ustr.gov/rss.xml` | 一手 RSS | **待测**（今日抽查 200, application/rss+xml） | 最好的贸易政策一手起点 |
| UK OFSI（HMT）制裁清单/OFSI 新闻 | `https://www.gov.uk/government/news.atom?departments[]=hm-treasury` | 一手 Atom | **待测** | gov.uk 全站标准 atom 接口，历史上稳定 |
| EU 制裁官方公报（OJ 制裁条例） | `https://eur-lex.europa.eu/rss-feeds/oj-content.html` 系列条目 | 一手 RSS | **待测** | EUR-Lex 有官方 RSS 列表页，需选定条例类目 |
| 日本 METI 安全保障贸易管制 | `https://www.meti.go.jp/english/press/` | 一手 | **待测**（METI 有英文 press 列表；RSS 需确认） | DeepSeek Search 可定域发现 |
| 中国 MOFCOM 公告（出口管制/反制） | `http://english.mofcom.gov.cn/news/` | 一手 | **无法用（仅网页）**：无官方 RSS，需 web_list 或 DeepSeek | 事件链（贸易反制）必需，优先想办法 |

### 2. 贸易政策与关税

现状：与领域 1 重叠（EU Council + USTR 候选）。WTO 官方 feed `news_e.xml` 今日返回 HTML（地址已变，**待测**）。美国海关 CBP、中国海关总署 GACC 数据均为网页/API 混合（待测）。缺口：双边关税行动的即时一手几乎没有——依赖 USTR/FR API 补齐后即可接受。

### 3. 军事冲突——交战双方官方

原则：冲突双方各自的官方叙事都要有（标注 publisherRole=organization、作为信号而非事实），加上独立第三方仲裁。

| 候选 | 地址 | 性质 | 状态 |
|---|---|---|---|
| 美国防部 press releases | `https://www.defense.gov/news/press-releases/` | 一手 | **无法用**（今日 403 bot-block；DVIDS 镜像 `https://www.dvidshub.net/rss/issue/…` 今日 200 但条目结构待核，**待测**） |
| 美中央司令部 CENTCOM 新闻 | `https://www.centcom.mil/MEDIA/PRESS-RELEASES/` | 一手 | **待测**（specs/006 已列为候选，未验证） |
| 日本防卫省（press） | PR#133 `rss-japan-mod-press` | 一手 | **待合并（PR#133 已预演验证）** |
| 台湾国防部（每日记者会/共机动态） | `https://www.mnd.gov.tw/`（English/PublishTable） | 一手 | **待测**（无确认 RSS，页面表格需 web_list；台海事件高价值） |
| 俄国防部（冲突方一手） | 无官方英文 RSS | 一手 | **无法用**；用 TASS 作"冲突方官方口径"代理（见领域 4 表） |
| 中国国防部 | `http://eng.mod.gov.cn/` | 一手 | **待测**（网页列表） |

### 4. 军事冲突——独立第三方、国防媒体与冲突方媒体

| 候选 | 地址 | 性质 | 状态 |
|---|---|---|---|
| UN News（全语种） | `https://news.un.org/feed/subscribe/en/news/all/rss.xml` | 一手（联合国） | **待测**（今日 404——路径疑变；news.un.org 存在 feed，需再核） |
| UN OCHA ReliefWeb | `https://reliefweb.int/updates/rss.xml`；API `api.reliefweb.int` | 一手/聚合 | **待测**（RSS 今日 202（CDN 特殊返回码）；旧 v1 API 410 Gone，新 API 需 appname 参数） |
| ISW 战况评估 | `https://www.understandingwar.org/backgrounder/feed` | 二手分析 | **无法用**（今日 403 bot-block） |
| Defense News / Breaking Defense / War on the Rocks | PR#133 `rss-defensenews-global` 等 3 条 | 二手 | **待合并（PR#133）** |
| TASS（俄方口径） | `https://tass.com/rss/v2.xml` | 二手（国家通讯社） | **待测**（今日 200 RSS；必须以「冲突方视角」标注，进 hot_signal） |
| Al Jazeera / Arab News | PR#133 | 二手 | **待合并（PR#133）** |

### 5. 海运物流（零覆盖，缺口最大之一）

| 候选 | 地址 | 性质 | 状态 |
|---|---|---|---|
| UKMTO 通报（红海/航运安全） | `https://www.ukmto.org/`（Reports 页） | 一手 | **待测**（无确认 RSS；今日猜的路径 404；specs/006 已列候选） |
| MARAD/NMFTC 海事安全公告 | `https://www.maritime.dot.gov/` | 一手 | **待测** |
| gCaptain | `https://www.gcaptain.com/feed/` | 二手 | **待测**（今日 200 WordPress feed） |
| IMO 新闻 | `https://www.imo.org/en/MediaCentre/` | 一手 | **待测**（无确认 RSS） |
| Freightos FBX 运价指数 | `https://fbx.freightos.com/` | 一手数据 | **要授权/待测**（公开页面有数据，API 商业授权） |
| Drewry WCI | `https://www.drewry.co.uk/` | 一手数据 | **要授权**（付费订阅） |
| 港口/运河运营方（巴拿马/苏伊士） | 各官网 notices | 一手 | **待测**（事件驱动型，适合 DeepSeek 发现后临时接入） |

### 6. 能源

现状：`rss-eia-energy` + `rss-eia-press`（美国一手，已注册）。缺口：国际面（IEA/OPEC）与价格异动。

| 候选 | 地址 | 性质 | 状态 |
|---|---|---|---|
| IEA 新闻 | `https://www.iea.org/news` | 一手 | **无法用**（今日 RSS 猜测路径 403；官网 Akamai 拦截风险高） |
| OPEC 新闻 | `https://www.opec.org/opec_web/en/press_room/` | 一手 | **待测** |
| JODI 油气数据 | `https://www.jodidata.org/`（API） | 一手数据 | **要授权**（免费 key，需注册） |
| EIA 已有 | — | 一手 | **已注册** |

### 7. 网络

现状：零覆盖。

| 候选 | 地址 | 性质 | 状态 |
|---|---|---|---|
| CISA 通告 | `https://www.cisa.gov/cybersecurity-advisories/all.xml` | 一手 | **无法用**（今日 403 Akamai；下阶段用 DeepSeek Fetch 或官方 email/替代分发） |
| NVD API 2.0 | `https://services.nvd.nist.gov/rest/json/cves/2.0` | 一手数据 | **要授权**（免费 API key，无 key 限速 5 请求/30s，勉强可用） |
| NCSC UK | `https://www.ncsc.gov.uk/section/feeds` | 一手 | **待测**（今日猜的 API 路径 404；官方 feeds 页存在） |
| BSI（德） | `https://www.bsi.bund.de/` | 一手 | **待测**（德语为主） |
| BleepingComputer / The Hacker News | `https://www.bleepingcomputer.com/feed/` 等 | 二手 | **无法用**（今日 403 / feedburner 从本机出口超时） |
| CERT-EU / Enisa | `https://www.enisa.europa.eu/` | 一手 | **待测** |

### 8. 灾害与人道

现状：**及格**。`rss-gdacs-disasters-24h`、`rss-usgs-earthquakes-m45`（一手 hot_signal，2026-10-25 已按 specs/006 实机验证解析）。缺：人道灾情文本与气象。
候选：NOAA NWS alerts API `https://api.weather.gov/alerts`（一手，今日抽查 200 geo+json，**待测 json_list 接入**）；ReliefWeb（见领域 4）；EMSC 地震（USGS 已覆盖，勿重复）。

### 9. 地区政治与多边机构

现状：EU Council + UN Geneva（一手）+ BBC World/Politics（二手）。
候选：UNSC 制裁委员会报告（`https://www.un.org/securitycouncil/`，待测）；ASEAN 秘书处新闻（`https://asean.org/`，待测）；非盟（`https://au.int/`，待测）；Pacific Islands Forum（待测）。原则：多边机构一手优先于媒体转述。

### 10. 多国媒体（英文区域矩阵）

现状：BBC×2（已注册）；PR#133 待合并 10 条含 Guardian/NPR/France24/AlJazeera/ArabNews/NPR/Diplomat/3 国防媒体。
缺口（按「同一事件多区域视角」要求）：半岛之外的南亚（Yonhap `https://en.yna.co.kr/RSS/news.xml` 今日 200，**待测**）；东南亚（Straits Times 待测）；德语区（DW `rss.dw.com` 本机超时，**待测**）；日本 NHK World（今日超时，**待测**）；俄区（见 TASS）；Reuters/AP/Bloomberg/FT（**要授权/无法用**，无免费合法 feed，不抓）。

### 11. 中国官方与中文媒体

现状（develop 已注册）：PBoC/CSRC/MIIT/NBS×2（一手）+ 中新网×4/量子位/IT之家/PANews×2（二手）。**注意 PR#133 分支的 pboc/csrc/miit 3 条与 develop 已有 ID 重复（#121 已改用 develop ID），合并时勿双开。**
缺口：MOFCOM（贸易事件链必需，无法用/需 web_list）、NDRC（待测）、外交部（`https://www.mfa.gov.cn/eng/`，待测）、国家能源局（待测）、财新/第一财经/金十（待测，部分要订阅）。Binance/OKX 行情已有原生 API 路线（specs/006），不假造 RSS。

### 12. 企业供应链与 SEC 披露

现状：`rss-sec-press`（SEC 新闻稿一手，已注册）。
缺口：**EDGAR 全文检索 API**（`https://efts.sec.gov/LATEST/search-index?q=…`，一手 JSON，今日抽查 200，**待测 json_list 接入**——这是「供应链中断/风险因子」披露的一手管道，比任何媒体都快）；DSCA 对外军售通报（`https://www.dsca.mil/`，今日超时，**待测**）；FedEx/UPS/Maersk 等运营方 IR 公告（事件驱动，适合 DeepSeek 发现）；标普/穆迪评级 action（**要授权**）。

### 13. 金融市场与央行

现状：**覆盖最好**。Fed/SEC/BIS×2/ECB×2/St.Louis Fed/BLS×4/BOJ/RBI/BOK/HKMA/日本FSA/FCA（一手）。
缺口：交易所层面异动公告（NYSE/NASDAQ 公司新闻 wire 多为付费；**要授权**）；CME/ICE 保证金调整通知（待测）；IMF 新闻+研报（`https://www.imf.org/en/News`，待测）；FOMC 日历（Fed press 已可覆盖大半）。优先级低。

### 14. AI 与加密（站点本业）

现状：AI 厂商官方×10+、研究×4、媒体×5、从业者×2、社区×3；加密媒体×6+官方×3。**基本充分**，本文不展开；动态生命周期上线后按同一评分自然淘汰冗余。

## 与动态生命周期的关系

上表「待测」项即 `specs/007-dynamic-source-lifecycle/spec.md` 中 preflight→preview→T2 试运行的输入队列；「无法用」项（OFAC 页面、CISA、defense.gov、ISW）是 PR#132（DeepSeek Search/Fetch，未合并）之后的下阶段发现对象；「要授权」项一律不做绕过，留给运营者决定是否购买/注册。本文不把任何候选直接写进 `industry/sources.json`——那是预演验证后的动作。
