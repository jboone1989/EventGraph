# Tasks and verification

- [ ] A: Keep search-only Trending while skipping hidden overview requests only for tag/category/channel filters. Verify filtered → unfiltered → filtered and warm unfiltered → filtered, including cached fallback and no redundant fetch.
- [ ] B: Stream optional report graph, retain bilingual report text and fallback semantics. Verify 1s late-success and 3s timeout/error cases separately.
- [ ] C: Review Cloudflare cache rule access. If available, cache only anonymous public HTML/.data with origin freshness and never admin/auth/API. Confirm HIT/BYPASS with headers.
- [ ] D: Run targeted tests/typecheck/e2e and mandatory independent review; merge to develop after green gates. Promote to main and deploy VM09 only under the existing **weekly production release policy**, not immediately on CI success.
- [ ] E: After the authorized weekly production release, re-run equivalent browser and production metrics; record before/after, explain geography and limits.

Guardrails: no production schema/data changes; no Redis, worker or API redesign; do not bypass mandatory GitHub gates.
