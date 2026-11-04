# 005 · Tasks & durable handoff

Status is evidence-backed; editing a file or opening a PR is not equivalent to running tests, merging, development rollout or production release.

## This PR · US1 (P1)

- [x] Research First: inspect actual `develop` code; independent challenge (prior completed Claude), official Google Search Console/Ads policies and open-source alternatives. Evidence: `research.md`.
- [x] Preserve approved product decisions in `spec.md`; link from repository `AGENTS.md` for future sessions.
- [x] Record implementation architecture, scope limits and metrics in `plan.md`.
- [x] Implement actual page-type grouping of current Search Console page data, preserve original totals and Top 10. See `search-page-types.ts`, `search-console-analytics.ts`.
- [x] Add focused unit tests covering normalized URL paths and zero/ambiguous rows. See `tests/search-page-types.standalone.test.ts` (execution requires CI).
- [x] Render grouped statistics in existing admin Analytics only (no new route/dashboard). See `ExternalAnalytics.tsx`.
- [ ] Verify typecheck / tests and PR diff against specs.
- [ ] Submit PR to `develop`, obtain GitHub Check/E2E + independent Claude PR review; merge only if passes.
- [ ] Verify development deployment and existing authenticated admin report, with actual proof. **Production not in scope.**

## Next PR · P0 inventory (first step before Asia UI)

- [ ] Reconcile `industry/sources.json`, current `develop` and live dev/prod sources; locate newly added Asian sources in actual branch/state.
- [ ] Separate `hot_signal`, `editorial`, first-party official notices and country/language claims; collect 7-day publication and event-membership counts.
- [ ] Only then decide whether tags/regions or source translation can add actual value.

## Next PR · US2 content + click paths

- [ ] Choose 10–20 *actual* news URLs with Search Console impressions and compare within a similar cohort.
- [x] Reuse current source citations, `relatedStories` and `GroupSources` to surface incremental facts and one event next-step, only with evidence. Evidence: PR `feat(item): show the report's event as its What Next layer (005 US2)` — `storyContextFor` in `packages/backend/src/publication/stories.ts` reuses the event page's own joins/latest/status; `EventContext` in `apps/web/app/routes/item.tsx` renders it only when the event has >1 report; follow-ups and related events now also render in English; tests in `tests/content-publication.test.ts`. No model calls, no new tables.
- [ ] Validate mobile first-screen, English copy, source rights, item independent canonical and SEO metadata beyond the suite (item canonical/meta untouched; `seo-meta`/`entity-seo` web tests pass; browser check pending the Search Console cohort above).
- [ ] Compare on-site second navigation after introducing changes; do not claim significant CTR improvements with tiny counts.

## Next PR · US3 return reasons

- [ ] Inspect actual first-/repeat-visit cohort data feasibility; never call sessionStorage tab sessions unique returning users.
- [ ] Reuse `Following` + `local-state` to show changed event content since last read if justified.
- [ ] Evaluate RSS/daily as low-cost passive follow-up; email/notifications require user decision and evidence.

## Explicit STOP list

- [ ] (Non-task) Delete or deindex article pages en masse; global canonical to stories; rebuild homepage/news engine/analytics platform; create Asia pages without actual feeds; bulk auto-generate SEO prose; enable advertisements on unreviewed auto-content.

## Resume after a new conversation

Read `AGENTS.md`, `specs/005-news-growth-funnel/{spec,research,plan,tasks}.md` and the latest PR/branch state. Pick the earliest unchecked task with evidence, not assumptions from the prior chat. Keep the existing `feature → develop → main` policy and production release distinct from dev rollout.
