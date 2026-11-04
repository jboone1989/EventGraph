# Free-first smart model routing

## Problem
EventGraph can bind a fixed database model per workflow, but a temporary OpenRouter limit stops that workflow even when compatible NVIDIA free endpoints are available. Assigning a heavy model to every task also wastes scarce free quota.

## Required behavior
- Preserve provider, model, and workflow CRUD; do not add a parallel registry.
- Let the default workflow and any individual step select `auto`, `auto:light`, `auto:medium`, or `auto:heavy`. Fixed model IDs remain unchanged.
- Use the existing model complexity, enabled, route-enabled, verified capability, API credential and connection policy fields. OpenRouter `:free` and `openrouter/free` have first preference among sufficiently capable models; NVIDIA must be an officially recognized free-trial model.
- For a heavy or medium task, never silently downgrade to a lower complexity model. No paid model may be selected automatically.
- A known HTTP rejection (429, 502, 503, 504) may switch to the next verified candidate, observing model/account cooldown. A transport with unknown outcome, timeout after submission, or an invalid received payload must retain its receipt and must not be automatically replayed.
- The existing PostgreSQL queue should retry when all eligible free candidates are exhausted, without incrementing permanent article-failure counters merely for unavailable models.

## Acceptance tests
1. Light workflow uses a verified light OpenRouter free model, not a heavy model.
2. Heavy workflow excludes light models and routes to an adequate model.
3. OpenRouter 429 selects eligible NVIDIA model and does not select a paid OpenRouter model.
4. A missing free provider results in a budget/wait error; no hidden paid fallback.
5. Existing fixed model bindings and normal CRUD remain backward-compatible.
6. A timeout/unknown receipt never silently retries a different model.

## Release
Feature PR targets `develop`; deploy only after CI and manual smoke tests. Do not automatically publish main.
