# Plan — AdSense 最小整改

## Reuse evidence

- 原始 AdSense 功能已由 #88 交付：`apps/web/app/root.tsx` 验证 meta、`scripts/adsense-smoke.mjs`、`site/public/robots.txt`、`modules/research` 与研究后台。不要另起 AdSense/研究子系统。
- 现有 `modules/research/web/routes/research.tsx` list loader 提供公开 `articles`；`modules/research/web.tsx` 将研究链接注册给导航；`apps/web/app/components/shell/nav.ts` 组合模块侧栏；`apps/web/app/routes/more.tsx` 在桌面与手机复用模块 tools。关于页另有入口。手机 TabBar 当前无研究入口，应明确断言不新增。优先在现有公开数据入口实现零/非零条件，保证服务端 HTML 和客户端一致。
- 当前研究空页由线上 2026-11-11 样本验证。新闻详情已有“新闻解读”“查看事件全部后续”，不要为了 AdSense 再发明第二套“附加价值”生成流程。
- `docs/adsense-readiness.md` 是历史实施文档，包含被 #114 替换的索引/人工策展限制和过时域名结论；应保留验证步骤，只更新事实性断言，明确核验环境差异。
- Google 官方政策参见 `spec.md` 的两个原始链接。

## Implementation boundaries

1. 在研究模块的公开查询/缓存与 React Router SSR metadata 中区分 empty / published / error；使用现成结果，不额外建定时器或后台标志。研究单篇与后台不动。
2. 同一状态驱动公共研究链接：桌面侧栏、桌面与手机 /more 工具列表、/about；手机 TabBar 不新增研究项；避免独立的互不一致 hard-code。不得把“无数据”当作“调用失败”。
3. 根据 #114 真实发布路径，仅修正 `apps/web/app/routes/about.tsx` 与 `site/pages/terms*.md` 中不准确的“逐篇人工策展”公开声明，保持中英文一致和现有合规身份/版权条款；不得假称人工逐篇核验。
4. 只改现有回归测试/烟测与部署清单；必要时新增最小测试夹具证明 0/1/错误状态和中英文。
5. 审核需核对 `specs/005-news-growth-funnel` 第 2/5 条与 PR #114，防止错误重启 curated-only 索引。
6. 保留已有 AdSense 验证 meta/ads.txt 机制和默认无广告脚本状态；在 docs/adsense-readiness.md 写清三类候选正文详情页及具体唯一手动版位、空白/后台/列表/错误/未审查内容禁投规则，不新建投放系统。
7. 扩充原 adsense-smoke / 页面级浏览器测试，模拟真实导航和 API 空/错/503/404 与中文英文/390px，核查申请前无广告脚本和任何广告请求；Google AdSense 后台 Auto ads、CDN/Tag Manager 注入的真实状态单列 UNVERIFIED，必须在正式送审前核实。
8. CI 合格后沿用 `.github/workflows/check.yml`、`release-develop.yml`，只观测 VM13 预览，不操作 main/VM09。

## Acceptance evidence

在实现 PR 的矩阵中逐项写出：测试命令与结果；公开研究 0/1 状态；SSR robots + sitemap + 入口；桌面/mobile/中英文；`adsense:preflight` / `adsense-smoke`；禁止页 0 广告 JS/请求与所选真实页面候选的书面版位策略；Google AdSense Auto ads 实际后台状态；预览镜像 SHA + 页面验收。任何未实际访问的部署与运行数据标记为 unverified。
