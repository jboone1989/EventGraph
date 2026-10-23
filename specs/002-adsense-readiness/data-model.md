# Data Model（Phase 1）

## 1. 策展决定（复用现有表，不改结构）

`publications`（现有）：

| 字段 | 语义 | 本特性的变化 |
|---|---|---|
| `seo_indexed_at` | 编辑标记「可收录」的时间（空 = 未策展） | 从「额外收录」升级为**唯一**收录途径（`site.ts SEO.curatedIndexOnly=true` 时） |
| `seo_excluded_at` | 编辑排除 | 不变 |
| `selected` | 模型精选 | 不再直接决定收录 |

校验规则（`rules.isIndexable`，curatedOnly 开启时）：

```
indexable ⇔ visibility='public' ∧ hasItemPage ∧ hasSummary ∧ seo_excluded_at IS NULL ∧ seo_indexed_at IS NOT NULL
```

事件页（story）可索引性（读层下发，页面与 sitemap 共用）：

```
story_indexable ⇔ ∃报道 p: p.indexable ∧ ¬(报道数=1 ∧ length(digest)<100)   （英文页再 ∧ 有英文综述）
```

审计：沿用现有 admin 审计（`setSeoDecision` 提交路径）；新增批量端点逐条走同一事务。

## 2. 研究文章（新，`modules/research`，迁移放模块目录）

`research_articles`：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| slug | text unique | URL 用，小写连字符 |
| title / title_en | text | 双语标题（title_en 可空） |
| author | text | 署名（默认运营者，可署其他作者） |
| author_note | text null | 作者身份/资质一句话 |
| summary / summary_en | text | 摘要（列表与分享卡用） |
| body_md / body_md_en | text | 正文 Markdown（研究栏目不走模型，编辑直接写） |
| method | text | 方法与数据来源（必填，模板里提示「数据、口径、局限」） |
| status | text check in ('draft','published','retired') | 状态机 draft → published → retired；只有 published 对外 |
| published_at / updated_at | timestamptz | lastmod 与结构化数据用 |

状态转移：`draft → published`（编辑点发布，记录审计）；`published → retired`（下线，URL 410/noindex）。

索引规则：published 文章始终可收录（编辑产物，无需再策展），进 sitemap，`Article` 结构化数据（author、datePublished、dateModified）。

## 3. 政策页内容（现有 `site/pages/*.md`，改内容不改结构）

meta 键不变：`版本`（=2026-10-24）、`生效日期`（=2026-10-24）、`运营主体`（=Jianbo Wang）、`联系方式`（=login@livingruntime.com）。校验：preflight 脚本断言四键非「请填写」且正文无占位词（中英共 5 个模式）。

## 4. AdSense 验证配置（现有，不改）

`ADSENSE_VERIFICATION_ENABLED` + `ADSENSE_PUBLISHER_ID` → `google-adsense-account` meta 与 `/ads.txt`；与本特性新增内容零耦合（保持「验证≠广告」）。
