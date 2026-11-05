# Simplify EventGraph news runtime (2026-11-05)

Branch: develop. Approved after #404 single-pass bilingual analysis.

- Keep current scoring rules and existing `models.understand` binding (including overrides).
- Add source-grounded 5W1H, So What, and What Next to the existing `analyze_article` response and saved analysis output. Use it for the eligible selected news explanation; do not call a second explanation model.
- Unregister scheduled `content.explain` and `content.translate`. On item pages and Markdown exports, show bilingual summaries, context and source links rather than full text or translated full text.
- Preserve existing historical translation rows and evaluation APIs without running the legacy translation and explanation queues.
- Keep the English backfill and story digest, selective group review, and all reports.
- Limit Graphiti ingestion to public selected representative stories, not every analyzed news item.
- Show only live model bindings in admin; do not invalidate or migrate existing model selections.

Acceptance: one successful provider request per article version handles bilingual summaries and explanation; grouping and publication reuse stored analysis; original publisher link remains prominent; no full translation or independent explanation scheduled jobs.
