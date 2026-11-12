# Tasks: Ferro「值得看」内容价值发现实验 · EventGraph scope only

**Spec:** [spec.md](./spec.md)  
**Plan:** [plan.md](./plan.md)  
**Status:** Draft; no Work Item authorized until revised Spec is independently reviewed and merged into develop.

## Execution policy

Each task is one focused EventGraph implementation PR tied to its GitHub Issue and immutable merged approved Spec SHA. Only use existing GitHub Spec Producer/Projects/GH-AW Work Queue. No duplicate PR or new scheduler. **These tasks implement the experiment's public evidence, human emotional feedback and stable outcome-export interface, not Ferro's independent cognition or discovery loop. Ferro's existing shared content agent owns fun/research/worth creation (Ferro Issue #297); this Spec must not duplicate the generic author-submission interface already scoped by EventGraph fun Spec PR #434.** Ferro-side feature work is not automatically dispatched to EventGraph's repository.

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

### T002 — Provide an author-neutral case submission and versioned human-outcome boundary

**Scope:** Support Worth-specific precommitted hypotheses/case revisions and versioned anonymized human-outcome receipts using existing research/admin writer or the shared authored-artifact interface from the fun Spec. Do not create a second generic author submission service, Ferro-specific learning engine or credential subsystem.

**Depends on:** T001

**Acceptance:**
- Submit/correct operations validate author ID, original URL, content scope and evidence, reject unknown/incomplete sources and are idempotent by stable case identity without duplicating cases on retry. Record hypothesis and Ferro policy version **before** public feedback; a later correction cannot overwrite the pre-feedback judgment.
- No Ferro-only scheduler, model evaluator, polling agent, credential service, generic news-ingest hijack or new independent work queue is added; **do not duplicate the shared author-auth/upload path from fun Spec PR #434**. If current writer lacks direct Agent delivery, retain admin-mediated publication and document the missing Ferro-side integration (Ferro Issue #297), not claim autonomous publishing.
- A changed judgment creates inspectable case revision history, including false positives; a withdrawn work is hidden from public output but not erased from operator audit.
- Authenticated readers can retrieve stable case/revision/strategy-linked outcome snapshots containing cutoff/time window, effective sample count, vote distribution, optional emotion-tag distribution, novelty and self-reported exposure, exclusions and snapshot version. Never expose session IDs, IPs, identities or raw free-text; repeated consumption of the same snapshot is idempotent.
- Explicitly distinguish **feedback received**, **Ferro domain evidence accepted by Agent Runtime**, and **prospectively proven policy improvement** as separate statuses; a mocked submission is only an API test, not learning evidence.
- Focused tests cover authorized/unauthorized/corrupt submissions, duplicate delivery, revision history, retrieval of aggregated feedback and the unchanged news-processing pipeline.

### T003 — Capture human emotion/value feedback for Ferro learning evidence and comparison

**Scope:** Let readers rate finished cases as worth/okay/wasted with optional emotional experience and new-to-me signals, generate versioned, evidence-scoped outcome summaries for Ferro and compare against a documented, manually selected popular-content comparison set.

**Depends on:** T001, T002

**Acceptance:**
- Visitors can choose Worth / Okay / Wasted time, optionally marking the original as previously unknown, selecting emotion tags (moved/joy/surprise/thoughtful/neutral/other), noting whether they actually experienced it and adding a brief subjective reason. All extra fields are optional; changing or withdrawing a choice in the same anonymous browser session updates the current vote, not independent sample size.
- Reuse existing anonymous session and same-origin/rate-limiting conventions, with a nonblocking error/disabled state when client storage or vote submission is unavailable; do not add login, fingerprinting, user preference models or recommender targeting.
- Show per-case feedback counts, disagreement, experience-tag distributions and denominators; report known/not-known ratio and value among previously unknown works separately from raw clicks/time-on-page, without labelling session IDs as unique people or subjective majority votes as universal emotional truth.
- Versioned, cutoff-bound outcome aggregates preserve the original Ferro prediction/strategy version and samples/exclusions for comparison; corrections/withdrawals make a new aggregate version without creating another counted voter. No user session ID or raw personal free text is exported to Ferro.
- A small transparent comparison set with original links and matching topic/media/time criteria can be entered without an automatic popularity crawler. Capture case successes, misses and systematic selection biases, including the possibility that Ferro's picks are no better than the baseline.
- A 14-day exploratory report can be produced with evidence, valid feedback count, emotion-disagreement patterns, limitations and Ferro Runtime integration status; under 30 valid votes is labelled exploratory, never "statistically proven". The report distinguishes prediction/feedback correlation from actual subsequent Ferro policy improvement.
- Focused API/web tests cover no votes, duplicate/changed/withdrawn votes, optional emotions, hidden cases, comparison-case attribution, stable snapshot versions, empty/unknown outcomes, and aggregate privacy. A mocked Ferro submission does not qualify as a proven real Ferro Runtime learning integration; EventGraph contains no model trainer/learning state machine.
