# Implementation plan — remove all public noindex

## Evidence and Search Before Build

- `apps/web/app/lib/seo.ts`: `pageMeta` emits robots noindex from input flags; `localized` conditionally emits additional English noindex; this is the shared reusable mechanism.
- `apps/web/app/routes/{item,story,topic,knowledge-entity,explore,home,all,search-busy,report-detail}.tsx`: use flags or hardcoded noindex in successful and error views. Review the complete public route tree for additional emitters, including headers from server/backend.
- `packages/backend/src/publication/sitemap.ts`: generates sitemap using publication eligibility and `indexable`-related conditions. Removing meta directives does not automatically add URLs to the sitemap; separately report this discrepancy.
- `site/public/robots.txt`: currently disallows admin and private API routes but not Explore. Maintain this protection.
- `apps/web/app/lib/api.server.ts`, `apps/web/server.ts`: existing cache/response status behavior. No need to invent a new cache system as part of a noindex removal.
- Existing tests: `apps/web/tests/{seo-meta,entity-seo,explore-state}.test.ts`, smoke/E2E via the existing Check workflow.

## Minimal approach

1. Inventory all HTML and header paths that can output `noindex` from the actual develop tree; include public routes beyond those named above. Prefer removal of noindex construction in shared SEO helpers over per-route workarounds. Clean obsolete flag conditions only when needed to avoid stale semantics; preserve descriptions, titles, canonical links, language alternates, JSON-LD, and business data flags used for other purposes.
2. Remove route-level noindex directives (especially error/busy and preview routes) without changing error status codes. Preserve all access controls.
3. Add tests to the existing Node/web test suite verifying public HTML and header behavior in both languages, including scenarios previously suppressed. Update old tests expecting noindex.
4. Reconcile canonical/sitemap audit: report remaining public `indexable` gates and distinguish those from removed robots directives. Avoid an unsupported wholesale expansion of sitemap to invalid URLs.
5. Rely on existing GH-AW native Worker, review, CI, E2E and develop preview delivery. Human verification of Google indexing requires data after re-crawling and must not be claimed at merge time.

## Risks and guardrails

- Removing noindex does not guarantee ranking. Google's other signals (canonical, duplicate/thin content, discovered URLs, site quality) may still limit exposure.
- Do not publish private resources or turn status errors into 200.
- Avoid producing infinite query-parameter canonical variants and avoid degrading mobile navigation.
- Do not modify production or Cloudflare settings without separate evidence.
