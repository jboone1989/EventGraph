# Minimal implementation plan

Research first:
- Current `develop`: `apps/web/app/routes/feed-layout.tsx` runs overview queries even when filters hide them; `apps/web/app/routes/report-latest.tsx` awaits an optional graph query after retrieving the report.
- Existing `pageReuse` and desktop/mobile link prefetch are already present. Do not replace.
- React Router 7 supports streaming unresolved loader promises with `<Suspense><Await/></Suspense>`, allowing report prose to render ahead of auxiliary graph content (https://reactrouter.com/how-to/suspense).
- Cloudflare requires an explicit Cache Rule for HTML; broad Cache Everything may cache private HTML (https://developers.cloudflare.com/cache/how-to/cache-rules/examples/cache-everything/).

Changes:
1. Classify shared feed frame by a single rendering predicate: `overview` (no filters and no q: graph, stats, site, hot, daily, optional lead story graph), `search` (q-only: hot/Trending, daily), and `filtered` (tag/category/channel: daily). Use three distinct `pageReuse` keys; allow a fresh overview frame to satisfy search/filtered views and a fresh search frame to satisfy filtered views. Never reuse a narrower frame for a broader page. This avoids hidden API calls and network regressions without another cache implementation.
2. Stream only optional daily graph changes, using existing endpoint and timeout; keep the report/index data resolved normally.
3. Verify Cloudflare Cache Rules are manageable via existing access before changing any zone; otherwise don't change edge settings.
4. Regression tests must cover cold/warm overview, q-only search and filtered navigation in both directions, assert q-only never requests hidden knowledge or site endpoints, and preserve Trending. Test the optional report graph at 1 s success vs >2 s timeout/error before deployment. No new service, library or database changes.
