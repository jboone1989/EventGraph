# 005 · Implementation plan（Search First → Spec Kit → minimal implementation）

Decision: `spec.md` (2026-10-25) is the approved conversation baseline. Use the already installed official Spec Kit workflow, not a new orchestration framework. Challenge result and alternatives are recorded in `research.md`.

## Reuse-first architectural map

```
Google Search Console API (existing service account)
 └─ packages/backend/src/admin/search-console-analytics.ts
     ├─ independent overall totals (preserve)
     ├─ query/date top rows (preserve)
     └─ page dimension rows → page-type aggregation (US1)
         └─ apps/web/app/features/admin/ExternalAnalytics.tsx (existing UI)

Existing public article (/items/:id)
 ├─ existing source/AI brief/relatedStories
 └─ later: conditional incremental evidence/related event links (US2)
     └─ existing story (/story/:publicId) → topic/follow (US3)
```

## P1 now (smallest code)

1. Parse Search Console's absolute page URLs by pathname (ignore scheme, www vs apex, URL search/query fragments); classify as `news`, `story`, `topic`, `daily`, `other`, including `/en` equivalents.
2. Expand existing **page** query result window from Top 10 to at most 1000 rows using the official API, **retaining the displayed Top 10** and leaving query totals/date logic unchanged. Do not fetch an extra resource. If row count reaches cap show `limited=true`, not “complete”.
3. Aggregate clicks/impressions by type using actual returned rows only. Calculate weighted mean position as `Σ(position × impressions)/Σimpressions`; CTR as clicks / impressions. Ignore malformed/out-of-domain URL rows to avoid contamination (the domain property can include many subdomains). Show row coverage and distinguish sample totals from independent site totals.
4. Show one compact "Google landed where?" table in `ExternalAnalytics` with clicks, impressions, CTR, position, row count and an explicit sampled-data label. Top 10 clickable landing pages remain. Null/error state unchanged.
5. Add isolated tests for parsing/classification/aggregation (no credentials or live Google access). Reuse existing CI, no new migration or dependencies.

**Decision about click-through candidates:** The existing Search Console API sorts by clicks, not by impressions. To avoid falsely calling the click-ranked Top 10 'high impression/low CTR', display type totals first; P1 can sort the already returned up-to-1000 rows by `impressions` when generating `opportunities` but expose that only for authenticated admin and note sample coverage. Do not auto-rewrite any title.

## P0 inventory follow-up (zero code)

Compare `industry/sources.json` with both `sources` tables and any unpublished branch. Output per-source `collected_7d`, `public_editorial_7d`, `story_memberships_7d`, last successful fetch and source health. An Asia region label is not valid until source identity/region/language is independently verified; do not infer story geography from feed name alone. No new columns until demonstrated useful.

## P2 later (independent PR, after P1)

- Inspect `item.tsx` current 'reason', source citation, `relatedStories`, `GroupSources` and mobile layout. Change only proven weak transition and distinct factual information.
- Source-anchored, conditional 'what else happened' first, not another freeform LLM prompt. Respect `site_fulltext=false` rights.
- Select 10–20 *real* high-impression news URLs from P1, compare metadata, actual H1, intro and internal links; keep untouched set as reference. No auto keywords, no sitewide fake FAQ.

## P3 later (independent PR based on evidence)

- Reuse browser follows/read state and public story revision/updatedAt; show 'new developments since visit' only when supported.
- Do not promise 7-day unique returning users from tab-level sessions or invent a push channel.

## Test/release

- Branch `feature/005-news-growth-funnel` from latest `develop`, PR target `develop`. Existing GitHub Check+E2E+Claude independent code review; do not merge to `main` or deploy production.
- Verify live dev rollout separately; GitHub PR CI pass alone is not a successful deployment.
- Final P1 pass: classification tests for `/items`, `/en/items`, `/story`, `/en/story`, `/topics`, `/daily`, unrelated site/URL, zero impressions; admin report when provider unavailable; repeated run consistent; no private search keywords exposed to users.

## Exit criteria / falsification

- No UI duplicating existing analytics, one type summary table in current admin.
- Page-type sample does not sum to independent whole-site total as if exhaustive.
- If Google report has too few rows, mark data insufficient instead of predicting performance; reconsider whether any additional instrumentation is justified before code.
