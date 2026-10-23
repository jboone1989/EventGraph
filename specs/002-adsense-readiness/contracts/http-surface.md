# Contract：公开 HTTP 面的变化（Phase 1）

范围：对外可观察的 HTTP 行为。Agent API v1（字段永不变化）**不在**改动范围。

## 新增地址

| 地址 | 行为 |
|---|---|
| `GET /en/privacy` | 200，英文隐私说明（SSR），canonical 指自身，hreflang zh↔en 成对；内容来自 `site/pages/privacy.en.md` |
| `GET /en/terms` | 200，英文使用规则，同上 |
| `GET /research` | 200，原创研究列表（published 文章），可收录 |
| `GET /research/:slug` | 200，文章页（作者/时间/方法/正文，`Article` JSON-LD）；草稿/retired → 404；`/en/research/:slug` 仅当 `title_en` 非空 |

## 变化地址

| 地址 | 变化 |
|---|---|
| 所有公开页 HTML | 主栏底部新增页脚行：`隐私说明 · 使用规则 · 联系 <email>`（mailto；英文版为英文标签）。admin 不带 |
| `GET /privacy` `/terms` | 内容填齐（Jianbo Wang / login@livingruntime.com / 2026-10-24），0 占位词 |
| `GET /robots.txt` | 增加 `User-agent: Mediaparters…`（见下）显式 Allow；`Sitemap:` 不变 |
| `GET /sitemap.xml` | ① 只含可索引页（策展 + 薄页门槛后）② 全部条目带 `lastmod` ③ 新增 `/en/privacy`、`/en/terms`、`/research*` ④ 不再收录未策展/单来源短事件页 |
| `/story/:id`、`/en/story/:id` | 未达门槛的页面 `robots: noindex, follow`（页面仍在、可读） |

robots.txt 目标形态：

```
User-agent: *
Allow: /api/v1/
Allow: /api/mcp
Disallow: /api/
Disallow: /admin/
Disallow: /starred
Disallow: /feedback

User-agent: Mediapartners-Google
Disallow:

User-agent: Google-Display-Ads-Bot
Disallow:

Sitemap: {{siteUrl}}/sitemap.xml
```

## 不变量（回归必须成立）

- 页面无 `adsbygoogle`/`googletagmanager`/任何第三方广告脚本；`ADSENSE_VERIFICATION_ENABLED` 关闭时 `/ads.txt` 404、无 `google-adsense-account`。
- 读者访问公开页不触发模型调用；公开内容匿名。
- Agent API v1 输出逐字段不变（契约测试）。
- RSS 公开出口字段不因策展语义变化（收录只是索引面，不影响阅读面）。
