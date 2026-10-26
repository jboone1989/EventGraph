# 跨 Story 长期演化实验 · Search Before Build 研究记录

> 2026-10-26；只读检索 + ChatGPT/Claude Opus 5.5 独立评估。**研究证据，不是实施授权或选型结论的性能测试。**
> 对应草案 [spec.md](spec.md)；产品原则 [docs/product-thesis.md](../../docs/product-thesis.md)；已有影响追踪 [specs/event-impact-tracing/spec.md](../event-impact-tracing/spec.md)。

## A. 用户已确定的边界

- 首页 `/` 保持现有新闻流与结构，是流量入口；`/items/:id` 新闻详情页继续承担搜索获客，保持现有索引/canonical 策略；`/hot`（现有 UI 中称 EventTree）实质是 48 小时热点榜，暂不改。
- 研究目标：检验不同独立 Story 在跨周/月时间线上分叉、汇聚以及状态改变是否能被读者理解，不把共现或时间先后画成因果。用现有 `/explore` 试验，不新建第二个探索台。
- 先小样本真实来源人工策展，后评估跨 Story 自动发现；当前不实施新图引擎、不开发新爬虫、不加 Agent/LLM 页面调用。

## B. 2026-10-26 实际仓库检索

| 能力 | 复用位置（develop） | 结论 |
| --- | --- | --- |
| 新闻事实、源 ID、公开限制 | `packages/backend/src/publication/`、`facts`、`stories`、`publications` | 权威公开来源继续唯一 publication 读层，不能直接将内网/撤稿内容嵌入实验 |
| 单个 Story 逐站路线和原文 | `packages/backend/src/publication/story-route.ts`；`/api/site/stories/:id/route` | 每条案例轨道引用已有路线，不复写事实提取 |
| 单 Story 回放与 known/valid | `apps/web/app/features/story/EventTimeMachine.tsx`、`EventExplorer.tsx`、`explore-state.ts` | 复用时间口径和交互，不创第二份独立 asOf 状态 |
| 事件入口、工作台 | `apps/web/app/routes/story.tsx`、`explore.tsx` | 允许在既有 `/explore` 中试 `?case=`，保留 `?story=` |
| 实体图/互动布局 | `apps/web/app/components/KnowledgeAtlasCanvas.tsx` + 已安装 Cytoscape 3.33.1 | 关系检视沿用原 Atlas，不额外引入关系图渲染器 |
| 人工策展模式 | `site/topic-briefs.ts`、`packages/backend/src/publication/gallery.ts` | 借鉴现有少量人工配置和公开读取路径，不先建数据库表 |
| 上游 AIHOT | `KKKKhazix/AIHOT` 的 `packages/backend/src/events/group.ts` | 同次发生/直接发展聚合仍在原有边界，**无**可直接搬的多 Story 演化引擎 |

当前仓库 `apps/web/package.json` 包含 React Router、React 和 Cytoscape，**不包含** React Flow、vis-timeline 或 TimelineJS3。

## C. 成熟替代方案与许可（Search Before Build）

| 项目 | 官方/源代码 | 能补的能力 | 是否采用 |
| --- | --- | --- | --- |
| Cytoscape.js（已安装） | https://js.cytoscape.org/ | 有向/复合/多重关系、viewport 和布局 | **复用现有图谱**；不强迫其承担时间轴 |
| vis-timeline | https://github.com/visjs/vis-timeline ; https://visjs.github.io/vis-timeline/examples/timeline/ | 分组轨道、范围、缩放、滚动与多时间尺度；MIT/Apache-2.0 | **保留第二阶段候选**；只有小组件被证明不够，且不产生双时间状态时才引入 |
| NewsLines 新闻叙事原型 | https://github.com/marianafcosta/news-story-viz ; https://ceur-ws.org/Vol-3370/paper4.pdf | 有新闻事件/参与者/互动模块的 storyline 原型，MIT | 借鉴呈现与阅读实验，**不复制整套 D3 应用**；其交汇不等于因果 |
| React Flow | https://reactflow.dev/ | 流程节点、拖放、边、缩放，MIT | **不引入**，重复已有 Cytoscape 的交互职责 |
| TimelineJS3 | https://timeline.knightlab.com/ ; https://github.com/NUKnightLab/TimelineJS3 | 线性故事幻灯、JSON/Sheets 导入 | **不引入**，不擅长多轨并存且带来第二套阅读控件 |
| iStoryline.js | https://github.com/tangtan/iStoryline.js | 复杂交汇排版（研究工具），Apache-2.0 | 仅参考；两三条轨道不值得接新布局引擎 |
| ELK.js | https://github.com/kieler/elkjs | 层级有向图自动布局 | 不引入；只管布局不管证据，且徒增依赖 |
| EventKG / Open Event KG | https://eventkg.l3s.uni-hannover.de/ ; https://arxiv.org/abs/1804.04526 | 事件中心与时间关系的研究/外部资源 | **作为知识表示参考**，不自建镜像数据平台 |
| W3C PROV-O | https://www.w3.org/TR/prov-o/ | 归属、来源、修订与派生的成熟语义 | 借鉴最少出处字段；不提前重构全站为 RDF |

学术参考：新闻多轨和线路地图不是首创，参见 https://arxiv.org/html/2009.04508v2 、https://ceur-ws.org/Vol-3370/paper4.pdf 。这些都是**视觉/叙事参考**，不能替代事实检验和因果归属。

## D. 独立反方结果及选择

Claude Opus 5.5 的意见：现有 UI 和数据层足够支持小型实验，避免引入库只为了画 2–3 条线。仅需极薄的可读多轨布局（静态 CSS 或少量 SVG），复用现有 Timeline/StoryRoute；如果演变成多月、多站、缩放/平移，优先采用成熟 vis-timeline，而不是自己写时间轴。ChatGPT 同意，但强调案例**至少包含两个独立 Story**，不能仅美化单 Story 时间线。

首轮不需要新数据库和自动因果发现。人工案例只证明阅读表达是否有用，**不能**证明自动抽取有足够精度；这两个实验需要分开。

### 否决条件

1. 找不到两个真实且独立的公开 Story 与可打开的交叉证据 → 不硬凑所谓分叉/汇聚。
2. 无原始证据的连接不画；来源声称只标为主张，不能标为事实因果；模型候选不得直接进入公开连线。
3. 三个时间维度不得混同（发生/生效、发布/首次收录、解释首次提出）。现有历史回放属于**有界重建**，不要伪称精确历史快照。
4. 不增加第二套搜索、图谱、时间控制、持久化数据或新闻归组；不在页面交互中调用 LLM。
5. 不改首页、热点榜和新闻详情页的现有搜索入口；实验页保持 noindex、不进 sitemap 或主导航。
6. 不因 demo 可视化好看就声明产品成功；必须测读者准确理解、错误因果归因，并单独测未来自动候选发现。

## E. 最小实验的建议（不是已完成验收）

先选择 1–2 个可核实且不同时间尺度的案例，各含 2–3 条独立 Story 线。利用公开 StoryRoute 整理事实站点；人工为少量明确的跨线联系写类型、证据 URL、主张者及发布/记录时间。共用一个时间位置，以既有 `/explore?story=` 深链进入完整证据。

**组件选型检查点**：先用极薄布局呈现这些固定案例；如果要自写滚动缩放/多级聚合/碰撞排布，立刻重新评估 vis-timeline 或已有 Cytoscape 能力，不扩展成自制图形库。下一阶段是否正式增加数据表、Provider 任务或可索引态势页，完全取决于独立实验与新的已批准 Spec。
