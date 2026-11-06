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
  └─ consumes versioned human-outcome evidence → Runtime Evolution Engine → prospective decision tests
                     │
                     ▼ controlled author/editor boundary
EventGraph (shared, Agent-neutral infrastructure)
  ├─ authenticated case ingest/save/publish (no LLM, no scheduler)
  ├─ original source + research scope + author + revisions
  ├─ /worth, /en/worth experiment cards and case history
  ├─ anonymous three-way feedback + "new to me" + baselines
  └─ versioned, anonymized human-outcome aggregates (not an RL engine)
                     │
                     ▼
Humans read original works and contribute feedback
```

EventGraph's existing news/public facts are an optional research input to Ferro, not its only input. Ferro may discover outside works (videos, articles, art) with its existing capabilities. **No automatic value scorer is hosted in EventGraph. No fixed daily quota or recommender.**

## Shared Ferro content contract (2026-11-06 owner decision)

Ferro already operates as a channel-independent Content Agent in `jboone1989/wechat-traffic-agent` (`ARCHITECTURE.md`, `docs/CONTENT_AGENT_PLAN.md`). `fun`, `research` and `worth` are typed outputs of **one source-to-evidence-to-authoring-to-feedback loop**, not three EventGraph workers. Existing `modules/research` is the source of truth for research articles; fun's site-specific public surface belongs to `specs/fun-independent-editorial-distribution-20261106` (Draft PR #434). Ferro-side delivery and evidence learning are now scoped in Ferro Issue [#297](https://github.com/jboone1989/wechat-traffic-agent/issues/297), reusing Ferro's PRs #296/#288 rather than introducing a new crawler.

**Exactly one common authorized author submission mechanism** should be reused for all authored content kinds. This Worth Spec owns its own case representation and anonymized feedback aggregation, *not* another generic credential/service/author endpoint when the fun/research interface already provides it. Integration sequence can be staged with current admin-mediated publication; do not mark automatic Ferro delivery complete until the real shared interface is available and exercised. Neither Spec creates an independent content Agent.

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

### 3. User feedback, emotion annotations and stable outcome snapshots

- Simple `worth/okay/wasted` and optional `new_to_me` response, **plus optional** emotional-response tags (moved/joy/surprised/thoughtful/neutral/other), self-reported actual exposure and short optional subjective reason. Upsert one vote per case per current anonymous session using existing anonymous privacy conventions. Modifications and withdrawal update the current vote, not a new independent sample. Treat clicked-original separately from self-reported experienced-it; neither is automatic proof the user watched/read fully. No mandatory sentiment labels or PII.
- Minimal aggregate per-case vote counts, optional emotional categories, previously-unknown flag, self-reported experience and opened-original count. Preserve conflicting human opinions and explicit missing data; no claims of uniqueness or verified consumption, and no forced single "average quality score". Short free-text is not directly exported to Ferro or model contexts; apply sanitization/moderation/data minimization before any approved aggregate use.
- For the 14-day small study, pre-record a matched sample of mainstream popular works as a comparison. Do not build a popularity crawler; admin imports original URLs and records the selection rules. Do not compare different topics/media without qualification. Report the denominator for "valuable among previously unknown" and the cases Ferro misjudged.
- Only a small admin report or scripted summary needs to exist; no separate analytics dashboard. Optional experiment sample can be a static test fixture/manual dataset when this is sufficient, rather than a permanent comparison table.
- Build a **versioned, case-linked aggregate outcome receipt** for an authorized author: stable case ID + work URL, Ferro's **pre-feedback** judgment revision and policy version, observation cutoff/window, counted votes and exclusions, value/novelty/emotion distributions, source/evidence IDs and snapshot revision. An edited vote changes the aggregate revision, not the number of independent participants. Repeat reads of the same snapshot must be idempotent. Do not send IP/session identifier, raw personal comments or individual histories to Ferro.

## Ferro-side evidence-to-learning integration — NOT EventGraph GH-AW tasks

**Verified existing contract (jboone1989/wechat-traffic-agent):**
- `ARCHITECTURE.md` and `docs/EVOLUTION_ENGINE_INTEGRATION.md` assign lifecycle/evidence gates, experiment/promotion/rollback and durable memory to the canonical **agent-runtime Evolution Engine**. Ferro supplies domain observations, outcomes, metrics and bounded domain adapters; **no second learning state machine**.
- `docs/ferro-learning-rebuild.md` and `docs/ferro-learning-evaluation.md` require real downstream behavioral changes, prospective baseline comparison and independent outcomes rather than more reflections/notes. Existing `LearningTransfer` compares trial arms; do not assume this already understands emotional feedback.
- `docs/WEB_EDITORIAL_AND_FEEDBACK.md` distinguishes observational website metrics from causal experiment proof; pageviews/CTR alone are not reward authority.

**Ferro integration contract:**
1. Precommit a case prediction before observing votes: specific experienced-value hypothesis, expected emotional categories if justified, evidence/scope, audience/context if known, work URL, policy version and case revision. Do **not** let feedback rewrite the original prediction.
2. EventGraph returns immutable-at-cutoff aggregate snapshots linked to that prediction (3-way value votes, optional emotion labels and reasons only in coarse sanitized aggregate, novelty, exposure claim, sample size, disagreement and data-quality exclusions).
3. Ferro translates the snapshot into domain/world-outcome evidence, preserving negative and inconclusive evidence, and feeds the **existing Agent Runtime** `ExperienceTrace → EvolutionExperience → EvolutionEvidence` and candidate/experiment lifecycle. Unknown feedback is unknown, not a zero or penalty. A popular case with weak novelty is not assumed to satisfy the discovery objective.
4. Runtime compares a candidate discovery/judgment policy with a preserved baseline on **new, unseen works** under matched media/topic and feedback observation window. Reward analysis separates worth-it, emotional match, novelty and groundedness; never train only for high votes. Apply Runtime-controlled promote/reject/rollback after real result evidence, not after a single post or a self-evaluation.
5. Verify change in **subsequent Ferro decisions** (case selection, emotional hypothesis, reasons grounded in material) plus human outcomes and regressions; do not claim that preserving examples or reciting emotion labels equals understanding human feelings. Preference-model fine-tuning or online RL weight updates are **not prerequisites** and require separate evidence of utility/cost and Runtime authority.

**Phased proof:**
- P0: public case + versioned feedback aggregates, no learning claims.
- P1: real Ferro ingestion and documented prediction-error diagnosis, still not durable policy adoption.
- P2: Runtime-owned policy trial with prospective matched controls, promotion only on improved out-of-sample value/novelty/emotional calibration without regression.


- Validate Ferro's existing discovery/research loop, what real media it can access, and how it exposes its findings; no claims of actual video watching without traceable material access.
- If Ferro lacks a safe way to publish authored experiment cases to EventGraph, implement a consumer/client in **Ferro's own repository and workflow** after verifying its actual code. Do not turn EventGraph into an Agent host.
- Prove one real end-to-end case: source URL and evidence, Ferro's precommitted judgment, authenticated publication, real human feedback, versioned result consumption by Ferro, Runtime evidence linkage and an observed next decision. This is integration proof, **not** sufficient proof of learned competence.
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
- Pre-register the 14-day exploratory comparison; after field evidence decide whether building a user-facing discovery service makes sense. Compare Ferro baseline vs changed policy on held-out real cases before claiming RL improvement. Do not equate a green CI, richer memory, a manually seeded example or a score increase in unpaired observational data with verified Ferro learning.
