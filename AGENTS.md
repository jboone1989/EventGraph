# 给 Agent 的说明

这是一个行业热点网站的框架：采集信源、用模型筛选和写作、归组事件、出日报周报月报，并通过网站、RSS、公开 API、Agent Markdown 和 MCP 对外提供。默认配置是一个 AI 行业的示例站。先读 README，再按任务读 `docs/` 里对应的文档。

## 最常见的任务：改成另一个行业

按 `docs/customize.md` 的顺序做。这个站自己的东西在 `site/`：站名文案（`site.ts`）、每一步的模型（`models.ts`）、品牌与 Logo（`brand/`）、条款页（`pages/`）、发布在网站根目录的固定文件（`public/`，替换占位符后发布）、更新日志（`changelog.json`）。行业知识在 `industry/`：分类标签（`taxonomy.ts`）、主题（`topics.json`）、示范信源（`sources.json`）、提示词（`prompts/`）、门槛（`selection.ts`）。通常不需要改 `apps/` 和 `packages/`；框架里没有、只有这个站要的功能，做成模块放进 `modules/`（`docs/architecture.md` 的“模块”）。

这些事要问使用者本人，不要替他决定：站名；要盯哪些信源；什么消息重要、什么是噪声；分类怎么分；条款和隐私说明的内容（`site/pages/` 是模板，上线前需要他本人确认）。

改评分标准时保留原有结构（内容类型、五个维度加权、噪声压制、安全边界），替换的是“什么算重要”“什么算噪声”的例子。门槛要用使用者标注的样本重新校准（`docs/selection.md`），不要凭感觉改数字。

## 运行与检查

- Node.js 24 直接运行 TypeScript，后端没有构建步骤。npm workspaces：`apps/*`、`packages/*`、`industry`、`site`、`modules/*`。
- 本机运行和 Docker 见 `docs/deploy.md`。
- 改完至少跑：
  ```bash
  npm run typecheck
  DATABASE_URL=postgres://127.0.0.1:5432/<名字>_test npm test   # 名字必须以 _test 或 _ci 结尾；没有会自动建好并迁移，账号要能建库
  npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
  node scripts/smoke.ts --base http://localhost:3000             # 站点跑起来以后
  ```
- `tests/` 里部分测试用的是示例行业的分类、标签和公司，改了 `industry/taxonomy.ts` 后把这些例子换成新行业的对应项。

## 要守住的规则

