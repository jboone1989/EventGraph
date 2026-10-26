# Tasks and verification

- [ ] A: Search-only keeps Trending but skips hidden knowledge-graph/stats; tag/category/channel filtered views skip hot too. Test cold/warm overview → search → filtered and reverse, ensuring no poisoned cache and no redundant fetch when a fresh complete broader frame exists; when a hot/daily request fails, the frame must not satisfy a narrower view that **needs the failed field**; a narrower view whose required fields succeeded can still reuse it (e.g., hot failed but daily OK allows filtered, daily failed forces both search and filtered to fetch). Its own offline cache remains intact.
- [ ] B: Stream optional report graph, retain bilingual report text and fallback semantics. Verify 1s late-success and 3s timeout/error cases separately.
- [ ] C (separately authorized follow-up, not this PR): Keep Cloudflare public HTML DYNAMIC. Future edge HTML/.data caching requires its own approved spec and evidence that degraded responses are no-store/BYPASS, admin/auth/API bypass caching, and query URLs are excluded or safely keyed.
- [ ] D: Run targeted tests/typecheck/e2e and mandatory independent review; merge to develop after green gates. Promote to main and deploy VM09 only under the existing **weekly production release policy**, not immediately on CI success.
- [ ] E: After the authorized weekly production release, re-run equivalent browser and production metrics; record before/after, explain geography and limits.

Guardrails: no production schema/data changes; no Redis, worker or API redesign; do not bypass mandatory GitHub gates.
