# 浏览器检查（e2e）

`e2e/` 用 Playwright 在 Chromium 里打开一个正在运行的站点，桌面（1365×860）和手机（Pixel 7）各跑一遍：

- `pages.spec.ts`：每个公开页面和 `/en` 英文版页面返回 200、有内容、没有掉进错误页；没有未捕获的脚本错误，站内 `/api/site/` 没有 5xx；手机上不横向滚动。每页的整页截图都放进报告。
- `english.spec.ts`：选了英文的读者在每个页面、搜索和筛选浮层、热榜参与者名单里看不到中文界面文字，反馈页的截图选择器是英文的。
- `language.spec.ts`：语言切换在页面和它的 `/en` 地址之间来回，选择会被记住；文章页切到 `/en/items/:id`。
- `knowledge.spec.ts`：知识页在任何图谱状态下都能打开；图谱有数据时画出关系图，实体页的关系能继续点进去。

文章、事件、日报、主题和实体页不写死地址：每次运行先从站点自己的接口各取一个（`site.ts` 的 `samples`）。站点上没有的那类内容，相关检查标为跳过并写明原因。

## 运行

站点要先跑起来，检查本身不启动站点：

```bash
E2E_BASE_URL=http://127.0.0.1:3000 npm run e2e                       # 全部
E2E_BASE_URL=http://127.0.0.1:3000 npm run e2e -- english.spec.ts    # 只跑一个文件
E2E_BASE_URL=http://127.0.0.1:3000 npm run e2e -- --project phone    # 只跑手机
```

结果写在 `.data/e2e/`：`report/index.html` 是带截图的报告，`results.json` 给脚本和智能体读，失败的检查在 `results/` 下各有截图和 trace（`npx playwright show-trace <trace.zip>`）。终端输出里每个失败都写明了页面、尺寸和哪一条不对。

本机没有内容时，可以往测试库里放一点示例内容再跑（只接受名字以 `_test` 或 `_ci` 结尾的库）：

```bash
DATABASE_URL=postgres://127.0.0.1:5432/aihot_ci node scripts/e2e-seed.ts
```

它写入两个信源、三篇精选文章和它们的英文稿、一个两家都报道了的事件，并算一次热榜。

## 在 CI 里

`.github/workflows/check.yml` 的 `e2e` 任务在每个 PR 和 develop/main 的每次推送上运行：构建网站，在全新的 PostgreSQL 上迁移、放入示例内容，起 api 和 web，跑全部浏览器检查。报告（含每页截图）作为 `e2e-report` 产物上传，保留 14 天。这个任务和后端测试分开，后端测试红了也不影响它给出结果。CI 里没有 Graphiti，知识图谱画图和实体页两项会跳过。

## 开发和测试的循环

1. 开发智能体在分支上改完，开 PR，并订阅这个 PR 的动态。
2. CI 跑类型检查、后端和网页测试、冒烟检查和浏览器检查。
3. 有检查失败，GitHub 会把结果推给订阅了 PR 的智能体：它读失败的日志（终端输出写明了页面、尺寸和问题），修好再推，CI 重新跑，直到全绿。
4. 合并并部署到开发环境以后，在开发环境上对真实数据再跑一遍（`E2E_BASE_URL` 指向开发环境），这一遍会覆盖 CI 里没有的知识图谱和日报页面。发现的问题回到第 1 步。

正式站部署后的验收仍然是 `scripts/production-smoke.py`（`docs/production-deployment.md`）；浏览器检查只读页面，不写数据，也可以指向正式站。
