# Implementation plan — complete Spec first, reuse components second

## Existing integration (Search Before Build)

- The *current* feature implementation gate `scripts/ci/check-spec.mjs` checks immutable pre-existing Specs; it does **not** by itself check whether the approved Spec describes a complete user experience.
- `.github/workflows/check.yml` already has both independent `spec-review` and implementation `claude-review`; expand their existing evaluation criteria rather than creating new jobs, agents, approval loops or review protocols.
- Existing `AGENTS.md`, `.agents/CONSTRAINTS.md`, `docs/spec-review.md` and `.github/workflows/eventgraph-worker.md` already instruct the agent to read the pinned Spec and reuse existing code. Integrate one shared feature-quality reference rather than copying a huge checklist into every entrypoint.
- Existing Admin primitives: `AdminPage`, `DataTable`, `Pager`, `Field`, `Input`, `Select`, `Button`, `ReasonDialog` in `apps/web/app/features/admin/ui.tsx`. `ProviderConnectionsAdmin.tsx` shows actual DataTable with paginated models. `apps/web/app/components/ui/` is the independently styled public-site UI.
- React 19, React Router 8, Tailwind 4 are already installed. TanStack Table and shadcn Data Table are research candidates only for a proven gap; initial implementation should add no new dependency.

## Minimal implementation in a single authorized Work Item

1. Write **one** compact `docs/admin-ui-reuse.md` with two **separate** sections: **(A) Product/Spec completeness** (user goal, scope, data semantics, ordinary CRUD/default UX, key states, boundaries and verifiable scenarios) **before (B) UI-component reuse map** (actual current file paths, usage, limitations, when to check official external options). Default expectations must be contextual, not rigid mandates.
2. Link this exact guide from `AGENTS.md`, `.agents/CONSTRAINTS.md` and optionally `docs/spec-review.md` if necessary to avoid contradictory guidance. Keep the canonical product/reuse expectations in the guide, not replicated across multiple templates.
3. Adjust the existing `spec-review` **prompt** in `.github/workflows/check.yml` to flag **material incompleteness**: a Spec claiming CRUD while omitting the main user journey, important business semantics, relevant list states, failure behavior or testable acceptance; distinguish ordinary defaults that can be inherited from genuinely open domain decisions. Avoid forcing every minor change into a long form. Keep existing JSON schema, reviewer engine and one-pass rules.
4. Adjust the existing GH-AW Worker instructions so it reads approved Spec and default product contract *before* choosing components, then inspects existing repo features/components and official alternatives before implementing. Require a compact implementation PR evidence matrix: requirement/scenario → code → tests or browser outcome, plus reuse rationale. The Worker must not silently invent material data semantics; report a true Spec ambiguity instead.
5. Adjust the **existing implementation `claude-review`** guidance in `check.yml` to inspect the actual diff against the Spec and applicable default quality requirements. Reviewers should detect a literal CRUD-only implementation missing normal user experience, long data crushing columns, actual unusable actions, and needless self-written component substitutes. Do not approve just because a Spec SHA and passing API test exist. Do not demand unverified browser claims or introduce new jobs.
6. Add focused tests along existing `scripts/ci` conventions to verify these prompt/Worker integration points and a minimal positive/negative Spec-completeness example if feasible. Tests checking prompt text are *wiring checks*, not proof the LLM's judgment is always correct. UI browser/visual regression stays in each relevant implementation PR.
7. Leave existing application UI and business CRUD pages unchanged. Any common UI primitive bug found during adoption requires a separately approved product bug scope, not hidden refactoring in a governance change.

## Completion criteria and evidence

- Reviewer can explain why a one-line `add CRUD` Spec is incomplete for a material new feature and identify missing user-facing behavior, without imposing irrelevant requirements on a tiny fix.
- Worker reads the approved Spec and existing UI map, shows justified reuse, and traces each important acceptance item to a change and observed test/browsing evidence.
- Existing review pipeline finds product-level gaps separately from code-level quality defects, while preserving all current CI/status/release gates.
- `npm run typecheck` when applicable, focused repo tests, existing GitHub Check/Docker/E2E and independent review. Do not infer successful browser behavior or deployment from documentation-only tests.
