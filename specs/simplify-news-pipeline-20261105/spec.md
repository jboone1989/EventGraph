# Simplify EventGraph news runtime (2026-11-05)

Branch: develop. Approved after #404 single-pass bilingual analysis.

- Keep current scoring rules and existing `models.understand` binding (including overrides).
- Add source-grounded 5W1H, So What, and What Next to the existing `analyze_article` response and saved analysis output. Use it for the eligible selected news explanation; do not call a second explanation model.
- Unregister scheduled `content.explain` and `content.translate`. On item pages and Markdown exports, show bilingual summaries, context and source links rather than full text or translated full text.
- Preserve existing historical translation rows and evaluation APIs without running the legacy translation and explanation queues.
- Keep the English backfill and story digest, selective group review, and all reports.
- Limit Graphiti ingestion to public selected representative stories, not every analyzed news item.
- Show only live model bindings in admin; do not invalidate or migrate existing model selections.
- Each analyzed public editorial news item should offer meaningful detail in its own page, not only the selected/featured subset. The saved single-pass analysis must provide separate source-grounded Chinese and English 5W1H, So What and What Next, and the corresponding language page must render it. A lack of source evidence leaves fields absent rather than fabricated.
- Keep one `analyze_article` model request per revision with the current `models.understand` binding, without re-enabling `content.explain` or `content.translate`. Continue to read pre-existing single-language explanation records in their own language, but do not show them in the other language.
- This improves the content foundation for future AdSense placement; no ad slots or ad serving changes are included in this work.

Acceptance: one successful provider request per article version handles bilingual summaries and bilingual explanation; any publicly readable, analyzed news detail (not just selected news) renders its appropriate-language explainer when supported by evidence; source language cannot leak into the other edition; grouping and publication reuse stored analysis; original publisher link remains prominent; no full translation or independent explanation scheduled jobs.
