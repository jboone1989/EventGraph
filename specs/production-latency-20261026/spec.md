# Production page and navigation latency (spec proposal, 2026-10-26)

## Context / evidence
- VM09 production origin serves /api/health in 2–8 ms, homepage in 145–203 ms; Cloudflare HTML stays DYNAMIC. The browser's first homepage DOMContentLoaded was 3.6–3.9 s in the cn-dev Chromium test.
- Actual production navigation_complete events over seven days (n=135): p50 777 ms, p75 1,372 ms, p95 3,669 ms. These events measure route transitions, not initial page load.
- Existing React Router pageReuse, intent prefetch, immutable hashed assets and origin TTL are already implemented: reuse them. Avoid redis, new API services, database migrations and sweeping refactors.

## Requirements
1. FR-01: Load only data each public feed view actually displays: normal homepage (graph, stats, hot, daily, lead graph), q-only search (hot/Trending and daily only), tag/category/channel filters (daily only). Cache three view scopes separately. **Completeness is defined by the target**: the overview needs graph, stats, site, hot and daily; search needs hot and daily; filtered needs daily. A narrower view may reuse a fresh broader snapshot if the hot/daily requests its target requires succeeded (a successfully empty response counts as success); failures of graph/stats/site do not block reuse by search/filtered because those fields are hidden. A degraded frame may still serve its own view's existing offline cache. Explicit retry must bypass broader-frame fallback. Narrower snapshots must never overwrite or poison broader caches. Preserve the visible homepage and Trending content.
2. FR-02: Display the latest daily/weekly/monthly report without blocking on supplementary daily graph-change lookup, while still rendering supplementary changes when available. Errors must not show invented graph data.
3. FR-03: Keep existing React Router navigation, cache freshness and report editorial content correct, including both Chinese/English modes. Avoid eager fetching all tab data on mobile initial paint.
4. FR-04: No Cloudflare zone/HTML edge-cache rule changes are included in this code PR; public HTML currently remains DYNAMIC. Any future separately authorized edge rule must exclude admin/auth/API/session responses, degraded feed responses (failed hot or daily), and arbitrary search/filter query URLs unless safely keyed and bounded. No broad Cache Everything.
5. FR-05: Test the app before production deployment; validate real browser navigation and compare cold/warm requests. Keep VM09 databases and workers untouched.

## Acceptance
- Filtered / and /all skip hidden overview endpoints. Q-only search requests only hot/Trending and daily, not graph/stats/site/lead-graph. Unfiltered routes keep live full overview. Fresh **complete** full → search/filtered and search → filtered may reuse; narrow → broad must refetch. Hot/daily upstream timeouts or errors mark missing fields in the frame; narrower views requiring those fields fetch again rather than reuse it. The frame's own existing cache TTL and offline revisit behavior remain unchanged; empty successful responses remain valid. Manual retry/re-tap triggers a real request. `hasFreshPage`/IntentLink must distinguish the shared frame from the list child.
- For graph API delay clearly below its 2 s timeout (e.g. 1 s), report text renders first and the graph arrives later. For delay above the timeout (e.g. 3 s) or an error, report text still renders without invented graph data.
- CI typecheck and targeted tests pass; HTML/client navigation and local SSR are verified.
- Cloudflare edge HTML caching is not changed in this PR. Before any future edge HTML rollout, prove hot/daily-degraded responses are no-store/BYPASS, auth/admin is bypassed, and query-filtered URLs are excluded or safely keyed; without rule-management access, keep HTML DYNAMIC.
- Compare after deployment with the recorded baseline; do not claim p75 500ms / p95 1.5s until measurements confirm.
