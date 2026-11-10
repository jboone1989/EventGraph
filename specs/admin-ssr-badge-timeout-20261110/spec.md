# Restore authenticated admin SSR when optional navigation badges are slow

**Status:** Draft

## Reproduced VM13 incident
On November 10, 2026, `/admin/models` logged `web render failed: The render was aborted by the server without a reason`, originating from `entry.server.tsx`'s fixed six-second streaming abort. The authenticated `/api/admin/providers` endpoint returned HTTP 200 in about **0.55s** and `/api/admin/model-bindings` returned HTTP 200 in **0.27s**, while optional `/api/admin/nav-counts` took **13.2s**. Existing admin layout already renders nav counts in `<Suspense><Await>` so they should not block the shell, but React SSR currently chooses `onAllReady` for user agents identified as bots, including automated/browser-like clients. This waits for slow navigation badges and can trigger the 6s abort.

## Required behavior
- Authenticated `/admin/models`, `/admin/model-bindings`, `/admin/runs` and other admin pages must render the **initial shell with `onShellReady` regardless of user-agent classification**. Keep all public pages' existing bot `onAllReady` behavior, 5-second stream timeout and SEO semantics.
- Keep admin identity verification via the existing `/api/admin/me` loader **before** streaming private page data. Keep `Cache-Control: private, no-store`, the robots and security headers, and existing login redirects.
- Optional navigation counts stay wrapped in Suspense/Await; if slow or failed, show no number rather than inventing zero. When a valid response arrives, show the real count on the same desktop/mobile navigation. Preserve explicit refresh and today's UTC count semantics, do not alter `failedFlowUnitCount` or its correctness tests as an incidental part of this incident.
- Use a **bounded longer SSR safety deadline for authenticated admin pages** (e.g. 20 seconds) so ordinary temporary API slowness does not produce a generic 6-second abort. Do not extend public page timeout or silently swallow primary admin loader 500/503; a real main-loader error must remain actionable.
- Follow approved Spec -> implementation review -> CI -> auto-merge into `develop` -> VM13 deployment+authenticated browser QA. No model setting changes, DB migration, new cache, scheduler, queue worker or production deployment.

## Regression and proof
1. Extend the existing `apps/web/tests/admin-performance.test.ts` fixture with `/api/admin/providers` and `/api/admin/model-bindings` responses; with `nav-counts` deliberately held longer than the old 6-second abort, a **bot-like user-agent** must receive complete HTTP 200 `/admin/models` and `/admin/model-bindings` content, fast initial shell, private/no-store headers and no render-aborted server log. Include a phone-sized browser check.
2. Same test must keep primary identity gating (unauthenticated remains 401/redirect) and not claim missing badges are zero. When badges eventually resolve, they are shown correctly. Existing fast badge and runs page tests still pass.
3. On VM13 with an authenticated session, verify `/admin/models`, `/admin/model-bindings`, and `/admin/runs` no longer fail due to slow nav counts; check current commit, live API and latest Web server errors. Do not confuse public homepage 200 with authenticated admin QA.
4. The separate 13.2s full failed-flow count may be optimized in a later performance change only if needed, without changing its count semantics. This fix restores page reachability first, and must not add a speculative framework.
