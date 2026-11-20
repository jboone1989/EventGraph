# 429 quota-aware automatic model recovery

**Status:** Draft for independent Spec Review (2026-11-20). Owner authorized continued EventGraph repair after production diagnosis; this version resolves the conflict between the earlier UTC-day failure exclusion in `specs/auto-success-only-routing-and-actionable-failures-20261111/spec.md` and unconditional five-minute 429 cooling in merged PR #576.
**Target:** feature → develop → VM13 preview; main/VM09 only through existing protected release flow after independent acceptance.

## Evidence and problem

- Production 2026-11-20 UTC read-only `receipt_attempts` evidence: 1,297 failed attempts in the preceding 24 hours; 1,163 HTTP 429. They are **attempts**, not distinct articles or proven billable vendor calls.
- `graphiti_chat` contributes the majority: Groq 393, OpenRouter 269, NVIDIA 246 of the sampled 429 attempts. OpenRouter explicitly reports `free-models-per-day-high-balance` and `free-models-per-min`, which have different recovery times.
- Existing `packages/backend/src/providers/registry/selection.ts` sets **every** 429 to 300 seconds, persisted by model UUID in `settings`. `packages/backend/src/providers/registry/runtime.ts` currently discards the HTTP `Retry-After` header, even when supplied. Thus daily-exhausted accounts repeatedly return to the pool.
- Official vendor behavior: OpenRouter has account-level caps for free models and a daily reset at 00:00 UTC; Groq emits `Retry-After` seconds with 429 and distinguishes request/token limits. Sources: https://openrouter.ai/pricing , https://openrouter.ai/blog/tutorials/llm-api-rate-limits/ , https://console.groq.com/docs/rate-limits .
- Existing model routing, registered connections, `settings`, `paidRequest`, Graphiti proxy, receipts, CI and tests must be reused. No second routing system, no scheduled probe, no additional paid retries, no new DB table.

## Required behavior

1. **Recognize actual error scope.** Only a trusted, sanitized `ProviderRejectedError` with HTTP 429 and an exact OpenRouter **free daily limit** discriminator (including observed `free-models-per-day-high-balance`, and documented `openrouter_free_tier_daily`) triggers daily account exclusion. Do not infer a daily quota from a generic 429, model name, pricing label, status 413 or parsing failure.
2. **Block exactly the affected free pool.** Resolve the rejected model UUID to its existing provider connection. Persist one bounded, expiring `settings` key for that connection's **free** models, valid until the next 00:00 UTC. Every automatically routed free model on the same OpenRouter connection is temporarily skipped; paid models on that connection and all models on another connection remain eligible. Keep explicit, manually pinned model bindings unchanged. Model UUIDs are never inferred from model names.
3. **Honor concrete retry hints.** For other HTTP 429 errors, preserve the existing model-specific cooldown (at least 300 seconds); if the provider sends a valid numeric `Retry-After` in seconds, never retry that model sooner than the bounded hint. Ignore absent, invalid, negative, NaN or excessive values safely. Do not parse untrusted error prose into arbitrary SQL keys or timestamps. Preserve existing short cooldown policies for 413, 5xx and schema failures rather than turning every error into a daily ban.
4. **Bound and expire safely.** Both per-model and per-connection flags are stored in the existing `settings` table with an explicit ISO `until`. Expired and legacy entries are ignored as before. An existing administrator "refresh models" action clears both kinds of failure flags and process-local preference caches. No new process-local-only gate, forced response retry, manual database cleanup, or hard per-day call counter.
5. **Preserve accounting and task semantics.** Successful schema-validated business results remain the only successful routes. One logical operation tries each rejected UUID at most once, retains original receipt/attempt/unknown audit evidence and honors shutdown and in-flight guards. When eligible instances are exhausted, surface a waiting/real-failure outcome, never claim success or silently enable extra paid models. Do not increase the per-news model call budget or change existing explicitly configured paid fallback policy.
6. **Do not conflate separate incidents.** Graphiti episode-ingest HTTP 500/timeouts and the missing 2026-11-09 daily report still need separate diagnosis and are not declared fixed by this routing change.

## Given / When / Then acceptance

- Given OpenRouter free daily 429 on model A in connection C at 2026-11-20T23:50Z, When the next auto selection occurs, Then **all free** model UUIDs under C are excluded before UTC midnight while another OpenRouter connection D and any explicitly enabled paid model stay eligible; they return after midnight without a background task.
- Given a generic OpenRouter per-minute 429, When another UUID under the same connection is available, Then only the rejected model UUID cools, and same-account free siblings remain eligible.
- Given Groq 429 with `Retry-After: 1200`, When the error crosses the model adapter, Then the model remains excluded at least 1200 seconds (not 300); malformed/negative/huge headers do not poison it indefinitely.
- Given the previous legacy `routing.failed:<uuid>` rows and malformed `until`, When selecting after their expiry, Then normal candidates return; admin refresh clears both model and free-account keys.
- Given a fixed binding or a Graphiti embedding binding, When automatic chat receives free-daily 429 elsewhere, Then the fixed binding does not silently change and no new paid calls are created by this feature.
- Given multiple requests share the same connection across workers, When daily quota is detected, Then all workers see the stored exclusion and no on-the-fly probe or automatic resubmission of an unknown result happens.
- Required `node --test` routing tests, backend typecheck, existing Check/Docker/E2E, independent PR review and VM13 preview pass. Compare UTC-aligned, model/business-filtered production attempts before/after **only after** normal main release; do not claim a reduced 429 rate from unit tests.

## Scope constraints

No production shell mutations, credential changes, model enable/disable edits, batch requeue, direct main push, new tracker or custom timer. Existing PR #576 remains the baseline for transient cooldowns; the new daily marker is a scoped exception supported by provider evidence, not a wholesale return to blanket all-day banning.
