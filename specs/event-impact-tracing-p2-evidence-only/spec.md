# T08 evidence-only energy / shipping slice — DRAFT

The Owner explicitly requested implementation now in an independent worktree, with
the implementation kept DRAFT until approval. This authorizes writing this patch;
it does **not** approve the P2 Spec, merging, deployment, or task completion.

Base: `08b43f3692fb31f027ea4d8db7015248c03ce08a`, verified against GitHub develop
on 2026-10-29. Issue: https://github.com/jboone1989/EventGraph/issues/176 (T08).
Research reference, **unapproved**: PR #210, commit
`95749a45364097ddfad5e81332567b35e861b9c0`,
`specs/event-impact-tracing-p2/spec.md` and `evidence-2026-10-28.md`.
This is a deliberately smaller evidence-only implementation, not fulfillment of
that draft's numeric-series acceptance criteria. T08 remains incomplete.

## Search Before Build

- Existing `industry/sources.json`: `rss-eia-energy`, `rss-eia-press` and
  `rss-gcaptain-maritime` already provide reports; retain their collection path.
- Existing `ImpactEvidence.tsx` and `impact-evidence.ts` (P1 workbench) already
  intersect StoryRoute station evidence with the loaded public timeline, reject
  unsafe URLs and future publications, and apply known/valid replay. Extract that
  boundary for reuse; keep the four existing impact areas and market behavior.
- `EventExplorer.tsx` already supplies the shared clock/cutoff. Use its existing
  impact station; no API, graph, database or ingestion subsystem is required.
- `publication/market.ts` and `market_snapshots` have crypto / USDT semantics.
  Do not put energy prices or shipping counts there.
- AIHOT upstream `package.json` was read using the GitHub connector. Its
  `packages/backend/src/publication/market.ts` returned 404; no claim of exhaustive
  upstream inspection. Importing another ingestion framework is unnecessary for
  projecting reports that are already collected.
- EIA [official API docs](https://www.eia.gov/opendata/documentation.php) describe
  structured observations (including string-valued JSON data); those are a distinct
  future integration, not values to extract from news titles.
  [Reuse terms](https://www.eia.gov/about/copyrights_reuse.php) were read: acknowledge
  EIA and publication date. The drawer shows the source and publication time.
- IMF terms returned HTTP 403 in this session. PR #210 records unresolved
  commercial permission. Conservatively exclude PortWatch leads from this new
  projection; add no PortWatch data or licensing toggle. No fresh series fetch,
  source freshness verification, or numerical evidence reproduction was performed.
- Alternative rejected: promote draft research tables to product price history.
  Research samples are not timestamped production observations. A numeric adapter,
  persistence, worker schedule and market comparison require their own approved
  scope and source validation.

## Acceptance and implementation plan

1. Add a discriminated `energy` / `shipping` report type, with EIA HTTPS host
   validation for energy and shipping keyword discovery for shipping. Neither
   classification establishes event impact or authenticates the report's claims.
2. Reuse the public station/timeline intersection, deduplication and clock logic.
   Preserve URL, article ID, published/discovered times and current revision.
3. Render two compact bilingual cards inside the current impact station, with
   native source drawers, original report links and internal provenance links.
   Show at most four reports per card and disclose truncation.
4. Show honest empty states and permanent caveats: no numeric series, baseline,
   trading-day or window-closure verification; no freight indicator or PortWatch
   data; supply/demand, inventories, currencies, blockades, rerouting and AIS/GNSS
   gaps are alternative explanations. Do not add chart edges or attribution.
5. Test nonempty/empty projection, source spoofing, replay, embargoes, deduplication,
   no numeric extraction and bilingual source drawers. Re-run P1 tests and web
   typecheck/build. Record incomplete broader checks without claiming CI success.

No migrations, schedules, credentials, sources, market prices or observations are
added. Full P2 numeric baselines, trading calendars, known-time series persistence,
freshness/stop conditions and closed event windows remain out of this patch.
