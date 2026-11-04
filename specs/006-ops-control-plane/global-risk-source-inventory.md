# Global-risk source selection — 2026-10-25

## Final product decision

EventGraph is an event knowledge and market-transmission analysis system, **not** a comprehensive news crawler. Do **not** implement or onboard new custom HTML/CSS selectors, browser crawlers or sitemap scraping for this effort. Prefer a small number of important, low-maintenance sources using (1) first-party RSS/Atom, (2) official public API/JSON, or (3) scoped DeepSeek Search/Fetch as an optional paid discovery fallback. Skip unreliable or difficult sources. Keep legacy collector support unchanged; do not migrate historical data.

Original publisher URLs, verified publication timestamps and rights flags must survive ingestion. Search results and disaster alerts are signals rather than independent proof; do not infer political-event-to-market causality from time order alone.

## Real collector verification on cn-dev

Verified 2026-10-25 by invoking the existing backend `fetchRss` parser against the configured public feed URLs from the **development host**, without inserting data or invoking models:

| Source ID | Parsed | Dated | Since Oct 1 | Latest published UTC | Decision |
|---|---:|---:|---:|---|---|
| `rss-eu-council-press` | 20 | 20 | 20 | 2026-10-23T17:00Z | Keep T1 editorial |
| `rss-un-geneva-press` | 10 | 10 | 1 | 2026-10-07T14:53:37Z | Keep T1 editorial (lower update rate) |
| `rss-gdacs-disasters-24h` | 68 | 68 | 68 | 2026-10-25T08:07:03Z | Keep T1 hot_signal |
| `rss-usgs-earthquakes-m45` | 34 | 34 | 34 | 2026-10-25T08:16:20Z | Keep T1 hot_signal |
| `rss-gdelt-conflict-discovery` | — | — | — | — | **Removed**: HTTP timeout |
| `rss-gdelt-trade-risk-discovery` | — | — | — | — | **Removed**: HTTP 429 |

The EU Council feed's `a10:updated` and UN Geneva feed's `CEST` dates required a small **generic RSS date parser fix**. The existing parser and TypeScript checks passed after that fix. These figures are a point-in-time live read, **not** proof of successful creation, durable DB ingestion, model processing, production health or causal evidence.

Publisher fulltext and syndication rights are set to false; each new source has a small initial backfill limit (2) and an October 2026 publication-time gate. These do **not** place a permanent volume limit on later fetches.

## Deployment acceptance, limited to future data

1. Run existing admin `previewSource` and check the enabled registry for equivalent sources/URLs; do not create duplicates by manifest ID alone.
2. Activate four verified candidates in dev after reviewing signal volume and relevance. `GDACS` and `USGS` overlap on earthquakes: track redundancy and keep only one if processing costs or signal noise outweigh value.
3. Verify actual new material counts, original URLs, proper publication timestamps, event grouping and real source health. Ignore old article queues; do not backfill or replay historical items.
4. Deploy through existing image pipeline after ordinary checks. No new crawler, server service, migration, browser instance, or sidecar is needed.

## Optional research candidates (not a backlog)

OFAC, UKMTO, MARAD, CENTCOM, NATO, China's defense and trade agencies, Taiwan defense, UN Security Council, DSCA, CISA, ReliefWeb and licensed wire services are relevant for particular events. Use only machine-readable official interfaces when available, or restricted DeepSeek domain searches. If not reliable, **omit rather than scrape**.

DeepSeek Search/Fetch integration is a **separate branch** and remains off until mock and real minimal request checks, finite independent `deepseek_web` budget, credentials and site scope are verified. It is a discovery service, not an official independent verifier.
