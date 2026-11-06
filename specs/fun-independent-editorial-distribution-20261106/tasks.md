# 今日整活 · Implementation Work Items（EventGraph 范围）

**Spec:** [spec.md](./spec.md)
**Plan:** [plan.md](./plan.md)
**Status:** Draft；当前只修订职责，不得依据旧 Spec 把 EventGraph 自动生成流水线入队。

## Scope guard

EventGraph 的 GitHub Projects / GH-AW Agent 只实现**栏目展示与已有作者投稿边界**，不实现 Ferro 的选题、写作、Omnipost 客户端或 Evolution Engine。Ferro 端的三种内容类型与工作循环归 Ferro 自身项目，不由此 Spec 的 Work Items 触发。每项任务独立 PR，引用已合入 develop 的不可变 Spec SHA。先 Search Before Build，不重复创建正在实现的同类 PR。

## Work Items

### T001 — Add original Fun column using existing authored-content facilities
**Scope:** 用已有网站路由、研究/作者后台与媒体公开读取层实现 /fun、/fun/:id 及最薄的草稿/已发布/撤回内容承载能力，不新增自动创作作业。
**Depends on:** none
**Acceptance:**
- 有来源、作者、作品 ID/revision、短评正文、可选新闻图片与公开 URL 的整活作品能通过现有管理员鉴权/审计模式保存、更新、公开及撤回；已隐藏/未公开作品不在公共 API、页面或 sitemap。
- /fun 与 /fun/:id 在桌面/手机可读，链接回原始事件/新闻，有图正常展示、无图可以纯文本呈现；无发布内容时不显示首页空组件。
- Ferro 不可用、Omnipost 失败和图片 URL 无效时，EventGraph 新闻分析、分组和发布路径不受影响。
- 不新增 fun.discover/fun.compose/fun.distribute、pg-boss 定时创作、模型评审、自动推荐或复杂用户系统；聚焦 web/API/DB 回归测试通过。

### T002 — Reuse a shared Ferro authored-artifact publication interface
**Scope:** 让经过授权的 Ferro 产物在 EventGraph 被受控保存并产生可靠发布回执；复用现有研究稿件提交模式，最小化扩展，不建第二套 agent-auth 或发送系统。
**Depends on:** T001
**Acceptance:**
- 能用 `artifact_id + revision + content_kind` 幂等关联内容草稿、最终公开状态、作者、原始来源与稳定公共 URL；失败/重复提交不产生额外公开作品。
- 研究稿件沿用现有 modules/research 的 method/source/author/published 规则，不从 fun 类型的短评自动转成研究事实；不建立第二套研究页面或 LLM 生成器。
- 缺少可用的受控 Agent 写入能力时，保留现有管理员发布接口作为实际可行路径，报告 Ferro 端集成缺口，不能冒称已经打通自动投稿；与相关 worth Spec 的公共 author 接入避免重复实现。
- 只有已确认 EventGraph 的发布回执/URL 可作为 Ferro 后续 Omnipost 分发的前置条件；无后端调用 Omnipost，无独立平台发送 job。
- 已有新闻分析、发布、后台研究、来源审计功能回归通过，并有非法来源/鉴权/重复修订的聚焦测试。

### T003 — Surface confirmed channel receipts without building distribution workers
**Scope:** 可选复用已有统计/后台字段呈现 Ferro 回填的实际确认渠道链接和简单回流结果，保持事件与独立作品状态清楚分离。
**Depends on:** T002
**Acceptance:**
- 对指定 artifact revision 展示已有可确认的渠道 URL/ref 和明确状态，未知结果标记 unverified，未支持图文渠道标记 manual_required，不能仅根据请求已发送就显示成功。
- Ferro 侧 Omnipost 保留唯一发送执行权；EventGraph 不实现社交 API、图文上传、重试队列或单独 Omnipost 客户端。
- 站点可以区分真实可得的页面浏览、社交回流和明确录入的收益；未知收入显示未知，不把点击数推算为收入。
- 渠道部分失败或重复回执不会更改已发布作品/新闻；测试验证不盲目重复发送、不污染新闻运维数据。
