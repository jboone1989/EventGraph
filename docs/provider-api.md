# Provider connections and models

Implemented together on `feat/provider-connections`: schema, migration, runtime dispatch, HTTP routes, discovery and the management editor. Deploy them together; old workers cannot read `model:<uuid>` references.

## Identity and configuration

`provider_connections` stores a connection's UUID, editable name and vendor label, protocol,
complete base URL prefix, timeout, enabled flag and credential. Only `openai-compatible` is
currently supported. No implicit `/v1` is added. The adapter appends `/chat/completions`,
`/embeddings` or `/models` to the configured prefix.

`registered_models` uses its own UUID, with `(provider_id, model_id)` unique. The upstream
model ID, connection, adapter, capabilities, request defaults, test request, streaming,
complexity, documentation, notes and enabled/route flags are configuration. Versions,
timestamps, upstream metadata and test observations are backend owned. A model may override its connection timeout with `timeoutOverrideMs`; null inherits it. The connection
has a separate enabled flag; model calls require both levels enabled.

Existing exact API endpoints are retained as `endpointOverride`. This field may be cleared
to use the connection's base URL. All new models default to disabled and unrouted.

Vendor labels do not select an adapter or grant policy exemptions. Connections pointing at
an approved NVIDIA host acquire `nvidia-free-trial`; migrated NVIDIA connections retain it.
It cannot be submitted or cleared by the client, including by changing the vendor or host.
NVIDIA hosts are checked on endpoint overrides too. Unknown legacy models remain visible,
with the free trial whitelist enforced before enabling, testing or calling them.

## Credentials and verification

Responses and audit records project credentials to `{configured:boolean}`. Edits accept
`credential: {action:"keep"}`, `{action:"replace",value:"..."}` or `{action:"clear"}`.
Replacement uses AES-256-GCM under the deployment's `MODEL_CREDENTIAL_ENCRYPTION_KEY`.
The backend never returns the value, encrypted value, environment reference or secret digest.
Migration keeps existing environment references; replacing or clearing one detaches that reference
for this connection without editing the environment or other connections.

Capability checks store a fingerprint of the connection protocol, base URL, timeout, credential
version and digest, policy, model identity, endpoint, capabilities, parameters, streaming and test
request. Reads compare that fingerprint with current configuration. A mismatch is `unverified`
and cannot authorize routing. Changing display names or notes does not invalidate verification.
Environment credential rotation invalidates verification as well as credentials changed in the UI.
Each capability needs its own successful check; text evidence cannot authorize vision.

## HTTP surface

All endpoints require the existing admin session; mutations use existing CSRF checks.
Configuration mutations supply `reason`, and updates/deletes also supply the current `version`.

| Path | Methods / behavior |
| --- | --- |
| `/api/admin/providers` | GET all connections and supported protocols; POST create |
| `/api/admin/providers/:id` | GET, PATCH configuration, DELETE |
| `/api/admin/providers/:id/test` | POST test connectivity/authentication; no model verification implied |
| `/api/admin/providers/:id/discover` | POST fetch candidates; no configuration mutation |
| `/api/admin/providers/:id/models:import` | POST import explicitly selected candidates |
| `/api/admin/providers/:id/models` | GET all models; POST manually add |
| `/api/admin/provider-models/:id` | GET, PATCH configuration, DELETE |
| `/api/admin/provider-models/:id/test` | POST test this exact model/capability, including when disabled |

Discovery reports `new`, `existing` and `not-discovered`. Absence from `/models` does not
mean removed upstream. A provider without discovery remains fully usable through manual creation
and single model testing. Reimport only updates upstream metadata; it preserves configuration,
credentials, capabilities and routing. Unselected models are not imported.

Validation errors include `fieldErrors`; stale versions and dependencies return HTTP 409.
Dependencies list `{kind:"model"|"workflow",id,name}`. Disabling and deleting are separate.
Connections with models cannot be deleted, and models referenced by workflows cannot be deleted.
The frontend must display field errors and dependencies alongside the relevant controls.

## Migration and legacy inputs

DDL 0106–0110 is additive and uses one online-safe statement per file. The separate data migration
`scripts/migrate-provider-connections.ts` requires a maintenance window with the old API and worker
stopped. It batches source reads, retains exact model configuration and shares a connection only
when vendor, base URL and credential reference agree. Each original timeout becomes a model override. It does not delete old tables.

`provider_model_aliases` maps `(vendor, model_id)` to a deterministic model UUID. Known preset
keys and `vendor:model_id` workflow settings become `model:<uuid>` plus an FK-backed binding in
`provider_workflow_models`. Existing checks are retained as observations. Only models whose routing switch was already on receive migration-only `legacy` evidence for that exact configuration and declared capabilities. Disabled routes acquire no eligibility. API clients cannot create legacy evidence. Configuration changes invalidate both legacy and verified evidence, while notes and display edits preserve it. Switching a route from off to on requires a current successful test.

A completion marker and the original identity manifest commit in the same transaction as all data and references. After completion, repeated migration only verifies surviving aliases and current workflow bindings; deleted objects are never recreated and administrator edits are never overwritten. It checks every alias target and every workflow binding against its setting, in addition
to checking counts. A mismatch aborts the transaction. Future legacy API/import inputs must use
the same alias resolver and workflow writer, rather than storing ambiguous upstream model IDs.

## Runtime and compatibility

`model:<uuid>` resolves to the exact connection and model at call time, independently of the display vendor or upstream name. Runtime rechecks enabled flags, endpoint policy, credential availability and matching per-capability evidence immediately before transport. Configuration identity participates in receipt keys, so two connections with the same model name cannot reuse each other's receipts. Failed eligibility and unknown configured references raise explicit errors; no default-model fallback is used.

Admin workflow switches resolve old preset and vendor-qualified references through the alias table and write settings plus their FK binding in one transaction. After the completion marker exists, old registry mutation and probe/bulk entrypoints reject writes with 409; use the new connection/model API. Legacy source tables remain for verification and rollback planning, never as a post-migration source of routing authority.

All provider transport uses the existing guarded HTTP client, including connect-time DNS checks over actual resolved socket addresses, request deadlines, bounded bodies and zero redirects. NVIDIA domain recognition is broader than its approved API endpoint allowlist; unapproved NVIDIA domains are rejected rather than treated as unrestricted providers.

Connection tests use the models endpoint and do not certify a model. Unsupported discovery leaves manual model creation and capability tests available. Tests and normal model calls respect the model-call valve and paid-request receipts/budgets; discovery only performs the authenticated models-list read.
