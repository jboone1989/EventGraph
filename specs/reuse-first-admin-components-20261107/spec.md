# Reuse-first Admin UI development: search components before implementation

**Status:** Proposed — pending independent Spec Review and owner approval. This conversation requests a concrete adoption plan; do not infer that the owner has already approved implementation or authorize GH-AW intake before approval.
**Target:** develop only. Preserve existing feature → develop → main release policy.

## Problem and product intent

Owner observation, 2026-11-07: experienced developers normally search and reuse established UI primitives when asked for routine CRUD. AI-generated EventGraph administration pages repeatedly implement the literal endpoint/button requirement while omitting ordinary list usability, such as pagination, bounded long identifiers, sensible column widths and reliable responsive layouts. One-off patching causes repeated review loops. The objective is to transfer these reusable engineering defaults into the existing EventGraph workflow, **not** to require the owner to specify every standard CRUD detail.

A normal administration CRUD feature should arrive with coherent listing, editing, user feedback and responsive behavior appropriate to its data volume; the exact business semantics remain defined in its feature Spec.

## Research First / repository baseline (verified on develop)

- `apps/web/app/features/admin/ui.tsx` already exposes `AdminPage`, `DataTable`, `Pager`, `Select`, `Input`, `Button`, `ReasonDialog` and supporting admin primitives. `DataTable` currently uses a minimum 640px table width and horizontal scrolling; `Pager` exists separately.
- `apps/web/app/features/admin/ProviderConnectionsAdmin.tsx` already uses `DataTable` for provider/model rows and applies client-side pagination to model rows. Its vendor list and account-specific business semantics are not universal UI primitives.
- `apps/web/app/components/ui/` contains separately styled public-site primitives; do **not** mechanically merge them with admin controls.
- `apps/web/package.json` uses React 19, React Router 8 and Tailwind CSS 4; no TanStack Table or third-party table component is presently installed in the web workspace.
- `.agents/CONSTRAINTS.md`, `AGENTS.md`, `source-driven-development` and central code review in `.github/workflows/check.yml` already require Search Before Build, but **do not provide a concrete admin component selection map or a reviewable reuse decision for routine UI work**.
- External alternatives exist, e.g. official https://tanstack.com/table/latest/docs/framework/react/guide/pagination and https://ui.shadcn.com/docs/components/radix/data-table . These are *candidates for a verified gap*, not an automatic dependency upgrade; do not assume they match the currently installed React stack without checking versions, license and integration.

## Behavior contract

1. **Reuse search order:** For each new or materially changed administration UI feature, inspect (a) current repository features and shared primitives, (b) APIs of already installed dependencies, (c) maintained upstream/official component solutions, and (d) new custom implementation only for a verified missing need. Search Before Build is a decision with concrete file links/evidence, not a self-attested slogan.
2. **Canonical admin reuse map:** Maintain one concise discoverable admin component guide documenting existing reusable paths, intended use, limitations and how to choose between simple `DataTable` + `Pager`, existing route-specific logic, and external table/interaction libraries when a real gap is demonstrated. Link the guide from existing `AGENTS.md` and `.agents/CONSTRAINTS.md`; no duplicate registry, new agent, automation, scheduler or documentation subsystem.
3. **Normal CRUD defaults:** Unless a feature Spec explicitly overrides them, the implementation must consider: accessible page heading, usable list and row actions, appropriate search/filter/pagination for expected data volume, long URL/UUID display without crushing adjacent columns, add/edit/delete outcomes, loading/empty/error states, and desktop/mobile layouts. Treat these as conditional reviewable defaults, **not** unconditional mandates (e.g. no pagination for a short fixed list, no delete for an immutable entity).
4. **Bounded long text:** Long IDs/URLs retain full-value access (copy, tooltip/details or equivalent) while truncation, wrapping or horizontal scroll prevents shrinking other fields or the page title. No arbitrary hidden data loss.
5. **Review gate uses existing workflow:** Update the **existing** central implementation reviewer/Worker guidance to require an evidence-backed reuse choice for affected UI areas and to independently check applicable CRUD defaults against the actual diff and tests. A proven gratuitous reimplementation of an existing component, or a material regression in usability, is a review blocker. Missing evidence produces an actionable request, not an assumed PASS. Do not add an extra mandatory job, CI workflow or review agent.
6. **Test at the right level:** Add focused regression coverage where needed for shared UI invariants and representative actual operations. For PRs changing responsive admin layout, require demonstrable browser-width checks or screenshots for mobile and desktop (e.g. 390/1530px), and require a reasoned exception when UI cannot be run. Do not assert a rendered result from source-only tests. Avoid inventing universal performance/accessibility thresholds without measured baselines.
7. **No premature UI rewrite:** Preserve existing admin APIs and behavior. Do not mass-migrate all admin pages, introduce TanStack/shadcn as a second system without an agreed concrete capability gap, or force every list into the same complex table abstraction. Avoid broad styling or workflow restructures.

## Acceptance

- A developer following the standard can identify the canonical `AdminPage`, `DataTable`, `Pager` and form/action primitives and their file locations without asking the owner to describe generic CRUD behavior.
- A sample CRUD feature PR identifies the existing reusable components used, any missing capability, and (only when justified) a reference to official external candidates. It does not add a new table/pager/dialog implementation duplicating those primitives without explanation.
- Independent review checks the PR's actual modifications for column behavior, row action usability, conditional pagination/search, responsive heading and long-text handling, and fails with an actionable finding when a relevant invariant is violated. Reviewer must not approve only because Spec reference is present.
- Guidance is present in the existing Worker and central code review entrypoints; no extra bot, pipeline, reusable-UI catalog database or new global dependency is installed.
- Focused tests cover the changed guideline/review integration where practical, and existing GitHub Check/Docker/E2E plus independent reviewer pass before implementation merge. No success or deployment claim without a run receipt.

## Authorization and scope

This is a standards-and-review improvement. It does not itself redesign any existing product page. Since implementation touches the GH-AW Worker guidance and the `check.yml` implementation reviewer, **first independently review and merge this separate Spec PR**; only after owner approval may the authorized Worker implement the one Work Item in `tasks.md`. A docs-only preliminary inventory is permissible as Spec research, but do not sneak workflow modifications into this Spec PR.
