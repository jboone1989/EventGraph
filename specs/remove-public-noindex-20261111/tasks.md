# Work items — remove public noindex

## Work Items

### T001 — Remove all public noindex directives
**Scope:** Remove all robots noindex meta/header output from EventGraph's public website using the existing shared SEO components and route metadata, while preserving HTTP status and permissions.
**Depends on:** none
**Acceptance:**
- Across the public route tree, no Chinese or English HTML response emits noindex, including previously conditional item, story, entity, topic, feed, Explore, and busy/error views.
- The implementation reuses shared pageMeta/localized components and does not replace noindex with a different indexing prohibition.
- Public Explore deep links remain navigable and canonical metadata remains coherent.
- Existing 401/403/404/410/503 statuses and authorization remain unchanged; no private resources are exposed.
- Update and add focused existing-suite tests for affected robots metadata and real HTTP behavior.

### T002 — Verify sitemap, headers, and full public SEO regression
**Scope:** Audit reachable public URLs, sitemap inclusion, canonical/hreflang and headers after the noindex removal, using existing tests and smoke checks, with corrections limited to demonstrated contradictions.
**Depends on:** T001
**Acceptance:**
- Automated tests and existing CI verify no public HTML or X-Robots-Tag noindex across representative localized and deep-link routes.
- Document remaining sitemap exclusions driven by indexable/content flags separately, with evidence; do not silently claim the pages are indexed.
- Preserve correct canonical/hreflang and sitemap handling without adding private, missing, or nonpublic pages.
- Existing web tests, build, CI and E2E gates pass and develop preview behavior is checked when deployed.
