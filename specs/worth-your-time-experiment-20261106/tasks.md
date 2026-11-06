# Tasks: 值得看（Worth Your Time）实验栏目

**Spec:** [spec.md](./spec.md)
**Plan:** [plan.md](./plan.md)
**Status:** Draft — tasks are authorized only after Spec Review approval and merged Spec SHA.

## Execution rules

- Each Work Item is an independently reviewable implementation PR against develop and references the exact approved Spec SHA plus the owning Issue.
- Do not create a second Work Queue, GitHub scheduler, news analysis pipeline, user account, video scraper or model configuration system.
- Keep a single open implementation PR for each Task ID, fix CI/review findings on that PR's branch; respect existing Check/Docker/E2E/review/auto-merge gates.
- Match acceptance to actual code/tests and document which behavior is tested or verified in running develop.

## Work Items

### T001 — Store and expose a minimal public Worth collection

**Scope:** Add the smallest persistent Worth entry model, typed public API/read layer and existing-admin CRUD, following current publication visibility rules and audit/session/CSRF patterns.

**Depends on:** none

**Acceptance:**
- Two localized public read paths can fetch at most five published entries for a selected UTC day, with category, original source URL, attribution, short reason, order and nullable estimated duration.
- Draft/hidden entries and now-ineligible internal publications do not appear; archive days remain accessible and duplicate URL/item within one day is rejected.
- Existing administrator can add an external URL with explicit metadata, update/reorder/publish/hide an entry; unauthorized writes fail and audited edits are visible.
- New additive migrations comply with repo migration numbering/one-statement rule; typed contracts and focused DB/API tests cover empty, hidden, duplicate, invalid URL and UTC date cases.

### T002 — Select high-value entries with the existing worker and model receipts

**Scope:** Add an independent once-a-day UTC 00:30 curation task, deterministic candidate narrowing and at most one bounded LLM batch assessment, reusing live model config, paid receipts and existing worker infrastructure.

**Depends on:** T001

**Acceptance:**
- Selection reads no more than 30 eligible recent public article summaries plus admin-entered candidate metadata, filters duplicate/recently selected URLs and same-event repeats, and publishes 0–5 entries; it never modifies news publishing, analysis, scoring, Hero or hot ranking.
- Default run makes at most one batch model request through the existing provider routing, budget/receipt records and daily logical key; same-day reruns reuse completed results and do not create unbounded attempts.
- Admin can request a single explicit controlled rerun without losing manually published, reordered or hidden overrides; selection is idempotent for the same date/source.
- Model outage, invalid output, missing configured model and zero valid candidates produce visible diagnostics and no fabricated results; tested failure path leaves the existing news pipeline operational.
- AI-created videos or posts are not automatically excluded or rewarded; the recommendation must have a grounded reason and no unsupported emotional-certainty claims.

### T003 — Add bilingual responsive Worth Your Time pages

**Scope:** Add /worth and /en/worth Beta pages with small curated cards and historic-day navigation, using existing site route, public API loader, localized copy and navigation components.

**Depends on:** T001

**Acceptance:**
- Desktop More navigation and mobile /more expose the new experimental section without replacing homepage, Hero or existing five-tab phone navigation.
- Cards show real title/source/short explanation/value category/nullable duration, image when a supported existing source image is available, and a working original-content link (internal item or external URL).
- Both language variants have localized UI and recommendation copy; untranslated content does not masquerade as translated, empty days state no available picks, and each day shows 0–5 entries without infinite scroll.
- Server-side render/HTTP API cache and item visibility changes behave consistently; page rendering makes no model calls.
- Focused web tests cover both locale paths, mobile layout/nav, external links, missing media, missing time and 0/1/5-entry states.

### T004 — Capture value feedback and evaluate the experiment

**Scope:** Add three anonymous per-recommendation votes, reuse session-based analytics to report value outcomes by UTC day, and document a repeatable 14-day observational review.

**Depends on:** T003

**Acceptance:**
- Visitors can submit Worth / Okay / Wasted-time and change their response for the same entry in the same anonymous browser session, with one current vote per entry+session; no account or fingerprinting added.
- Backend validates input, uses same-origin/rate-limiting conventions and isolates feedback failures from recommendation reading; prior votes can be changed without inflating current vote count.
- Existing analytics records Worth page opens and original-link clicks with unambiguous denominators, and admin displays recommendations/clicks/feedback counts by UTC day; vote counts are not mislabeled as unique people.
- Measurement includes effective-sample count, the three-way feedback distribution, exceptions and model cost evidence; under 30 votes is explicitly labelled exploratory.
- Tests cover duplicate vote/update, missing or removed entry, malformed input, rate limit, anonymous/session storage unavailability and a failed feedback request without broken page rendering.
