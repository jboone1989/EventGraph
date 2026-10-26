# Minimal implementation plan

Research first:
- Current `develop`: `apps/web/app/routes/feed-layout.tsx` runs overview queries even when filters hide them; `apps/web/app/routes/report-latest.tsx` awaits an optional graph query after retrieving the report.
- Existing `pageReuse` and desktop/mobile link prefetch are already present. Do not replace.
- React Router 7 supports streaming unresolved loader promises with `<Suspense><Await/></Suspense>`, allowing report prose to render ahead of auxiliary graph content (https://reactrouter.com/how-to/suspense).
- Cloudflare requires an explicit Cache Rule for HTML; broad Cache Everything may cache private HTML (https://developers.cloudflare.com/cache/how-to/cache-rules/examples/cache-everything/).

Changes:
1. Preserve the actual rendering dependency map: ordinary / and /all need lead, graph, stats, hot and daily; q-only search still shows Trending (hot) and deliberately reuses the *full* unfiltered feed frame to avoid a warm-navigation regression; tag/category/channel filtered views need only daily. Split the existing `pageReuse` cache into full vs filtered keys. The filtered view may read a fresh full snapshot as a safe fallback; filtered writes never overwrite the full snapshot. Do not build another caching layer.
2. Stream only optional daily graph changes, using existing endpoint and timeout; keep the report/index data resolved normally.
3. Verify Cloudflare Cache Rules are manageable via existing access before changing any zone; otherwise don't change edge settings.
4. Regression tests must cover filtered → unfiltered → filtered and unfiltered → filtered browser navigation; q-only Trending must keep hot data without extra warm-frame fetches. Test hidden API request counts and optional report graph at 1 s success vs >2 s timeout/error before deployment. No new service, library or database changes.
