# Production page and navigation latency (approved scope, 2026-10-26)

## Context / evidence
- VM09 production origin serves /api/health in 2–8 ms, homepage in 145–203 ms; Cloudflare HTML stays DYNAMIC. The browser's first homepage DOMContentLoaded was 3.6–3.9 s in the cn-dev Chromium test.
- Actual production navigation_complete events over seven days (n=135): p50 777 ms, p75 1,372 ms, p95 3,669 ms. These events measure route transitions, not initial page load.
- Existing React Router pageReuse, intent prefetch, immutable hashed assets and origin TTL are already implemented: reuse them. Avoid redis, new API services, database migrations and sweeping refactors.

## Requirements
1. FR-01: Load only data each public feed view actually displays: normal homepage (graph, stats, hot, daily, lead graph), q-only search (hot/Trending and daily only), tag/category/channel filters (daily only). Cache the three view scopes separately; narrower views may reuse a fresh broader snapshot but must never overwrite or poison a broader cache. Preserve the visible homepage and Trending content.
2. FR-02: Display the latest daily/weekly/monthly report without blocking on supplementary daily graph-change lookup, while still rendering supplementary changes when available. Errors must not show invented graph data.
3. FR-03: Keep existing React Router navigation, cache freshness and report editorial content correct, including both Chinese/English modes. Avoid eager fetching all tab data on mobile initial paint.
4. FR-04: Edge HTML caching may be enabled ONLY for anonymous public GET/HEAD pages / public .data, respecting existing origin TTL; admin, auth, APIs, personalized or cookie-sensitive responses must not be cached. Do not ship broad Cache Everything.
5. FR-05: Test the app before production deployment; validate real browser navigation and compare cold/warm requests. Keep VM09 databases and workers untouched.

## Acceptance
- Filtered / and /all skip hidden overview endpoints. Q-only search requests only hot/Trending and daily, not graph/stats/site/lead-graph. Unfiltered routes keep live full overview. Cached full → search/filtered, search → filtered, and filtered/search → full never pollute data or add redundant frame fetches when a suitable fresh superset exists.
- For graph API delay clearly below its 2 s timeout (e.g. 1 s), report text renders first and the graph arrives later. For delay above the timeout (e.g. 3 s) or an error, report text still renders without invented graph data.
- CI typecheck and targeted tests pass; HTML/client navigation and local SSR are verified.
- Cloudflare rules, if changed, show anonymous HIT and protected paths always BYPASS/DYNAMIC; if account permissions prevent it, leave existing edge configuration unchanged and explicitly mark that part blocked.
- Compare after deployment with the recorded baseline; do not claim p75 500ms / p95 1.5s until measurements confirm.
