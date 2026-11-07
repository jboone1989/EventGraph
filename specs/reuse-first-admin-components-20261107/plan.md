# Implementation plan — reuse before building Admin UI

## Scope and prior art

Reuse existing `AdminPage`, `DataTable`, `Pager`, `Field`, `Input`, `Select`, `Button`, `ReasonDialog` from `apps/web/app/features/admin/ui.tsx`. Reuse any suitable existing `apps/web/app/components/ui/` patterns only where the style/context matches. `ProviderConnectionsAdmin.tsx` contains an existing real pagination example. Keep the current code and stack; no external dependency by default.

Check official upstream/maintained options if a specific capability is missing; e.g. TanStack Table supports pagination, column sizing and filtering while shadcn's Data Table documentation describes combining headless table behavior with presentational components. These options are not mandatory and are not part of the initial change.

## Smallest implementation

1. Write **one** concise `docs/admin-ui-reuse.md` covering current component paths, selection rules, conditional defaults, example acceptance matrix and a tiny code sample using existing components. Prefer direct links to the actual source over copying the implementations.
2. Link the guide from `AGENTS.md` and `.agents/CONSTRAINTS.md` (already loaded by supported task-specific skills). Require a short 'Reuse decision' paragraph in implementation PRs that change admin UI: existing components reused / checked gap / reason for any custom code. Nothing extra for non-UI PRs.
3. Amend the **existing** `.github/workflows/eventgraph-worker.md` instructions for the assigned Worker: before writing UI, inspect the guide and relevant code; do not create redundant primitives; include concise reuse evidence in its existing PR body. Do not change queue assignment, tool permissions, model, branch policy or safe-output semantics.
4. Amend the **existing** implementation reviewer prompt in `.github/workflows/check.yml` minimally: when reviewing admin UI, check the actual reuse choice and obvious UI quality regressions, ask for proof if claimed behavior is unverified, and reject demonstrable duplicated table/pagination/dialog code without good cause. Keep existing reviewer schema, status/check names, actions and thresholds unchanged.
5. Add or update focused Node tests following existing `scripts/ci` test conventions to assert the relevant Worker and central reviewer contain these guidance hooks; use existing browser/E2E tests for actual layout and interaction behaviors as applicable to future UI PRs. Do not treat text keyword tests as proof of UI quality.
6. No implementation change to all current CRUD pages in this task. If existing generic primitives have severe defects, capture repro and create a **separate** approved UI bug task instead of expanding this work.

## Verification

- `npm run typecheck`, existing relevant `scripts/ci/*.test.mjs` suites and full existing required GitHub checks.
- Independent code review must verify instruction text accurately matches the real repository UI, actual Worker prompt and review gates; check that no duplicate CI job, extra approval, dependency or background service was added.
- No claim of a live UI regression fix merely from this policy/guidance change.
