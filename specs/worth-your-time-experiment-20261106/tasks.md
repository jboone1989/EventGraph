# Tasks: Ferro「值得看」内容价值发现实验 · EventGraph scope only

**Spec:** [spec.md](./spec.md)  
**Plan:** [plan.md](./plan.md)  
**Status:** Draft; no Work Item authorized until revised Spec is independently reviewed and merged into develop.

## Execution policy

Each task is one focused EventGraph implementation PR tied to its GitHub Issue and immutable merged approved Spec SHA. Only use existing GitHub Spec Producer/Projects/GH-AW Work Queue. No duplicate PR or new scheduler. **These tasks implement the experiment's public evidence and feedback interface, not Ferro's independent cognition or discovery loop.** Ferro-side feature work is not automatically dispatched to EventGraph's repository.

## Work Items

### T001 — Expose source-grounded Ferro discovery experiment cases

**Scope:** Reuse the existing research module's public/editor framework to persist and display authored value-discovery cases with original works, research evidence scope, corrections and clear source attribution on /worth and /en/worth.

**Depends on:** none

**Acceptance:**
- Public experiment pages exist at /worth and /en/worth, showing independently authored cases in chronological order, with author (initially Ferro), original work URL/source, media type, judgement reason, material actually examined, limitations and revision history.
- Cases are not scored, ranked by popularity, rendered as a personalized feed or forced to publish a daily quota; 0/1/many cases display correctly on desktop/mobile and navigation is limited to existing More/mobile My entry.
- A case that only has a title/summary is labelled as metadata-level judgement; it must not imply the agent watched or understood the full video. AI-made works are neither excluded nor privileged.
- Existing admin-authorized operations allow a case to be created, edited, published, revised or withdrawn with provenance and audit. Hidden/withdrawn cases never appear in public reads, and modifying cases does not affect EventGraph news publication/SEO.
- Tests cover typed contracts, external URLs, internal public source references, revisions, bilingual cases/fallback, unauthorized writes, empty states and news isolation; no model/provider request runs during page load.

### T002 — Provide an author-neutral, controlled case submission and feedback read boundary

**Scope:** Reuse an existing EventGraph authenticated writer/integration pattern to enable Ferro or another attributed author to supply and revise cases and obtain aggregate feedback; no Ferro-specific agent runtime or secret subsystem in EventGraph.

**Depends on:** T001

**Acceptance:**
- Submit/correct operations validate author ID, original URL, content scope and evidence, reject unknown/incomplete sources and are idempotent by stable case identity without duplicating cases on retry.
- No Ferro-only scheduler, model evaluator, polling agent, credential service, generic news-ingest hijack or new independent work queue is added; if current existing authenticated writer cannot support direct Agent delivery without new infrastructure, retain admin-mediated publication and document the precise missing Ferro-side integration rather than claiming autonomous publishing.
- A changed judgment creates inspectable case revision history, including false positives; a withdrawn work is hidden from public output but not erased from operator audit.
- Authenticated readers can retrieve only aggregated feedback to support Ferro's own reflection; never expose session identifiers or pretend this has updated Ferro cognition.
- Focused tests cover authorized/unauthorized/corrupt submissions, duplicate delivery, revision history, retrieval of aggregated feedback and the unchanged news-processing pipeline.

### T003 — Capture human value feedback and compare against a transparent baseline

**Scope:** Let readers evaluate finished cases as worth/okay/wasted and optional new-to-me, then summarize the exploratory experiment against a documented, manually selected popular-content comparison set.

**Depends on:** T001, T002

**Acceptance:**
- Visitors can choose Worth / Okay / Wasted time, optionally marking the original as previously unknown, and change their choice in the same anonymous browser session; one current case vote per session is counted.
- Reuse existing anonymous session and same-origin/rate-limiting conventions, with a nonblocking error/disabled state when client storage or vote submission is unavailable; do not add login, fingerprinting, user preference models or recommender targeting.
- Show per-case feedback counts, disagreement and denominators; report known/not-known ratio and value among previously unknown works separately from raw clicks and time-on-page, without labelling session IDs as unique people.
- A small transparent comparison set with original links and matching topic/media/time criteria can be entered without an automatic popularity crawler. Capture case successes, misses and systematic selection biases, including the possibility that Ferro's picks are no better than the baseline.
- A 14-day exploratory report can be produced with evidence, raw valid feedback count, limitations and cost/integration status; under 30 valid votes is labelled exploratory, never "statistically proven".
- Focused API/web tests cover no votes, duplicate/changed votes, hidden cases, comparison-case attribution and aggregate feedback; a mocked Ferro submission does not qualify as a proven real Ferro runtime integration.
