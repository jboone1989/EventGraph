# Unified provider and model setup

## Owner approval (2026-11-03)
Replace the separate connection-ID, provider, protocol and model-registration steps with one provider-first UI. A provider's credentials and its models are edited together. Preserve the dedicated workflow-to-model binding screen.

## Scope and acceptance
1. `/admin/models` groups models by provider connection, including providers with no models. One Add Provider form accepts provider, API key and model IDs, then saves the connection and requested models. Each existing provider allows credential/base URL editing and adding another model; model rows retain Edit, Test, Delete.
2. Do not require a manually typed connection ID or protocol. For known vendors, infer protocol and base URL; permit advanced override for custom OpenAI-compatible endpoints. Keep backend connection UUID, model UUID, audit, encrypted credential, endpoint policy and existing workflow references unchanged.
3. Blank API key when editing means keep; replacement is explicit. Never show or return stored API keys. Show partial failure accurately if provider saved but a model creation fails.
4. Model Test is per row. After a successful test, enable workflow routing for an enabled chat model through the existing audited API; binding remains an explicit decision on `/admin/model-bindings`. Do not silently bind a workflow or start processing past jobs. Show testing errors and routing status.
5. Fix missing-key save failure without plaintext storage: if `MODEL_CREDENTIAL_ENCRYPTION_KEY` is absent, initialize a cryptographically random AES-256 key *once* under the persistent `AIHOT_DATA_DIR` and reuse it across process restarts. Explicitly configured invalid keys must fail; missing/unwritable persistence must fail closed. Document persistent-volume and backup requirements. Keep env key as preferred override.
6. No change to production `main`, external model calls or migrations. Existing provider records and bound model identifiers remain valid. Respect preview read-only database configuration; never make it writable as a side effect of this change.

## Verification
- Browser test: create provider + two models without entering connection ID/protocol; edit credentials with blank=keep; add/test/model routing; inspect no secrets in DOM; verify existing models display and controls work.
- Backend tests: encryption/decryption and HMAC across calls/restarts with persisted key, strict invalid key path and file permissions.
- Typecheck, web build, targeted browser tests, relevant provider tests and CI pass before squash merge to develop.