- 前端（`apps/web`）只通过 HTTP 读 `apps/api`，数据库、模型调用和密钥只在后端。
- 所有公开出口都从 `packages/backend/src/publication/` 这一个读取层读，新增公开出口也一样。
- 读者打开页面不触发模型调用；模型只在 worker 的任务里调用。
- 付费请求都经过回执（`providers/receipts.ts`）和预算熔断，不要绕开。
- 安全阀只有设成 `true` 才打开。开发时保持关闭：`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED`、`FEISHU_*_ENABLED`、`INDEXNOW_SUBMIT_ENABLED`。测试里推送一直关着，采集和模型调用只连本地假服务，不访问任何外部服务。
- 信源默认只展示摘要和原文链接（`site_fulltext` 关）；只有来源明确允许时才打开全文。
- 公开内容匿名，管理员和访客看到的一样；后台只允许管理员。
- 停用或替换一个功能、机制时，同一个改动删掉它的代码、测试、文档和存下的状态（库表与列、定时任务、settings、环境变量和 `.env.example` 里的项）；会删掉使用者已有数据的，在 `docs/deploy.md` 的更新说明里写明。加锁、重试、兼容旧格式、开关和兜底，先要有证据：真实部署里发生过，或平台的语义决定它会发生。
- 数据库迁移放在 `database/migrations/`（只属于某个模块的表放在它的 `migrations/`），按完整文件名排序执行和记账；编号相同的不同文件分别执行，新增迁移使用新的文件名，已经发布的迁移不改。从 `0055` 起，每个文件只放一条允许在线执行的语句，PR 会检查；索引使用 `CONCURRENTLY IF NOT EXISTS`，大批数据回填不放进发布迁移。约束验证和破坏性变更先按 [迁移约定](docs/architecture.md#数据库迁移) 设计，不能修改历史文件或关闭检查绕过。
- 不要提交 `.env`、密钥和 `.data/`。
- 不要使用 AIHOT 的名字和 Logo。

## 写代码

匹配周围代码的写法、命名和注释密度。选能清楚解决问题的简单方案，只定义正在使用的抽象。验证改动涉及的重要行为，不为简单的样式改动写测试。

## 给本仓库提 PR

要把改动提回 `KKKKhazix/AIHOT` 时，先读 `CONTRIBUTING.md`。下面是评审里最常被退回或返工的情况：

- **只收对所有站都成立的改进。** 新开关、新的配置入口和新功能再小也算产品行为，先开 Issue 讲清场景：每个开关所有站都要长期维护，没讨论就提交的这类 PR 大多没有收。你们站自己的规定、数字和例子留在自己的 `industry/`、`site/`，不写进共享的提示词模板、注释和测试。
- **先找现有的。** 加函数、插口或配置前先搜一遍，常见能力多半已有一份：模块发自己的文件用 `apps/api/src/routes/static.ts` 的 `sendFile`，接中转站填 `LLM_BASE_URL`。再写一份，两处迟早不一致。
- **测试只证明你想到的情况。** 动了采集、日期、正文清洗、精选或归组的，拿一批公开的真实订阅和网页跑改动前后，在 PR 里写有多少条结果变了、变的是否都对。中文网页的时间常不带时区，按信源时区读（默认 `+08:00`），上面的 “CST” 一般指北京时间；测试结果不能取决于运行机器的时区。
- **改全。** 新的环境变量写进 `.env.example`，新的站点配置写进 `site/`；改了配置字段的意思，示例配置跟着改，让已部署的站升级后行为不变（比如改成只给声明了 `vision` 的模型附图，本来就能看图的预设要补上声明）；改一个读者看到的名字或入口，出现它的地方一起改。新增或更改导航配置时，分别核对默认配置与非默认配置的电脑侧栏、手机底栏、返回和“我的”入口，入口变少时的标签布局也要在浏览器里看；默认值不变只能证明原行为，不能证明配置可用。

## 中国/亚洲信源与上轮遗漏纠正（2026-10-25）

用户明确要求将之前讨论的**中国财经、政策、AI、加密媒体与宏观权威信源**全部纳入工作范围，不接受只增加日韩、印度的几条 RSS 就宣称亚洲信源完成。新闻源/后台/GLM/AdSense 联合任务开工前读 `specs/006-ops-control-plane/china-and-asia-source-inventory.md`，核实“已配置/已入库/已抓取/已产生可读新闻/已归组”五个阶段，并持续更新实际成功与失败证据。未接通的财新、金十、第一财经、界面、人民银行、证监会等必须保持在待办表，不可静默遗漏；BlockBeats 官方 v2 抓取 404、经济观察网/新华社旧 RSS 陈旧、36氪抓取环境人机验证，不可谎称已接入。复用现有采集器和种子，不造第二套采集工具；先修付费 GLM 的真实阶段配置/新闻积压再增加采集量。

## 当前运营与 GLM 恢复基线（必须先读，2026-10-25）

当任务涉及 EventGraph 管理后台、Provider/付费 GLM、工作流模型、任务积压、自动重测、新闻信源接入或精简后台页面时，**先读** `specs/006-ops-control-plane/spec.md`、`research.md`、`plan.md`、`tasks.md`，对照当前 `develop` 与实际开发/生产数据库后再执行。已确认：**添加付费 GLM Provider 不等于给新闻处理各阶段分配 GLM**；开发阶段设置全部曾指向 NVIDIA，旧能力测试过期导致可恢复错误耗尽文章重试次数。后台的 `blocked` 是正常的预筛过滤，**不是积压**。采用 Research First + 现有 React Router / PostgreSQL pg-boss / Spec Kit；复用现有后台资源与 Claude 独立反方结论，不引入第二个控制台、队列或模型系统。保留确有业务用途的 SelectBench/审计路由，只把低频操作收进“更多”；真实删除须同时清理路由、服务端接口、测试和文档。新信源配置不等于已采集成功，付费模型的实际阶段选择和重新处理均需受控验收。部署不等于 CI 通过；生产仅按既定 main 发布规则。

## 当前产品增长基线（必须先读，2026-10-25）

EventGraph 的产品方向已在用户 + ChatGPT + Claude 独立反方讨论后确定：**保留新闻详情页作为 Google 获客入口；事件页负责深读，主题/关注负责持续追踪**。不能因追求事件图谱而删除/批量 `noindex` 新闻页，也不能无证据把新闻 canonical 全指向事件页。保持 #114 对公开、有摘要新闻的默认索引策略，区分 Google 索引资格和 AdSense 合规广告展示资格。现阶段**不重做首页**，先改善现有新闻页的增量价值和来自搜索的后续点击。亚洲新增信源先核对实际库存与利用率，不要凭感觉得出已上线。

**任何增长/SEO/新闻页/索引/亚洲信源/复访相关工作开工前，先读** `specs/005-news-growth-funnel/spec.md`、`research.md`、`plan.md`、`tasks.md`，并核查最新 `develop` 和 PR 状态。遵循 Research First → 现有 Spec Kit → 最小实现 → CI/独立评审，不另造工具链。此处为产品方向和接力索引；详细事实与验收标准以 Spec 为准。

## EventGraph Spec-driven development and independent review

For non-trivial feature work, use the upstream [GitHub Spec Kit](https://github.com/github/spec-kit) artifact names and flow; see [docs/spec-review.md](docs/spec-review.md). Small fixes may use the Issue and PR acceptance criteria instead of creating three documents.

- **Search Before Build**: inspect current repository code, the AIHOT upstream implementation, and relevant official documentation before planning a new implementation. Record the reusable findings and alternatives in the Issue / plan; do not duplicate existing graph, CI, or provider subsystems.
- **Spec before implementation**: write the user-visible behavior and testable acceptance criteria in `specs/<feature>/spec.md` (or a sufficiently detailed approved Issue), then the implementation plan and tasks as appropriate. Keep `feature → develop → main`; the optional Spec Kit Git extension must not change this policy.
- **Approval is a reference, not a claim**: PRs doing substantial work identify the approved spec source, its immutable Git commit SHA and path (or the explicitly approved Issue/comment reference), plus the approval evidence. A document newly written on the same implementation branch is a *draft*, not automatically approved. Changes to approved requirements require a separate approval/version.
- **Implement within scope**: link each acceptance criterion to the affected files, tests, and actual results. Do not mark unrun CI or undeployed features as complete.
- **Spec-based verification by any reviewer (ChatGPT, Codex, Claude or human)**: compare the approved immutable spec with `spec.md`, `plan.md`, `tasks.md` if present, the PR diff, actual tests and deployment evidence. Look for missing behavior, scope creep, duplicate code, privacy/security regressions and unsupported claims. Report **PASS**, **CHANGES REQUESTED** or **UNVERIFIED** with evidence. `speckit-analyze` checks document consistency; `speckit-converge` checks implementation after `implement` and may append tasks. Neither substitutes for independent PR diff review or GitHub CI.
- Follow the existing Check/E2E and independent PR review; no new CI/CD engine, no production release outside the weekly `main` policy.

## Selected engineering skills (2026-10-27)

Owner approved five skills in total. **This PR installs only `constraint-driven-development` and `source-driven-development`.** The remaining three (`context-engineering`, `debugging-and-error-recovery`, `code-simplification`) are pending companion PR #185. Once both PRs merge, use the five task-selectively from `.agents/skills/` (Pi/Codex) or `.claude/skills/` (Claude Code), not all at once:
- `source-driven-development`: part of mandatory **Research First**; inspect current EventGraph code, AIHOT upstream and applicable official docs BEFORE choosing an implementation.
- `constraint-driven-development`: read `.agents/CONSTRAINTS.md` as the current project quality contract. Do not weaken tests, checks, assertions or thresholds to pass a PR.
- `context-engineering` (**pending PR #185**): read the pinned Spec, task evidence, latest remote Git state and deployment receipts before resuming; persist concise handoff notes in the existing Issue/PR/task record instead of chat-only memory.
- `debugging-and-error-recovery` (**pending PR #185**): reproduce and isolate a real failure, fix root cause, then rerun the affected verification; do not retry an unchanged broken job or silently skip it.
- `code-simplification` (**pending PR #185**): prefer deleting unjustified wrappers, compatibility layers, flags and dead code within approved scope; preserve user-visible behavior and avoid unrelated refactors.

Keep the existing GitHub Spec Kit, approved-Spec PR gate, Check/E2E/Docker workflows and central Claude R01–R18 review as the ONLY governing pipeline. These skills supplement them; they do NOT authorize a second pipeline, a new queue, new infrastructure, coverage thresholds without baseline evidence, or extra approval requests for work already within an approved Spec. On small bug fixes, apply relevant skills without mechanical ceremony; on major requirement changes, obtain the usual Spec approval. Skill provenance and synchronization: `docs/agent-skills-adoption.md`.
