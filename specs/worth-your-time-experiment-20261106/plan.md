# Implementation Plan: 值得看（Worth Your Time）实验栏目

**Status:** Draft — implementation begins only after Spec Review, Owner-approved stamp and merge to develop.
**Base:** EventGraph develop (inspected 2026-11-06 at f8962e637db2492957d468380366f10ac46bb2ac).
**Spec:** [spec.md](./spec.md)
**Approach:** 只增加一个小型策展读写面，不改变新闻处理流水线。

## Search Before Build — inspected evidence

1. EventGraph already has the shared public publication read layer in `packages/backend/src/publication/items.ts`, public visibility predicates in `publication/scope.ts`, and public API routes in `apps/api/src/routes/site.ts`. The new list must source existing published rows through the same public visibility rules instead of querying all article rows directly or copying news.
2. Existing task/queue infrastructure is `packages/backend/src/jobs/queue.ts` plus worker job registration. Content processing remains in `jobs/content.ts` (extract → analyze → publish → group). New curation must use the existing worker registration and scheduling, with no dependency edge from content processing and no new GitHub Action scheduler.
3. Existing model usage has `packages/backend/src/providers/receipts.ts` for paid request idempotency and budgets; current model configuration is DB-backed. Reuse current default model/selection entry point; do not add another provider registry, model admin CRUD or permanent per-column workflow binding.
4. Existing admin API `apps/api/src/routes/admin.ts` uses `adminHandler`, session, CSRF and audit. Build the minimal new management surface under current admin navigation, not another CMS.
5. Existing anonymous telemetry is `apps/web/app/lib/analytics.client.ts` and `apps/api/src/routes/analytics.ts`, backed by `product_analytics_events`. It uses a browser session ID, not a stable user identity. Extend only the allowlist and needed reporting; do not introduce a new tracking SDK or count sessions as unique people.
6. Web route convention is in `apps/web/app/routes.ts`; navigation in `apps/web/app/components/shell/nav.ts` and `apps/web/app/routes/more.tsx`; page loader convention in `routes/hot.tsx` and existing `loadOr404`/cachedPage. Add /worth and /en/worth using these conventions.
7. Upstream AIHOT (`KKKKhazix/AIHOT`) has an existing publication layer but no evidence of a ready-made Worth Your Time feature. Reuse the fork's existing mechanisms and search upstream again before implementing a missing helper rather than copying/rewriting the news engine.
8. Existing specs `003-content-assets`, `004-editorial-ops`, and `005-news-growth-funnel` already cover general editorial curation, admin notes and news funnel. This experiment must not relabel existing news importance or rebuild their features.

## Technical outline

### Data: two small concepts, no second content store

- A narrow `worth_entries` table (or an equivalent existing publication extension if direct inspection shows a simpler fit): UTC day, source type, internal publication ID nullable, canonical external URL nullable, copied attribution metadata, bilingual title/short description/recommendation reason, category, estimated minutes nullable, rank, manual/automatic provenance, published/hidden state, created/updated timestamp. Store only what is necessary for public cards; do not store entire copied articles or social video.
- A `worth_votes` table: entry ID, anonymous session ID, current vote, opened-original flag, last update; unique entry+session. The current privacy approach is ephemeral browser session identity; acknowledge that the same person can have multiple sessions and vote counts are not people counts.
- New database migrations use the current unique filename sequence and the repo's one-online-statement-per-file policy. New user tables are additive. Never edit published migrations.

### Read/write boundary

- Add `packages/backend/src/publication/worth.ts` for public read and candidate materialization, referencing current public scope predicates and checking current item visibility on every read.
- Add a typed response contract to the existing `packages/contracts` schema (do not use untyped arbitrary JSON across API/web boundaries).
- Add `GET /api/site/worth?day=YYYY-MM-DD` and small public vote route via current Fastify conventions and existing origin/rate-limiting patterns; admin CRUD endpoints in `apps/api/src/routes/admin.ts` or adjacent admin route module using the current admin handler, CSRF and audit.
- Response cache follows current page conventions; changed published entries disappear within the configured TTL. No model request on a web read.
- Canonical links always point to the original work; the card explicitly distinguishes an EventGraph item from external editorial picks.

