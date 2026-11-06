# Implementation Plan: Ferro 主导的「值得看」发现实验

**Status:** Draft (substantive revision; re-review required)  
**Spec:** [spec.md](./spec.md)  
**Repository:** jboone1989/EventGraph  
**Branch:** develop (read at f8962e637db2492957d468380366f10ac46bb2ac before this revision)  

## Minimal architecture

```text
Ferro (independent Agent / ContentMind / its own Runtime)
  ├─ discovers potential works using its existing tools
  ├─ examines actually available source material
  ├─ judges felt/knowledge/aesthetic/fun/usefulness value with uncertainty
  ├─ proposes discovery case or a correction, at Ferro's own cadence
  └─ reads aggregate human feedback to reflect (inside Ferro, not EventGraph)
                     │
                     ▼ controlled author/editor boundary
EventGraph (shared, Agent-neutral infrastructure)
  ├─ authenticated case ingest/save/publish (no LLM, no scheduler)
  ├─ original source + research scope + author + revisions
  ├─ /worth, /en/worth experiment cards and case history
  ├─ anonymous three-way feedback + "new to me" + baselines
  └─ aggregate evaluation/feedback API
                     │
                     ▼
Humans read original works and contribute feedback
```

EventGraph's existing news/public facts are an optional research input to Ferro, not its only input. Ferro may discover outside works (videos, articles, art) with its existing capabilities. **No automatic value scorer is hosted in EventGraph. No fixed daily quota or recommender.**

## Search Before Build: concrete evidence

1. `docs/product-thesis.md` explicitly separates EventGraph's sourced facts and public knowledge from Ferro/other authors' independent hypotheses. It also rules out another Agent runtime and another database/graph engine for unproven needs.
2. `docs/editorial-policy.md` identifies Ferro as an optional independent research author and requires authored provenance and grounded contributions. Editorial voice is not the fact layer.
3. `modules/research/module.ts` already defines public /research and /en/research routes, and `modules/research/server.ts` already has a guarded admin writer, public reads and signed articles. Prefer a lightweight experiment case type or small submodule alongside this module; reuse editor auth, audit, public read, web route patterns. Do not force cases into full research article bodies just to avoid a narrow typed schema.
4. `apps/api/src/routes/admin.ts` uses the existing session/CSRF convention; `apps/web/app/routes.ts` and `apps/web/app/components/shell/nav.ts` provide normal bilingual routing/nav. Add the experiment link without changing the homepage or the existing five phone tabs.
5. `apps/web/app/lib/analytics.client.ts` and `apps/api/src/routes/analytics.ts` already track page/referrer analytics with ephemeral session IDs. Reuse to observe experiment page and original-work opens. Vote storage can be minimal without a new user/analytics platform.
6. `packages/backend/src/publication/items.ts` and `publication/scope.ts` are the common public publication scope if a discovery case cites an existing internal news item.
7. The current news `jobs/content.ts` (extract/analyze/publish) and `providers/receipts.ts` are **not** to be extended for value judgments, because doing so would duplicate Ferro's responsibilities and incur another pipeline.
8. Upstream AIHOT has a public publication layer. Search before modifying common components; the new experiment case is site-specific rather than an upstream generalized recommender.

## What to implement in EventGraph

### 1. Public research-case presentation

- Bilingual `/worth` and `/en/worth`, clearly labelled as an open experiment, list cases by documented discovery/experiment time, not a ranked "for you" recommendation feed. Include no "today's top picks"/scroll-to-keep-reading features.
- Case displays original URL/author/source (when verified), media type, the actual examination scope (read/watch/partial/metadata), Ferro judgement as a **labelled subjective opinion**, evidence/limits, version history, alternative possibility or why judgement might be wrong. Case might be a positive find or false positive.
- Render no embedded copy of third-party work. A preview image uses an existing supported public media URL when present; no generated cover.
- Empty state when nothing was published; no daily output requirement.

### 2. Controlled author-neutral case persistence

