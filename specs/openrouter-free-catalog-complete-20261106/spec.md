# OpenRouter free catalog completeness (2026-11-06)

Extends the approved manual sync contract in `specs/openrouter-free-sync-20261104/spec.md` after the operator reported that only a small subset of advertised free models was imported.

- Fetch `/api/v1/models?output_modalities=all`: the official models endpoint defaults to text-only without this parameter.
- Include all free catalog IDs whose prompt and completion are zero and whose request/image/audio base charges are absent or zero. Register the router `openrouter/free` once.
- Classify by advertised endpoint: chat -> `chat`, embeddings -> `embedding`, unsupported endpoints (e.g. rerank/decisions/media) -> `special`, disabled and never routed as chat.
- Import chat and embeddings with a suitable test configuration; never automatically enable routing. Existing operator settings, bindings and manually configured adapters must remain untouched.
- Preserve idempotent single-transaction sync, cache invalidation, and no background scheduler.
- Return catalog/free/category/import/invalid counts; display them on the admin model page to make filtering visible.
- Regression tests cover chat/embedding/special classification, paid-price exclusion, duplicate IDs, router insertion and vision input.