### Automatic discovery / ranking

1. Daily UTC trigger (00:30) through the existing worker/recurring-job system, plus manually initiated single-day rebuild from existing admin UI. If the existing recurring job abstraction cannot accommodate the schedule cleanly, the implementing agent must document and use the smallest existing supported schedule hook, not stand up a new scheduling service.
2. Use current public publication rows only (recent 48–72 hours) and editor-entered external candidates. Deterministically remove duplicate original URLs/items, ineligible/hidden rows, recently recommended URLs and same-event repeats; cap at 30. Candidate generation must not call the existing article analyze service again.
3. Rank/select in one bounded batch call through live DB model config plus existing receipt/budget mechanism. Existing article summary, title and attribution are the input; no fetching whole social pages. Ask for 0–5 selections with terse source-grounded reasons in zh/en, type and ordering. Treat LLM output as untrusted; validate IDs, allowed field lengths and clear provenance before publication. Do not ask an LLM to fabricate metadata.
4. Human-entered approved entries are never overwritten or auto-unpublished by a subsequent model run. Repeated run of the same UTC day must be idempotent. A model failure records a diagnostic but never blocks content publication or clears previously published recommendations.
5. A daily failure has no forced retry loop; the existing budget/receipt system determines whether the operator may safely retry. Manual override can publish independent of provider availability.

### Web + user feedback

- Make one responsive server-rendered card list at `apps/web/app/routes/worth.tsx`, with localized URL/labels and simple prev-day/archive navigation; no infinite scrolling.
- Put the entry in desktop sidebar More section and mobile /more, without altering core five-tab nav or home Hero.
- Reuse existing image URL/proxy where provided; image absent means text-first card, not placeholder generation.
- User feedback: three vote choices, optional modify choice, visible success/error state. Reuse existing session-generation primitive rather than introducing browser fingerprinting. Recording whether the original link was opened is a session-local signal, not proof the content was consumed.
- Analytics/reporting: extend existing page type/event allowlist minimally and expose a compact per-day admin summary. Surface data completeness and denominators (impressions, clicks, vote count) clearly.

## Alternatives considered

| Alternative | Decision | Reason |
|---|---|---|
| Reuse hot ranking as quality score | Reject | Heat is not post-consumption value; keep news ranking untouched |
| Crawl TikTok/YouTube/X immediately | Reject for V1 | New sources, scraping and uncertain extraction are not required to validate the first hypothesis |
| AI generate/rewrite the recommended content | Reject | It is a discovery experiment; the user should reach original work |
| Build a new personalization engine, users and interest graph | Reject for V1 | No feedback evidence yet and unnecessary complexity |
| Add a new daily GitHub scheduler/second worker | Reject | Existing pg-boss/job plumbing is sufficient |
| Reuse article analysis first, batch rank once | Accept | Controls incremental model calls and content-processing duplication |

## Test plan and boundaries

- Focused DB/API tests: public scope, dedupe, 0–5 limit, UTC day, rerun idempotency, manual override, removal after visibility changes, existing provider/receipt errors, vote upsert/rate-limit/anon identity.
- Web tests: zh/en path, localized copy, external link attributes, three feedback states, no-entries state, mobile/Desktop navigation, no LLM call on page load.
- Run repository-mandated typecheck, targeted tests, web build and existing code PR Check/Docker/E2E/independent review. Spec-only PR must use spec-review/check, not Docker/E2E.
- Verify new curation failure with a controlled fake provider while new news can still be ingested and published; do not substitute unit test evidence for production deployment success.
- After develop deployment, review 14 UTC days of real recommendations and user feedback; report costs, sample count and false positives without claiming statistically valid personalization.

## Guardrails for Agent execution

- Implement in small tasks defined by `tasks.md`, each producing one PR and reusing the existing task Issue/branch. No extra scheduler, CI pipeline, special approval service, or direct production release.
- If an equivalent curation capability is already present on newer develop or upstream when implementation begins, adapt the plan and reuse it; do not duplicate functionality just to follow file names in this draft.
- Implementation PRs must cite the exact merged approved Spec path and 40-character SHA; no unapproved scope expansion.
