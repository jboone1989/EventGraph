# Global-risk source pack — 2026-10-25

## Purpose and scope

## Final source-selection decision (2026-10-25; supersedes earlier broad-coverage instructions)

**Do not develop new traditional webpage scraping for this initiative.** No new site-specific HTML/CSS selector rules, sitemap crawling, browser-rendered scraping, or per-publisher crawler adapters, even if a source could theoretically be parsed. Comprehensive coverage is not a goal; skipping difficult sources is acceptable. Keep current legacy collectors unchanged rather than expanding them.

Only onboard **selected, high-value and low-maintenance** feeds through (1) official RSS/Atom, (2) stable official API/JSON, or (3) scoped DeepSeek Search with optional on-demand DeepSeek Fetch. Search/Fetch are third-party retrieval services and do not confer reuse rights or make snippets confirmed evidence. A source that cannot be covered reliably by these methods is **out of scope**. No obligation to test every source in the research inventory and no requirement to reach a numerical source target.

Control DeepSeek request cost independently of model usage; disabled until credentials, a finite budget, domain scope and preview have been verified. Maintain original publisher links and timestamps; avoid syndicated full text. Current six entries are only code-config candidates pending live preview. Remove or disable any feed that is stale or nonfunctional rather than writing bespoke parser fixes.

Cover market-relevant geopolitics, military conflict, international sanctions and trade disruptions, and major natural disasters without turning EventGraph into a second monitoring platform. Preserve the existing AI/crypto/finance editorial focus; add facts/primary-source corroboration and risk discovery. Use current RSS collector, admin preview, seeded source registry and existing grouping pipeline.

## Implemented on branch (config only, **not** a live-source success claim)

| ID | Mode | Primary role | Official documentation |
|---|---|---|---|
| `rss-eu-council-press` | T1 editorial | European Council/Council official political, sanctions and security announcements | https://www.consilium.europa.eu/en/about-site/rss/ |
| `rss-un-geneva-press` | T1 editorial | UN Geneva primary press statements | https://www.ungeneva.org/en/news-media/rss |
| `rss-gdacs-disasters-24h` | T1 hot_signal | Global natural-disaster alerts, not standalone articles | https://gdacs.org/feed_reference.aspx |
| `rss-usgs-earthquakes-m45` | T1 hot_signal | M4.5+ earthquakes from official Atom feed | https://earthquake.usgs.gov/earthquakes/feed/v1.0/atom.php |
| `rss-gdelt-conflict-discovery` | T2 hot_signal | Cross-source multilingual conflict coverage discovery | https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/ |
| `rss-gdelt-trade-risk-discovery` | T2 hot_signal | Trade restrictions, sanctions, shipping and energy supply discovery | https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/ |

GDELT aggregates links to third-party articles. Its own presence is **not** first-hand evidence for the underlying military event. Require an original source link and publisher identity for evidence. GDELT's RSS is a discovery feed; do not publish its returned title as an authoritative primary-source statement. `hot_signal` here is intentionally not `editorial`.

Initial imports are bounded to two entries per source; each feed starts with an October 2026 publication-time gate. This is a config gate, **not** a guaranteed permanent daily volume cap (the collector will take later items on following fetches). Rights flags remain false for site and syndication fulltext.

## Live acceptance — required before production

1. On `cn-dev`, use existing `previewSource` on all six feeds. Record HTTP errors, item count, example title, article destination, UTC publishing date and freshness. Do not accept 200 with stale events or navigational links.
2. Confirm `GDELT` API genuinely returns parseable RSS under the selected query (rate limits may require reducing frequency). If unsupported/unreliable, disable those two entries rather than writing a bespoke scraper.
3. Inspect USGS and GDACS generated `link`/GUID behavior. Deduplicate event updates and confirm the event date is not confused with list-fetch date. Keep ordinary low-impact events from being selected just because a feed is high-volume.
4. Use existing audited `createSource` and `fetchNow` only for verified entries. Check registry for equivalent live entries **before creating**; seed by unique source ID alone can duplicate manually registered source names/URLs.
5. Track: `enabled`, `health`, last fetch, discovered 7d, actually analyzed, public article count and grouped fact count. Do not mistake `hot_signal` visibility for indexable news or successful fact grouping.
6. Stage through the existing develop-to-main release process after checks and dev preview. Do not reprocess old news or bulk reopen historical failed jobs.

## Optional research candidates (not a development backlog)

Sources such as **OFAC, UKMTO, MARAD, CENTCOM, NATO, China MOFCOM and defense releases, Taiwan defense releases, UN Security Council, US DSCA, CISA, ReliefWeb, Reuters/AP/AFP** matter when they are relevant to an event. Try an official machine-readable feed/API or site-restricted DeepSeek discovery; otherwise omit them. **Do not** convert this inventory into web-list, HTML scraping or browser automation tasks. Rights-restricted sources require appropriate permission regardless of retrieval route.

## Event reasoning guardrails

Separate event occurrence, confirmation status, potential transmission path, and observed market movement. A source's claims are attributed; risk paths are hypotheses until supporting facts exist. An unrelated price move after an attack is **not** evidence of causality. Market connection is a downstream analysis problem and must not block discovering and retaining significant confirmed geopolitical facts.
