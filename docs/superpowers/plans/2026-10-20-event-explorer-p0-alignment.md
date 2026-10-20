# Event Explorer P0 Alignment Plan

> **For agentic workers:** Execute against the approved Issue #61 spec and verify every checkbox before reporting completion.

**Goal:** Make the story Explorer's progress and source evidence follow the selected historical cutoff, while making empty graph states discoverable without fabricating event relations.

**Architecture:** Reuse `EventExplorer`, `EventTimeMachine`, `TemporalKnowledgeAtlas`, and existing `StoryDetail` data. Keep Graphiti as the only relationship source; do not add a second graph engine or deployment workflow.

**Tech Stack:** TypeScript, React, Node test runner, Playwright, existing GitHub Actions deployment.

**Spec:** GitHub Issue #61 and `docs/event-explorer.md`.

## Global Constraints

- `known` uses first-discovered timestamps; do not infer missing timestamps.
- `valid` uses the existing Graphiti `valid_at/invalid_at` query semantics and is explicitly retrospective.
- Current public/withdrawal filters always take precedence.
- Empty historical relations must remain empty; never substitute today's global graph as event evidence.
- Deploy to development only through the existing `feature → develop` workflow; do not touch `main` or production.

## Review Focus

- Missing discovery timestamps must not be guessed.
- The same selected cutoff drives reports, relations, evidence, and event-progress visibility.
- Source publication time and system discovery time must be distinguishable when available.
- Empty graph states must explain the limitation and link to the global knowledge network only as a separate exploration path.
- Mobile tab behavior and Chinese/English labels remain consistent.

---

### Task 1: Historical progress selector

**Files:**
- Modify: `apps/web/app/features/story/replay.ts`
- Test: `tests/event-explorer-replay.standalone.test.ts`

- [ ] Add a failing test for known-time filtering by `representative.discoveredAt` and valid-time filtering by `firstReportAt`.
- [ ] Run the standalone test and confirm it fails for the intended missing helper.
- [ ] Implement the smallest pure helper, excluding records with missing/invalid timestamps rather than guessing.
- [ ] Re-run the standalone test and verify both clocks.

### Task 2: Unified workbench and provenance

**Files:**
- Modify: `apps/web/app/features/story/EventExplorer.tsx`
- Modify: `apps/web/app/routes/story.tsx`
- Modify: `apps/web/app/features/story/TemporalKnowledgeAtlas.tsx`
- Test: `e2e/explorer.spec.ts`

- [ ] Render event developments inside the Explorer's time view, filtered by the same selected cutoff.
- [ ] Remove the duplicate current-only developments panel from the outer story page.
- [ ] Show publication and first-discovered timestamps distinctly in source evidence when available.
- [ ] In the empty-relationship state, explain that no event-specific public relation exists at that cutoff and offer a clearly separate link to `/knowledge`.
- [ ] Add regression assertions for cutoff filtering, timestamp labels, and truthful empty state.

### Task 3: Verification and delivery

- [ ] Run the new standalone regression test, existing Explorer E2E, typecheck, and relevant web tests.
- [ ] Review the diff against Issue #61; no unrelated changes.
- [ ] Open a PR targeting `develop`; wait for the existing Check/E2E/publish/deploy workflow.
- [ ] Verify the deployed digest, development HTTP response, and the real story page in the browser.
- [ ] Leave Issue #61 open until a real event with linked Graphiti relations passes the T1/T2 browser acceptance.
