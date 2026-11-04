# Provider model pricing visibility and free-only selection

Approved by owner on 2026-11-04 before implementation.

- In Model Management, show Free, Paid, NVIDIA Free Trial, or Unknown based on provider-specific evidence. Never infer free usage from a zero input rate alone.
- Reuse `registered_models.upstream_metadata` for provider rates without adding a new pricing table, background polling, or scheduled job.
- Extend the existing manually invoked OpenRouter free-model catalog synchronization to persist current input/output USD per million tokens for both registered free and paid models. Unknown or absent entries must not be presented as free.
- Preserve operator edits, enabled state, route settings and workflow model bindings during sync.
- NVIDIA verified free-trial endpoint connections display Free Trial rather than unrestricted Free.
- Workflow model binding choices show price type and support a toggle to show only confirmed Free choices. Trial and Unknown are excluded from this filter. This is a UI selector, not a runtime hard spending ceiling.
- Show last pricing refresh where available, and verify existing CRUD, bindings and provider catalog tests remain functional.
