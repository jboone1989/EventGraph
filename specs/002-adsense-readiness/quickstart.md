# Quickstart：本地验证场景

前提：本分支工作区已 `npm install`；`.env` 有本地 `DATABASE_URL`；`COLLECT_ENABLED`/`MODEL_CALLS_ENABLED`/推送开关保持关闭（默认）。

```bash
npm install
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/aihot_test npm test   # 名字以 _test 结尾，自动建库迁移
npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
node scripts/adsense-preflight.mjs                            # 新增：占位词/邮箱预检
```

跑起站点（两个终端或现有脚本）后：

```bash
node scripts/smoke.ts --base http://localhost:3000
node scripts/adsense-smoke.mjs                                # 默认关闭：/ads.txt 404、无 meta、无广告脚本
ADSENSE_VERIFICATION_ENABLED=true ADSENSE_PUBLISHER_ID=ca-pub-0000000000000000 node scripts/adsense-smoke.mjs \
  && echo "应失败：ID 是示例"                                   # 真实两态验证需合法 16 位 ID
```

逐场景核对（对应 spec AD 编号）：

1. **AD-01/02/03**：打开 `/`、`/hot`、`/daily`、任一 `/story/*`、`/items/*`、`/en`——每页底部有「隐私说明 · 使用规则 · 联系 login@livingruntime.com」；`/privacy`、`/terms` 无「请填写/请写明/模板」，含 Jianbo Wang、邮箱、2026-10-24。
2. **AD-04**：`/en/privacy`、`/en/terms` 返回 200，`<html lang="en">`，页脚可从英文页到达；中文页与英文页 hreflang 互指。
3. **AD-05/06**：后台 `/admin/content` 出现「待策展」过滤与批量确认；确认后该条目页 `robots` 无 noindex、进入 sitemap；未确认条目 `noindex, follow`。
4. **AD-07/08**：`/sitemap.xml` 每条有 `<lastmod>`；抽 40 个事件页：没有「1 篇报道且综述 <100 字」的页。
5. **AD-09**：同一天两条精选如果模型给出同一句推荐理由，后一条 reason 为空（可造种子数据验证单测）。
6. **AD-14**：见上 adsense-smoke 两态。
7. **AD-15**：`/robots.txt` 含 `Mediapartners-Google`、`Google-Display-Ads-Bot` 的 Allow 段。
8. **切片 C 后（AD-11）**：`/research` 列表非空、文章页有作者/方法/`Article` JSON-LD、进 sitemap。

预期结果：以上全部通过即本规格切片验收；任一失败按 tasks.md 对应任务回修。
