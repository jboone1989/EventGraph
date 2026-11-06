# 今日整活 · 实施计划（Ferro 创作 / EventGraph 仅承载）

**Status:** Draft · 2026-11-06 owner 修改职责后需重新 Spec Review
**Spec:** [spec.md](./spec.md)
**Target:** EventGraph develop

## Search Before Build

### 当前 EventGraph

- `packages/backend/src/publication/{items,scope,stories}.ts`：公开的新闻与事件事实、已有配图。Ferro 通过现有公开 API/MCP 读取，不在新闻事务注册生成逻辑。
- `modules/research/{module.ts,server.ts,backend/store.ts}`：已经有 `/research`、`/en/research`、`/api/admin/research`、`research_articles`；支持署名、方法、证据正文、草稿/公开/撤回。研究栏目的写入和公开不需要重做。
- `apps/web/app/routes.ts`、`apps/web/app/routes/admin/` 与 `apps/web/app/components/shell/nav.ts`：可复用的中英文页面、导航与现有管理员鉴权/CSRF。
- `packages/backend/src/media/{imgproxy,images,renditions,poster}.ts`：复用实际新闻图和代理预览。需平台长久媒体时，Ferro/Omnipost 侧准备稳定资源；不要在 EventGraph 新建分发图片加工流水线。
- `packages/backend/src/publication/analytics.ts` 与 `apps/api/src/routes/analytics.ts`：现有匿名页面行为统计。新增栏目只扩展必要的 pageType；不能把点击称为情感价值。
- **不要新增** `packages/backend/src/fun` 自动发现/写作服务、`fun.discover`/`fun.compose`/`fun.distribute` 任务、worker schedule、第二套动态模型绑定、第二套文章采集/发布机制。

### 当前 Ferro（jboone1989/wechat-traffic-agent）

- `ARCHITECTURE.md` 明确 Ferro 由 `agent-runtime` 托管，拥有来源研究、内容 artifact、创作、渠道适配与反馈解释；Runtime 负责身份/记忆/模型/执行政策。
- `docs/CONTENT_AGENT_PLAN.md` 已定位成 **channel-independent Content Agent**，已具备选题、文章创作、受控发布与多个渠道的接口；不用造新内容 Agent。
- `docs/CONTINUOUS_CONTENT_LOOP.md` 描述已有统一持续内容循环与证据检查；三个作品类型可在此既有循环中作为内容产出选项，**不能**据此推断已存在对 EventGraph 的自动投稿执行器。
- `docs/WEB_EDITORIAL_AND_FEEDBACK.md` 已有内容选择、反馈与实验元数据能力；复用域内度量与失败证据，不直接以 pageviews 宣称质量提升。
- `src/wechat_traffic_agent/platforms/omnipost_client.py` 已有 Streamable HTTP MCP 客户端；其 `publish(title, markdown, platforms, dry_run, min_interval_minutes)` 形式不能证明目前支持图文上传。确认运行时 tools/list、认证、目标平台标识、媒体上传能力后再启用真实自动分发。
- `docs/EVOLUTION_ENGINE_INTEGRATION.md`：任何学习应进入 agent-runtime Evolution Engine 的 evidence/experiment/promotion，不在 EventGraph 埋独立奖励函数。
- `jboone1989/human-writing`：已有内容写作方法可作为 Ferro 的创作辅助；不在 EventGraph 实现新 prompt 引擎。

## Target architecture

```text
EventGraph public facts / external original evidence
                     │
                     ▼
Ferro / Content Agent + existing Agent Runtime
  ├─ research evidence, author judgement, writing, quality checks
  ├─ artifact kind = fun / research / worth
  ├─ fun     → factual witty commentary + optional existing images
  ├─ research→ method, citations, competing hypotheses
  └─ worth   → discovered work, justified value hypothesis
                     │
        canonical, typed authored artifact
                     ▼
Existing EventGraph author/editor publication boundary
  ├─ /fun         new narrow display of authored short works
  ├─ /research    existing research module, unchanged in core
  └─ /worth       companion experiment Spec #440
                     │ successful site publish receipt / URL
                     ▼
Ferro existing PublicationEvent / DistributionTask → Omnipost
  ├─ independent platform receipt + link
  └─ manual_required / unverified without fake success

EventGraph optional aggregated audience evidence
  → Ferro domain outcomes → Agent Runtime evolution comparison
```

## EventGraph minimal implementation slices

1. **Fun content read/write presentation:** minimal typed fun artifact in existing research/authoring subsystem or a small dedicated website representation only when required. Case metadata (original URL, author, sources, optional pictures, short text, revision, published/hidden). Do not place fun in `research_articles` if it would compromise current research invariants; reuse author/session/CRUD and publication patterns instead.
2. **Page:** `/fun` and `/fun/:id`, responsive; existing media URLs if legitimate, text-only fallback; link to original EventGraph item/story. No new generation service; empty homepage omission.
3. **Publisher integration contract:** reuse current authenticated author/admin entry point for manual/adapter submission; if a direct Ferro writer is absent, state the integration gap and keep admin-mediated publishing until an authorized generic connector exists. Avoid deploying a new secrets service. Keep original source + final revision immutable for downstream distribution identity.
4. **Ferro Omnipost:** stays in Ferro's repository. Do not call MCP from EventGraph; EventGraph may expose a minimal stable URL/accepted revision, accept a verified channel link for the work and display existing business outcome fields. Optional per-channel tracking is a downstream convenience, not a new EventGraph scheduling queue.
5. **Research:** reuse `modules/research` existing author/edit/publication; Ferro must provide real sources/method and adequate evidence. Implement Ferro-side client/workflow separately, not a duplicate EventGraph research writer.

## Rejected previous design

| Previous idea | Decision |
|---|---|
| Every 15 min EventGraph fun.discover scan | **Delete** — Ferro already researches topics and can consume public APIs |
| EventGraph fun.compose invokes LLM | **Delete** — Ferro is the content creation agent |
| EventGraph fun.distribute via Omnipost | **Delete** — Ferro already has the Omnipost client / publication events |
| 5 auto-fun posts/day | **Delete** — no quota, no content stuffing |
| Two data tables fun_posts/fun_distributions and complex state machine | **Reduce** — minimal authored publication record, only confirmed distribution references needed |
| Copy research to a new fun/research engine | **Reject** — existing research module already runs |
| 3 independent agents for three columns | **Reject** — one Content Agent, 3 typed outputs; differentiated evidence quality |

## Verification

- Test fun display on real/source-linked vs draft/hidden entries, provenance, original source URL, missing media and archived work, responsive UI.
- Test existing research flow still works without altering its schema and publishing status rules.
- Test model outage/Ferro downtime/Omnipost downtime while news pipeline remains live, **not** by running an EventGraph fun worker.
- Test Idempotent (artifact ID + revision) author delivery; do not accept external channel success without concrete receipt. Unknown success `unverified` must not retry automatically.
- Run normal code PR checks only on implementation PRs; this Spec-only PR requires spec-review/check, not Docker/E2E.
- Real Ferro-author-to-EventGraph-to-Omnipost acceptance requires a verified Ferro-side run and platform capability evidence; EventGraph web tests alone do not prove it.
