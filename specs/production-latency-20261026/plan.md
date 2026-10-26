# Minimal implementation plan

Research first:
- Current `develop`: `apps/web/app/routes/feed-layout.tsx` runs overview queries even when filters hide them; `apps/web/app/routes/report-latest.tsx` awaits an optional graph query after retrieving the report.
- Existing `pageReuse` and desktop/mobile link prefetch are already present. Do not replace.
- React Router 7 supports streaming unresolved loader promises with `<Suspense><Await/></Suspense>`, allowing report prose to render ahead of auxiliary graph content (https://reactrouter.com/how-to/suspense).
- Cloudflare requires an explicit Cache Rule for HTML; broad Cache Everything may cache private HTML (https://developers.cloudflare.com/cache/how-to/cache-rules/examples/cache-everything/).

Changes:
1. Condition feed-layout auxiliary requests on whether the overview is visible; retain daily sidebar query. **Critical**: the existing `pageReuse(() => "feed-frame")` shares data between filtered/unfiltered addresses; use the exact same visibility predicate for both the loader decision and two separate reuse keys (`feed-frame:overview` vs `feed-frame:filtered`). Filtered data must never poison the unfiltered overview.
2. Stream only optional daily graph changes, using existing endpoint and timeout; keep the report/index data resolved normally.
3. Verify Cloudflare Cache Rules are manageable via existing access before changing any zone; otherwise don't change edge settings.
4. Regression tests must cover filtered → unfiltered → filtered navigation and assert only the unfiltered view receives and caches overview data. Test hidden API request counts and a delayed/failing optional report graph before deployment. No new service, library, compatibility layer or database changes.
