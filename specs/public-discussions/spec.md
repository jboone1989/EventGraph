# EventGraph · GitHub Discussions + giscus 公共讨论 Spec v0.1

> **最薄前端试验已开发，外部配置与实际验收未完成**。补回 2026-10-25—26 讨论：围绕一个公共事件保留读者观点，不自建评论系统。完整产品逻辑见 [产品纪要](../../docs/product-review-2026-10-25-26.md)；新闻解释见 [新闻解释草案](../news-explainer/spec.md)。
> 2026-10-26 GitHub repo API 已核实 `has_discussions: true` 且仓库公开；**不代表** giscus 已安装或网站已启用评论。

## 边界和事实归属

- 讨论作为 **观点交流区**，新闻/事实/原文、事件路线、证据更正仍保存在 EventGraph 的 publication/PostgreSQL/Graphiti 基础层，Discussion 内容不得自动被当成事实、事件、模型训练资料或编辑审定内容。
- **复用现成 GitHub Discussions + [giscus](https://github.com/giscus/giscus)**，不增加用户注册/密码、评论数据库、实时推送、点赞服务或自建后台管理。
- 正常读新闻无需 GitHub 账号；评论需要 GitHub 登录/授权。第三方无法加载时新闻、Story、SEO 和证据仍正常显示。

## 映射规则：同一事件、一个公共讨论

- 以 **稳定的 canonical Story publicId** 而不是页面 URL 或标题作为公共讨论键；一个 Story 相关的多篇新闻，以及 `/story/:id`、`/en/story/:id` 和相关的 `/items/:id`，应加载同一条 Discussion。
- 优先试验 giscus 官方的 `specific term` 映射模式，使用命名空间化的 ID（如 `eventgraph:story:<publicId>`）；真实测试匹配唯一性、同事件中英两版一致性和自动创建行为。不要对同一事件的每条新闻按 pathname 分别创建讨论。
- **尚未归组的文章**、Story 合并/重定向、撤回或不公开的内容，必须在实施 Spec/测试中确定链接行为：允许暂不显示讨论，不能胡乱映射、不应创建孤立无主讨论。
- 点击“讨论”不应遮盖新闻正文或手机导航，也不能让页面在初次加载时为了第三方脚本/授权而明显阻塞；评论区适当延迟加载并保留跳转 GitHub Discussion 的出口。

## 权限与社区治理

- 使用 GitHub 原生 Discussion 分类、giscus App、GitHub 维护者审核工具，不允许无出处的“作者本人才能删除所有评论”权限承诺。
- 维护者/管理员拥有删除、锁定和其他审核权限；读者可以管理自己有权限的内容。哪些人能删除或编辑哪些帖子必须以 GitHub 当前权限测试为准。
- 讨论区包含读者自由观点，**与编辑核实的事实分离**。页面注明 GitHub 登录门槛，第三方服务规则和适当的隐私告知。
- 任何展示广告的页面遵循现有 AdSense 与编辑政策，不将评论数、嵌入页字数冒充可收录的原创文章价值。

## 建议验收（实施前需再次确认）

| ID | 读者可观察要求 |
| --- | --- |
| D-01 | 同一 Story 的中文、英文、两篇相关公开新闻，进入**同一** GitHub Discussion；其它 Story 不串帖；合并后的 canonical 规则可复现。 |
| D-02 | giscus 仅在具备有效、公开 Story 身份时嵌入；无 Story/撤稿内容不渲染错误讨论；无 GitHub 登录的读者仍能读新闻。 |
| D-03 | GitHub 配置、App、category、Repo ID、category ID 真实核验；提交评论 / 回复 / 作者操作 / 管理员操作 / 举报或锁定按 GitHub 原生权限验证。 |
| D-04 | 讨论关闭、GitHub 无响应、第三方加载缓慢不影响正常阅读、可索引内容、现有导航和移动端布局；不在站点运行服务器端 GitHub 账号 OAuth。 |
| D-05 | 无新评论表、消息队列、讨论镜像入图、专有审核面板；引用原 GitHub Discussion，不把讨论当已证实证据。 |
| D-06 | 在浏览器实际验证读者从新闻/Story 找到讨论的路径，语言切换保持讨论键；不对互动增长做无数据保证。 |

## 已调研官方资料

- [giscus 官方 README](https://github.com/giscus/giscus)（GitHub Discussions 存储，特定 term / pathname 等映射，首评创建，需 GitHub 授权）
- [giscus 页面与讨论配置](https://giscus.app/)
- [GitHub Discussions 管理](https://docs.github.com/en/discussions/managing-discussions-for-your-community)
- [GitHub Discussions moderation](https://docs.github.com/en/discussions/managing-discussions-for-your-community/moderating-discussions)

首次实现：在公开 Story 和具备 Story 上下文的新闻详情中共用 `eventgraph:story:<canonicalPublicId>`，读者点击才加载官方 giscus。无有效 Story ID、或未配置 `VITE_GISCUS_CATEGORY_ID` 时不显示讨论入口。GitHub 仓库已确认公开且启用了 Discussions；节点 ID 为 `R_kgDOVHEeYA`。**尚须核对 Discussion 分类 ID、giscus App 安装、真实评论写入、权限与移动端浏览器**，D-03/D-06 不得写成已验收。
