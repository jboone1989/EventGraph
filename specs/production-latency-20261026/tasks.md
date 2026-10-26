# Tasks and verification

- [ ] A: Keep visible feed data; skip hidden overview queries for filtered/search views. Test filtered versus unfiltered loaders and prove their browser `pageReuse` keys are distinct (filtered → unfiltered → filtered).
- [ ] B: Stream optional report graph, retain bilingual report text and existing fallback semantics. Test slow graph and error.
- [ ] C: Review Cloudflare cache rule access. If available, cache only anonymous public HTML/.data with origin freshness and never admin/auth/API. Confirm HIT/BYPASS with headers.
- [ ] D: Run targeted tests/typecheck/e2e, CI review; merge to develop; deploy to main/VM09 via existing pipeline when green.
- [ ] E: Re-run equivalent browser and production metrics; record before/after, explain geography and limits.

Guardrails: no production schema/data changes; no Redis, worker or API redesign; do not bypass mandatory GitHub gates.
