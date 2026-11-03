# Spec · Chinese-source news in the English edition

**Date:** 2026-11-03
**Status:** Approved by user request to translate Chinese sources into English and subsequent instruction to merge.
**Scope:** EventGraph public news items; no change to production release cadence.

## Problem

EventGraph already writes English news titles and summaries, but the worker's body translation only targets Chinese. The English item route shows the publisher's original text. When that text is Chinese, the English edition has no readable article body even if the publisher authorizes full-text display.

## Required behavior

1. For a selected, publicly visible news article that permits full-text display and whose source body is Chinese, generate an English translation automatically in the **existing** scheduled worker translation flow. Keep the original Chinese body intact.
2. Use existing model selection, structured HTML segmentation, guarded links/media, receipted paid calls, retries, and `translations` table. Distinguish target language with `translations.lang='en'`. Do not add a second engine or a new database table.
3. The English article page should display the current English translation when available, and label AI-translated content accurately. The Chinese page continues to show Chinese, and the Chinese original-text tab remains Chinese. Never present untranslated Chinese prose as English.
4. Translate the visible body for Chinese sources without silently altering source links, code, media or verified facts. An incomplete translation must be marked incomplete, not claimed full.
5. If the source changes revision, hide the stale English translation until regenerated. Existing foreign-language → Chinese translation must not regress.
6. Respect existing source licensing: summary-only sources must not gain a full-text translation. Do not trigger model calls while rendering public pages.
7. Continue the existing bounded recent-item processing window; do **not** bulk backfill history or authorize new production model spending in this fix.

## Verification

- Integration test for Chinese-source full text, English output, HTML links, Chinese original unchanged and revision invalidation.
- Existing foreign → Chinese translation tests continue to pass.
- Typecheck, backend tests, Docker and E2E on PR HEAD must pass; no claim of successful deployment from code or CI alone.

## Reuse and decisions

Investigated `packages/backend/src/editorial/translate.ts`, `english.ts`, `publication/detail.ts`, `apps/web/app/routes/item.tsx`, and upstream AIHOT translation. Existing PostgreSQL `translations(lang)`, scheduled worker and Provider receipt model can serve both language directions. Changes are confined to that path; no alternative translation service or queue.

The existing English-page specification `specs/001-english-layout-parity` covers layout and the rule against Chinese-as-English but does not authorize generating English full text. This spec adds that missing behavior without relaxing the rule.
