# Task breakdown — reuse-first admin UI

## Work Items

### T001 — Make the existing admin UI reuse policy executable in Worker and reviewer guidance
**Scope:** Document the actual reusable admin components once; wire reuse-first and ordinary CRUD-quality review expectations into the existing AGENTS/CONSTRAINTS, GH-AW Worker and current central reviewer prompt, without adding new jobs, dependency sets or a replacement UI library.
**Depends on:** none
**Acceptance:**
- `docs/admin-ui-reuse.md` lists actual `develop` source paths of `AdminPage`, `DataTable`, `Pager`, form actions and controls, when to use them, when to extend them and when to research a mature external component.
- The existing Worker instruction makes code/component search precede admin UI code generation and records concise reuse evidence in the implementation PR body; no additional agent or workflow.
- The existing central reviewer independently checks admin UI changes for relevant CRUD defaults (conditional paging/filtering, bounded IDs/URLs, responsive title/action layout, core operation feedback) and demonstrable needless component reinvention. It identifies relevant blockers rather than mechanically failing every small list.
- `AGENTS.md` and `.agents/CONSTRAINTS.md` reference this same canonical guide; no duplicated multi-page checklist or broad rewrite of existing CRUD routes.
- A focused test or existing-review-check suite verifies the integration points without claiming to verify rendered UI; run typecheck and repository-required Check/Docker/E2E/review. The PR includes concrete before/after evidence and no new UI dependency unless an unmet capability is demonstrated and separately approved.
