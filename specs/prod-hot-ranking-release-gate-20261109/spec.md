# Production release smoke: distinguish genuine hot-ranking data faults from legitimate sparse windows

**Status:** Draft
**Scope:** Existing production release acceptance and hot-ranking diagnostics, not the heat algorithm or end-user publishing rules.
**Incident:** GitHub Actions `release-main.yml` run [42602690058](https://github.com/jboone1989/EventGraph/actions/runs/42602690058), main `fa08c36799638c8d6456a679183361088d8fed3d`, 2026-11-09.

## Observed failure, not an inferred root cause
- The release classifier and immutable digest promotion succeeded; the production SSH action reached the host and downloaded the pinned image. The deployment script advanced the host checkout and reconciled app containers **before** smoke failed.
- After transient connection resets during rollout, page checks were HTTP 200, `/api/site/timeline` had 20 cards, and knowledge stats were episodes 3610 / entities 13356 / relations 26498.
- `/api/site/hot` returned HTTP 200 but `entries: []` in all ten smoke retries. `scripts/production-smoke.py` treats any zero hot entries as a hard failure, so production release ended red; Graphiti release jobs were skipped. This does **not** establish whether ranking refresh is broken, public evidence became invisible, or no stories qualify.
- The actual ranking rules are a 48-hour event window with at least two independent participants and one editorial participant. Recent timeline content does not prove these rules admit even one hot story.

## Product and engineering requirements
1. Preserve those heat/evidence/publication rules. Do not manufacture or seed fake hot entries, disable the scheduler, loosen minimum-participant/editorial thresholds, change the production database schema, or globally mute smoke errors.
2. Implement a **bounded, read-only, host-side diagnosis** for the existing production release path: the latest published `hot_rankings` `computed_at`, `rule_version`, stored entry count and `evidence.candidates`, publicly visible entry count, recent qualifying evidence (48h, 2 independent participants including editorial), and relevant source collection freshness. Do not log titles, raw articles, credentials or personal data. All diagnostics must come from actual data and fail safely on query failure, never invent a candidate count.
3. Keep hard failures for unavailable/invalid hot API, no or stale ranking computations, actual eligible hot candidates hidden by the public read layer, unavailable timeline, no real news content, empty knowledge graph, invalid sitemap, or environment/security checks. Report these as distinct actionable reasons. Do not turn a zero response into success when the live evidence says candidates should be visible.
4. Only when a **fresh** published heat snapshot genuinely has zero qualifying eligible stories (with the diagnostic independently validating the eligible set) may the release smoke treat `entries: []` as an *expected sparse interval* with a visible warning rather than a failed application deployment. Do not modify the user-facing ranking algorithm.
5. Make main release idempotent following a smoke failure that occurred **after** checkout/image/container changes: verify the exact promoted source and pinned digest rather than assume a failed Action means no live changes. Keep the automatic main release setting and GitHub-native promotion; do not switch off deployment or introduce ad-hoc manual publishing.
6. Add deterministic tests for fresh-empty legitimate window, absent/stale ranking, eligible-but-publicly-hidden entries, stale sources, malformed API, and successful populated hot ranking. Integrate them with existing required Check; keep Docker/E2E/independent review gates.
7. No direct VM09 modifications by the worker, no new queue, timer, migrations or browser scraping. Use the established Spec-first, GH-AW native Worker and normal PR auto-merge process. Validate actual production only through the existing verified main release workflow after reviewed main promotion.

## Acceptance evidence
- Operator can tell from release output whether the empty hot list is an expected evidence gap, a stalled ranking, an ingestion issue, or a publication/filtering bug; false-success is prohibited.
- Reproduced incident fixture demonstrates the correct conditional outcome with explicit reasons, not unconditional `count>=1`.
- Exact-HEAD Check/Docker/E2E/independent review pass for implementation; subsequent main release uses immutable digest and existing guarded deployment.
- Do not claim this incident is resolved until a real production smoke passes and any content incident is separately addressed.
