# Three independent relational CRUD pages

Owner direction: 2026-11-04. This extends the merged simple binding spec at
specs/simple-model-crud-binding-20261103/spec.md.

- \`provider_connections\`: independent connection CRUD, including vendor, protocol,
  base URL and encrypted credential. Deleting a connection with models is refused;
  empty connections may be deleted whether enabled or disabled.
- \`registered_models\`: independent model CRUD with a provider ID foreign key.
  One row = one model. Test operates only on that row and does not automatically
  toggle routing or edit workflow assignments.
- \`provider_workflow_models\`: independently assign/unassign one registered model
  to each predefined workflow stage via its foreign key. Choices are loaded from
  \`registered_models\` on page navigation and never from a preset catalogue.
- Preserve existing UUIDs, credentials, models, binding rows and runtime defaults.
  Delete a model and all of its binding rows in one transaction (already in code).
- No schema migration, auto-discovery, timer/polling, implicit model import, bulk
  management or production main deployment.

Verify: separate navigable pages, create/edit/delete each connection and model,
provider FK selected from current connections, per-model isolated test, delete
dependency behavior, and live binding choices.