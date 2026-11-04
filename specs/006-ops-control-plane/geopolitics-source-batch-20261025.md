# Geopolitical source expansion — verified 2026-10-25

## Product rule

**Do not limit risk coverage to six handpicked sources.** However, do not pursue comprehensive crawling or custom HTML parsers either. Keep current 68 original sources and four prior validated feeds. Add useful, diverse, low-maintenance official RSS/Atom and publisher RSS feeds after real collector verification. DeepSeek Search/Fetch is a separate reusable fallback (PR #132), not a substitute for official first-party feeds or a guaranteed realtime incident source.

This batch contains **10 new sources**, raising the versioned manifest count from **72 to 82** on this feature branch. The **manifest count is not the enabled development DB count** and says nothing about production release. Existing baseline sources include BBC World, BBC Politics, China's China News Service world/politics, official central-bank releases, US SEC, etc. Avoid re-adding them.

## Real development-host network probe

All URLs below were tested from **cn-dev** on 2026-10-25 using EventGraph's existing `fetchRss` parser with real network responses, not only a web search. Sampled the feed's item count, parseable article dates and newest date. No data was inserted and no past article queue was replayed.

| Source | Feed item count | Dated | Latest UTC | Decision |
|---|---:|---:|---|---|
| Japan Ministry of Defense notices | 139 | 139 | 2026-10-23 09:05:54 | Add official, date-gated |
| Japan MoD general updates | 318 | 318 | 2026-10-23 09:05:50 | Skip duplicate of official notices |
| Defense News | 10 | 10 | 2026-10-23 19:39:05 | Add |
| Al Jazeera | 25 | 25 | 2026-10-25 08:54:47 | Add as signal |
| UN News English | — | — | — | Skip timeout |
| France 24 world | 24 | 24 | 2026-10-25 07:14:50 | Add |
| Breaking Defense | 15 | 15 | 2026-10-23 21:11:04 | Add |
| The Diplomat (Asia) | 96 | 96 | 2026-10-23 18:05:00 | Add |
| War on the Rocks | 100 | 100 | 2026-10-23 07:30:37 | Add |
| Arab News | 50 | 50 | 2026-10-25 08:54:15 | Add as signal |
| The Guardian world | 45 | 45 | 2026-10-25 09:00:58 | Add as signal |
| Times of Israel | — | — | — | Skip HTTP 403 |
| NPR news | 10 | 10 | 2026-10-25 09:00:00 | Add as signal |
| South China Morning Post | — | — | — | Skip timeout |

**Japan-specific caveat:** The official XML has relative `/j/press/...` article URLs. Existing `itemUrlPrefixRewrite` converts `/j/` into `https://www.mod.go.jp/j/`. No bespoke parser. Offline test asserts this behavior in `tests/geopolitics-sources.standalone.test.ts`; check real persisted URLs in development after registering the source.

All new entries are publication-gated to October 2026, use initial backfill limit 2 and explicitly disable republishing publisher fulltext. Initial backfill limit is not a permanent future per-day volume limit. High-volume general publisher feeds should be kept as `hot_signal` where appropriate to avoid overwhelming article analysis and indexable news.

## Real activation remains to be confirmed

1. On deployed `cn-dev` ensure image matches versioned `develop` and compare unique source URL/identity with existing DB rows.
2. Run existing source preview on each candidate and register without duplicate IDs/URLs. Validate article URL, original publisher, headline and timestamps; for Japan verify URL rewrite and for news feeds examine original-vs-publication dates.
3. Enable a small set then check 24h health, number of *new* articles, analyzed and grouped counts. No old data replay or artificial free-model throttle.
4. If individual feeds become noisy or stale, disable them from existing Source Admin. **Do not write a spider to fix a single publisher**.
5. Once DeepSeek PR #132 clears tests and Claude review, add a few topic+site restricted discovery configs for **OFAC sanctions, maritime security (UKMTO/MARAD), China commerce/defense, Taiwan defense and NATO/CENTCOM** only when provider credential/budget is configured and live search previews show acceptable freshness/precision. These are future candidate topics, *not* sources already enabled.
