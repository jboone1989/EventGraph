# Tasks — AdSense 最小整改

## Work Items

### T001 — 收敛研究空态、申请清单及现有回归
**Scope:** 在现有研究模块与公开导航中根据已发表文章状态处理空研究列表页的可索引性与公共入口，更新过期 AdSense 清单及公开的人工策展声明，复用现有预检/烟测并补精准测试；唯一实现 PR，目标 develop。不要新增广告脚本、队列、内容生成或人工索引 gate。
**Depends on:** none
**Acceptance:**
- 已公开研究数为 0 时中英研究列表均 noindex,follow，sitemap 不包含空页；桌面侧栏、移动“我的”和“关于”页无空栏目入口，直达 URL 可正常打开；草稿仍不公开，后台不受影响。
- 已公开研究数由 0→1→0 后，中英文入口与 robots/sitemap 自动同步（在既有缓存 TTL 内），无需重部署；错误与空数据可区分，SSR/hydration 不出错。
- 复用既有 `npm run adsense:preflight`、`scripts/adsense-smoke.mjs`；更新针对性回归，检查桌面/390px、中英导航、0/1/错误状态，列出实际执行证据。
- 对齐 `/about`、中英文 `/terms` 中“必经人工策展”与 #114 自动索引的事实，不能假称人工逐篇审校，保留原身份与版权、下架约定。\n- `docs/adsense-readiness.md` 删除过时 30 天/150 页“Google 必需”与 curated-only、固定 www 等陈述，与 #114、当前程序行为一致；列明验证前/通过后广告展示是不同阶段。
- 实现 PR 引用本 Spec 的不可变 SHA 与本任务 Issue；经 GitHub 原有 CI/评审/自动合并/VM13 预览，未完成的门禁不得声称通过。