- Prefer reuse of existing research author/admin persistence and public read; add a minimal case/revision structure only if current article schema cannot represent source URL, evidence scope, uncertainty and revisions without hiding provenance.
- Existing auth/CSRF/admin writer first: support a manual real Ferro-authored case as proof of surface and schema.
- Provide a minimal authenticated agent submission adapter only by reusing an already installed accepted authenticated write mechanism. **Do not invent a Ferro-only secret, token store or cross-service queue**. If none exists, implementation stays at admin-mediated publishing and separately records the actual integration gap as a Ferro-side task. EventGraph API can remain author-neutral once a common write route is authorized.
- Accept agent identity, source, artifact URL, confidence limits, revision and case idempotency key; validate structured fields and preserve prior revision on corrections. Read-only aggregated feedback available for Ferro; never return raw session IDs.
- Explicitly avoid reusing the generic news `/api/ingest/items` path for subjective research cases. No effect on article publication, hot ranking, events, or news SEO.

### 3. User feedback and comparison

- Simple `worth/okay/wasted` and optional `new_to_me` response, upsert one vote per case per current anonymous session using existing anonymous privacy conventions. Without available session storage, show a clear failure/disabled feedback state rather than fabricating duplicate control.
- Minimal aggregate per-case vote count and conditional opened-original count, no claims of uniqueness or verified consumption; show disagreement, not a forced "average quality score".
- For the 14-day small study, pre-record a matched sample of mainstream popular works as a comparison. Do not build a popularity crawler; admin imports original URLs and records the selection rules. Do not compare different topics/media without qualification. Report the denominator for "valuable among previously unknown" and the cases Ferro misjudged.
- Only a small admin report or scripted summary needs to exist; no separate analytics dashboard. Optional experiment sample can be a static test fixture/manual dataset when this is sufficient, rather than a permanent comparison table.

## Ferro-side prerequisites — NOT EventGraph GH-AW tasks

- Validate Ferro's existing discovery/research loop, what real media it can access, and how it exposes its findings; no claims of actual video watching without traceable material access.
- If Ferro lacks a safe way to publish authored experiment cases to EventGraph, implement a consumer/client in **Ferro's own repository and workflow** after verifying its actual code. Do not turn EventGraph into an Agent host.
- Prove one real end-to-end case: source URL and evidence, Ferro rationale, authenticated publication, human feedback, Ferro seeing aggregate feedback and optionally correcting its judgment.
- Until this integration is confirmed, call the EventGraph deliverable a **public experiment interface**, not a deployed autonomous discovery service.

## Alternatives rejected

| Alternative | Why rejected |
|---|---|
| Daily 5 recommended items selected by an EventGraph worker | Another recommendation system, not a test of Ferro's independent content judgment |
| EventGraph batch LLM quality score on news summaries | Duplicate Ferro cognitive responsibility; fails to actually assess many videos |
| Fixed popularity / CTR ranking | Measures attention, not perceived post-consumption value |
| Build full video crawler, multimodal evaluation model or Agent runtime | Too broad; identify Ferro's existing capabilities first |
| Hard-code Ferro to every EventGraph API/schema | Violates EventGraph's public, multi-Agent knowledge infrastructure |
| Create a dedicated GitHub scheduler/AI reviewer for curation | Unnecessary and conflicts with existing workflow simplification |
| Treat this as originality gate excluding AI works | User expressly values good AI works; test meaning, not production method |

## Implementation/verification rules

- EventGraph-only implementation Items are in `tasks.md` and enter current Spec 015 producer after review/approval; do not enqueue implementation work for an unavailable Ferro repository as an EventGraph Issue.
- Test public/private/withdrawn cases, corrections/version history, source links, bilingual fallback, zero cases, write auth, anonymous feedback and aggregation; verify no calls to news analysis, worker curation or model provider on case page render/submission.
- Code PRs use existing typecheck, focused tests, Check/Docker/E2E and independent review. Spec-only PR runs existing spec-review + Check, no Docker/E2E.
- Pre-register the 14-day exploratory comparison; after field evidence decide whether building a user-facing discovery service makes sense. Do not equate a green CI or manually seeded example with verified Ferro autonomy.
