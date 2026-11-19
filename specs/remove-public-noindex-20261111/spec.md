# Remove `noindex` From EventGraph's Public Website

**Status:** Owner-approved
**Date:** 2026-11-11
**Repository:** jboone1989/EventGraph
**Target branch:** develop
**User authorization:** “我的意思不要设置noindex。” and “完全去掉noindex，就是它导致我们的曝光很低。” This authorizes removing noindex site-wide, not only from Explore.

## Problem

The site explicitly emits `<meta name="robots" content="noindex...">` on a range of publicly accessible URLs. This prevents search indexing of those responses even if a crawler fetches them. It currently includes conditional item, story, topic, entity, filtered-feed, Explore story/case, English, missing-data, and busy-state views. Code also uses "indexable" flags for sitemap membership, distinct from the HTML meta directives. The user's objective is **not** to reduce crawling at the expense of discovery; it is to eliminate `noindex` throughout the public website.

The 24-hour Cloudflare counts for `/explore` and `/en/explore` aggregate many query-bearing URLs into one path. The current connection forbids the raw query field; unique vs repeat crawl counts remain unverified. Do not claim removing noindex alone will guarantee impressions or rankings.

## Requirements

**FR-001 — No public noindex:** Remove all explicitly generated `noindex` robots meta directives, including those in `apps/web/app/lib/seo.ts`, route-level hardcoded meta arrays, and the Chinese/English localization path. No publicly served HTML response should contain `noindex` in `meta[name=robots]` or an `X-Robots-Tag` response header. **Do not replace it with nofollow or another equivalent indexing prohibition.** Both Chinese and English public routes are covered.

**FR-002 — Preserve real access restrictions and HTTP semantics:** This change is not permission to expose unpublished/private/admin data. Keep authentication, API authorization, normal 401/403/404/410/503 responses, robots.txt restrictions on admin and private endpoints, and content-withdrawal handling. A 404 need not emit `noindex` because its HTTP status already signals nonexistence. Do not turn errors into successful 200 pages merely to make them indexable. Do not claim `noindex` was an access-control mechanism.

**FR-003 — Explore must remain navigable and discoverable:** Preserve `/explore`, `/en/explore`, and `?story=`, `?entity=`, `?case=`, replay `clock`/`asOf`, their human-readable SSR content, client navigation, and canonical/hreflang consistency. Do not block Googlebot, OAI-SearchBot, or other verified search/AI-search crawlers, or add `Disallow: /explore`.

**FR-004 — Do not silently suppress index discovery elsewhere:** Audit current sitemap and canonical conditions separately from meta robots. Document which public pages remain excluded from the sitemap by `indexable` flags and whether they are reachable by internal links. This scope removes noindex and may correct directly contradictory robots behavior, but must not mass-advertise nonpublic, missing, or redirect pages as valid pages. If broadening sitemap beyond current public quality rules is necessary, report the implications and test before implementing.

**FR-005 — Retain existing mature components:** Reuse `pageMeta`, `localized`, current server/cache helpers, and existing automated tests. Do not implement a custom crawler detector, scheduler, rate limiter, search index, or parallel analytics collector. Do not create Cloudflare rules as a substitute for removing noindex.

**FR-006 — Accurate verification:** Add focused automated tests for HTML/meta and headers across Chinese and English indexable and previously-noindex public variants (including Explore deep links, filtered feeds, stories/items with `indexable=false`, sparse entities, and error routes), asserting absence of `noindex`. Verify actual page HTTP status remains correct. Use search console (when available) to measure impressions and indexing after deployment; never assert increased traffic without observation.

## Acceptance

- **A01:** No generated robots meta or `X-Robots-Tag` contains `noindex` on any public HTTP route, in Chinese or English.
- **A02:** Previously suppressed valid public pages remain 200 with content and proper canonical, without `noindex`, including Explore story/case and item/story/topic/entity variations.
- **A03:** 404/503/access-control semantics unchanged; no private/admin content is made public or added to the sitemap.
- **A04:** Existing sitemap and canonical inventory audited; any intentionally excluded published URLs listed as a separate finding, not silently described as indexed.
- **A05:** Tests run via existing GitHub Check/E2E workflow; no new framework or restrictions on search crawlers.
- **A06:** PR goes to develop through the established Spec-first reviewed pipeline; no production deployment or main promotion until standard gates succeed.

## Non-goals

No rankings or AdSense promises; no creating artificial content/traffic; no weakening security; no new analytics services; no crawler blocking; no cross-project refactor.
