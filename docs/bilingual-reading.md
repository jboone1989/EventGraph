# EventGraph bilingual UI and content provenance

The desktop sidebar and mobile bar expose EN / 中文. The reading preference persists in the browser. Only one AIHot ingestion dataset and one Graphiti/Neo4j graph exist, shared across languages.

## English mode

The public routes now have English experiences: homepage, news feed, hot/events, event detail, original article, graph and entity pages, topics and topic details, daily/weekly/monthly report pages, archive, about, updates, bookmarks, feedback, agent integration, privacy, terms, search busy and login.

- Selected reports get an **English copy** (title, summary, "Why it matters") and stories an **English title and digest**, written by the worker (`packages/backend/src/editorial/english.ts`, job `content.english`, model step "英文版文字", optional `ENGLISH_MODEL`). The writer reads the Chinese copy plus the publisher's own title and opening text, newest first, for reports and stories of the last 90 days. Each copy stores a hash of the Chinese copy it was written from; after a correction the English copy is hidden until it is written again. Answers containing Chinese characters fail and are retried at most three times.
- Feed cards, article pages (`/en/items/:id`), event pages, the hot list and the daily/weekly/monthly English pages show that copy, labelled as written with AI assistance. Without it they fall back to the publisher's `original_title` and never re-label a Chinese summary as English.
- Graphiti assertions may have source-language texts; the English UI offers evidence links rather than inventing a translation. Weekly and monthly overviews remain Chinese.
- The Chinese reading experience, data ids, Graphiti receipts and ingestion paths are retained.
- Feedback remains postable on the English page, including optional screenshot and email. Legal pages display English renderings of the source policy **drafts**, explicitly noting that operator and AdSense/CMP details still require completion.

## SEO and QA boundaries

English pages have stable `/en` addresses with hreflang to their Chinese pages (`apps/web/app/lib/edition.ts`). Event pages are indexed in English once they have an English digest. An English article page is the same article page as the Chinese one: it shows the English copy, the publisher's own title and, when the original reads without translation, the original body. It is indexed only when it has English copy and its event has at least two public reports (`INDEXED_MIN_REPORTS`, surfaced as `englishIndexable` by `packages/backend/src/publication/detail.ts`), so the page stands with an event beyond one summary; other pages carry `noindex` and stay out of the sitemap.

Checks:
```sh
npm run typecheck
node scripts/english-site-smoke.mjs
node scripts/english-coverage.mjs
node scripts/language-switch-smoke.mjs
node scripts/knowledge-ui-smoke.mjs
```

Smoke tests cover route availability and original title data, **not** a real Chromium click-and-screenshot pass. Playwright Chromium was not available on the development host at validation time. No production deployment is implied.

## English DOM regression gate (2026-10-15)

The root script `npm run audit:english` performs three checks against the running dev site at `http://127.0.0.1:3000` (or `PREVIEW_URL`): exact `en-US` day/time renderers, Playwright Chromium crawling of 26 public/representative routes at 1365×860 and 390×844, and interactive English popup scans (search, filter, participant and ranking disclosure).

Audit logic sets `livingruntime-language=en` in browser storage, waits until the client language is active, checks visible DOM text and attributes (`aria-label`, `title`, `placeholder`, `alt`), document title/description, response status and uncaught JavaScript exceptions. It excludes the language selector itself since the Chinese-language choice is intentionally labeled “中文”. A nonzero result exits with failure. The script is a regression check of sampled dynamic content, not a claim that source archives already have full English editorial translations.

The live crawl reported `checked=52, offendingStrings=0, affectedScreens=0` after fixing shared date/count renderers and React hydration. React SSR incorrectly hoisted an SVG `<title>` element inside knowledge graph links, causing hydration error #418. Replaced it with an `aria-label` on the interactive SVG links. Both English and Chinese share the deterministic graph layout. Source-original articles, event graph, reports, navigation and source references remained functional.
