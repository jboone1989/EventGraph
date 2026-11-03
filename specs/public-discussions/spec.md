# EventGraph · GitHub Discussions + giscus 公共讨论 Spec v0.2

> **2026-11-03 读者体验规则变更**：每篇公开新闻及其事件页均应自动展示讨论，无需点击“加载讨论”。复用已接入的 giscus，不自建评论系统。第三方配置与真实评论写入仍须独立验收。
> 2026-10-26 曾核实仓库公开并开启 Discussions，但这不等于已核实 giscus App 和分类配置。

## 边界与事实归属

- 讨论属于读者观点，不是已核实的事件事实；不得直接写入新闻事实层、知识图谱或模型训练材料。
- 继续使用官方 [giscus](https://github.com/giscus/giscus) + GitHub Discussions，不增加自建用户、评论数据库、OAuth、消息队列、审核后台或模型调用。
- 阅读文章无需 GitHub 账号；发表评论需要 GitHub 登录/授权。第三方被屏蔽、加载失败或断网均不能阻塞文章、导航、SEO 和证据链接。

## 页面与映射规则

- **每篇公开新闻详情**（`/items/:id`、`/en/items/:id`、原文/译文）：均展示**该条新闻自己的讨论**，与是否属于 Story、是否已有其他报道、是否被选中无关。以现有稳定的 `SiteItemDetail.id` 为键，giscus `specific term` 为 `eventgraph:item:<itemId>`。
- **同一篇新闻的各语言/正文变体**映射到同一 `eventgraph:item:<itemId>`；**不同新闻**即使归属同一 Story 也分别讨论，不能用 Story 的讨论代替新闻讨论。
- **事件详情**（`/story/:id`、`/en/story/:id`）仍有独立的 `eventgraph:story:<canonicalPublicId>` 事件级讨论；同一事件双语保持一个事件讨论，不能与某篇新闻的讨论混淆。
- 采用现有永久标识，不用标题或 pathname。只渲染已能正常访问的公开详情；非法/空标识不创建任意 Discussion，撤稿/失效页面维持现有不可访问行为。
- Giscus 仅在有读者首次发言时按其实际机制创建对应 Discussion；**页面浏览本身不应批量创建空帖**。不主动预建每条新闻的 GitHub 帖子。

## 默认展现与性能

- 不设置 `Load discussion / 加载讨论` 按钮：新闻和事件页面展示对应讨论区域并自动挂载 giscus。
- 保留当前 giscus `async` 脚本与 `loading="lazy"` iframe；异步加载不阻塞新闻首屏，手机不遮挡正文或工具栏。页面上保留直接前往 GitHub Discussions 的链接。
- 无有效 `VITE_GISCUS_CATEGORY_ID`、仓库 ID 或 giscus 配置时维持现有隐藏行为，不显示无法使用的空评论表单；不伪称已经完成外部配置。
- 中英文切换、文章间导航、浅色/深色切换应正常更新相应讨论；不得把一个页面的评论留在另一个页面。

## 治理与验收

- 权限使用 GitHub 原生的评论作者与仓库管理员规则；不声称用户能执行未经验证的删除、锁定操作。
- 继续遵守当前 AdSense 与事实/观点区分，不把第三方评论冒充编辑原创内容。

| ID | 读者可观察要求 |
| --- | --- |
| D-01 | 同 Story 两篇新闻分别有独立评论；新闻中英/原文版共享自己那一条评论；事件页独立于新闻。 |
| D-02 | 无 Story 的公开新闻也自动展示讨论；非法 ID 或失效详情不创建孤立讨论。 |
| D-03 | 页面无需点击按钮即可挂载 giscus；无评论时提供首评入口，已有评论时直接展示。 |
| D-04 | 主题、语言切换、SPA 换文章不串帖；移动端阅读不被 iframe 挡住。 |
| D-05 | GitHub/Giscus 不可用时正文可读，保留 GitHub 链接；无自建后端和自动预建空帖。 |
| D-06 | 部署后真实核查 category/App、GitHub 登录、发言/回复/权限，桌面及 390px 手机页面；未经核查不得宣称验收通过。 |

## 参考

- [giscus 官方](https://github.com/giscus/giscus)
- [giscus 配置](https://giscus.app/)
- [GitHub Discussions 管理](https://docs.github.com/en/discussions/managing-discussions-for-your-community)
