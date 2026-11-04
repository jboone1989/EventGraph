# OpenRouter free-model catalog sync
Approved: 2026-11-04.
- On /admin/models, a manual "同步 OpenRouter 免费模型" button runs against an existing OpenRouter provider connection.
- Use the official OpenRouter models API and select chat models with **both** prompt and completion prices exactly zero, plus the official `openrouter/free` router.
- Insert new model IDs into registered_models; refresh upstream free-catalog metadata of existing rows without changing the operator's configuration, enabled switches or workflow bindings.
- Mark previously synchronized models absent from the free catalog as no longer free in metadata, without deleting or unbinding them.
- Reuse the current API credential and per-process model cache invalidation. No polling, new tables, timers, notifications or automatic binding changes.
- Sync failures must not partially change the catalog.
