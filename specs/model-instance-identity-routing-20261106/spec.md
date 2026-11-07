# Model-instance identity and failover for multiple Provider Connections

**Status:** Owner-approved (owner-delegated Spec Review of f4ad7091181c0ab97d4a13079dcbaf04f8b8f2a1)
**Owner decision:** 2026-11-06: EventGraph treats each database model UUID as an independent routing candidate even when multiple Groq accounts, or other accounts/providers, advertise the same upstream model name. The operator explicitly asked to redesign and implement this behavior.
**Target:** develop only; main/production not in scope.

## Problem and existing code (Search Before Build)

- `registered_models.id` already is the stable UUID; `UNIQUE(provider_id, model_id)` already permits identical upstream model names on different `provider_connections.id`. No new identity table, schema or key is required.
- `selection.ts` and `provider_workflow_models` already resolve `model:<uuid>` and cache the successful UUID, not the upstream name. Keep these paths intact.
- `llm.ts` limits automatic fallthrough to eight candidates regardless of how many separately registered eligible models exist. `selection.ts` also converts every HTTP 429 into a 60-second account/connection-wide exclusion, skipping otherwise independent model UUIDs within that connection.
- In `ProviderConnectionsAdmin.tsx`, model rows identify their connection only by the vendor label; two Groq connections are indistinguishable. The stored connection name is auto-generated and not editable, and the internal model UUID is hidden.
- Existing `tests/provider-connections.test.ts` verifies same-name models on separate connections; existing `tests/free-model-routing.standalone.test.ts` verifies free-only selection. Reuse them.
- AIHOT upstream is a general news application, not a replacement for this EventGraph-specific provider-registry implementation. Reuse current provider CRUD, SQL, selection, UI and tests; no second model service, scheduler or quota tracker.

## Contract

1. **Identity:** `registered_models.id` (UUID) is the only internal model-instance identity for selection, cache, exclusion, test status, manual bindings and audit. The upstream `model_id` is only the request's model parameter. One connection may register a given upstream model only once; separate connections (even of the same vendor) may register it independently.
2. **Connections:** Each connection owns its credential, URL, enabled flag and human-readable name. Allow operators to create multiple Groq connections and assign/rename distinct connection names. Model admin rows and dropdowns show the connection name and vendor, with a distinguishable internal model ID; search can find both names and IDs.
3. **Failover:** For an `auto:` free-model route, on an explicit safe rejection (429/502/503/504) or configuration rejection, exclude/cool down **only the failed model UUID** and try another eligible UUID. No eight-attempt limit: stop when distinct eligible candidates are exhausted. A failure on one Groq connection must not suppress another Groq connection or another model UUID just because it shares a vendor or upstream name. Last-good cache is per UUID and must not reuse a just-rejected UUID.
4. **Safety of existing semantics:** Preserve free-only default, capability/tier matching, disabled-connection/model exclusion, fixed manual model bindings and receipt idempotency. No retry for timeouts, unknown receipts or ambiguous transport failures; no new paid fallback. Exhausted free candidates return existing recoverable waiting behavior.
5. **No quota management:** Do not add per-key quota counters, balance prediction, key rotation services, periodic model probes, new tables or scheduled jobs. A provider response drives failover. Do not change existing stored credentials or production settings.

## Acceptance

- Two enabled Groq connections holding the same `openai/gpt-oss-120b` produce distinct model UUIDs and independent selection, test status, audit and credentials. Registration of the same model ID twice *within one connection* still conflicts.
- Explicitly rejecting model UUID A then routing to UUID B succeeds even if A/B have the same vendor/upstream name. If two different models share the same connection, a model-scoped rejection does not silently remove the other from routing.
- With 10+ eligible free records, fallback can reach the ninth/tenth candidate instead of stopping at eight.
- UI displays separate connection names (and makes names editable), shows internal model UUID and supports search by connection/model/internal IDs.
- Typecheck, targeted backend/provider tests and web tests, then existing GitHub Check/Docker/E2E and independent review. Do not claim deployment without a deploy receipt.
