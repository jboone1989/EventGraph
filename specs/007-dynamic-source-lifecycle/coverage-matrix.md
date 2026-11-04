# EventGraph: high-value source coverage and dynamic portfolio audit (2026-10-25)

## Audit basis, accuracy and scope

- **Verified Git**: `develop` now has **82 configured sources** (79 RSS, 1 JSON list, 2 web lists), with 69 editorial and 13 hot signals, after **PR #133 merged**. Those counts say **nothing** about DB activation, live ingestion or evidence quality; the 10 newly merged feeds still require deployment and DB ingestion confirmation. `PR #132` separately adds DeepSeek Search/Fetch and must pass Check and Claude review before use.
- Existing source mix is concentrated in **AI, crypto, central banks, and headline finance**. Government defence/foreign affairs, formal sanctions, bilateral policy, supply-chain entities, ports, cyber incidents and regional conflict witnesses remain disproportionately sparse. US Fed/ECB/EIA/BIS etc. are valuable; they do not make the omissions irrelevant.
- The aim is **not** comprehensive web crawling. Only legal, low-maintenance RSS/Atom, official JSON/API and **scoped DeepSeek Search/Fetch** if access permits. No custom per-publisher HTML/CSS scraping and no processing historical backlog. A publisher's homepage or API documentation is a **candidate**, not a verified ingestion endpoint.
- Do not use crude "news websites per domain" as a coverage statistic. Multiple independent original reporters, all affected actors, independent corroborators, legal and data sources provide **different evidence roles**.

## Coverage matrix

**Status meanings**: **present** = named in the versioned develop source manifest (not proof of enabled DB); **pending** = PR not yet merged; **candidate** = officially identified but not integrated/verified; **blocked** = cn-dev actual fetch failed or licensing is unclear.

| Event layer / region | Existing or pending coverage | Critical missing primary/corroborating source types (candidate examples) | Priority |
|---|---|---|---|
| Military conflict: incident/actor | UN Geneva and EU Council, BBC World; Japan MoD, Defense News, Breaking Defense **present** | CENTCOM official notices; NATO direct releases; both/all conflict parties' official statements **as attributed claims**, local and independent cross-checks; UCDP Candidate Events API; ACLED if legally licensed | P0 |
| Military aid, weapons transfer, defence industry | Japan MoD, Defense News, Breaking Defense and War on the Rocks **present** | **DSCA Major Arms Sales RSS** and policy RSS, NATO; US DoD, UK MoD, regional defence agencies; contractor SEC 8-K/earnings and export licensing | P0 |
| Sanctions: formal legal designations | EU Council general press | **OFAC Sanctions List Service (SLS) API/SDN**, **UNSC consolidated XML/list updates**, UK Sanctions List (current, **do not** use closed OFSI list), European Commission restrictive measures and EU Official Journal | P0 |
| Tariffs/export controls/industrial restrictions | China PBoC and MIIT (some web_list); no verified dedicated trade control stream | China MOFCOM/GACC, US BIS/Commerce, US Federal Register (custom official feeds/API), WTO notifications; EU trade/dual-use controls, Japan METI, Korean MOTIE, Taiwan MOEA | P0 |
| Shipping, chokepoints, navigation risk | No dedicated primary maritime-security source in manifest | **MARAD advisories/alerts**, UKMTO, US NAVCEN/NGA warnings, ReCAAP Asia, EU NAVFOR, Singapore IFC, ONI Worldwide Threat to Shipping; port authorities, Suez/Panama Canal notices | P0 |
| Supply chain, affected companies, facilities | General business news, SEC press (not corporate filings) | **SEC EDGAR filings API** 8-K/6-K/20-F/10-Q, exchanges and company IR/filings; company/plant announcements, customs and port data, official logistics disclosures; corporate identity links | P0 |
| Energy transmission: oil/gas/power | US EIA general feeds, OPEC not represented | OPEC/IEA/ENTSOG/ENTSO-E official datasets, LNG shipping/port disruptions, grid operators, refineries, national energy ministries; futures/spot markets through existing quote feeds | P1 |
| Cyber and critical infrastructure | No dedicated cyber incident catalog | **CISA KEV official JSON**, NVD/CVE records, CERT-EU, national CERTs, vendor disclosure feeds, telecom/grid outage authority, FIRST EPSS if needed | P1 |
| Natural hazards / climate / epidemics | **GDACS and USGS present** | WMO, NOAA/NHC tropical weather, JMA, regional disaster agencies, WHO outbreak bulletins; transport/port and industrial consequence sources | P1 |
| Macro policy / central banks | Fed, ECB, BOJ, BOK, RBI, BIS, BLS, Chinese NBS/PBoC | Bank of England, Bank of Canada, Swiss National Bank, Brazil and Middle East central banks; national statistical agencies where an event affects that country | P1 |
| Conflicting accounts and regional media | BBC/CNS world; Guardian, NPR, Arab News, France 24, Al Jazeera and The Diplomat **present** | Regional independent reporting including Africa, Latin America, South and Southeast Asia, conflict-border communities; cross-language attribution and claims comparison, not one "neutral" outlet replacing all others | P0 |
| State, treaty, elections, domestic policy | BBC politics, EU Council, UN Geneva | Legislature and executive official documents, national election commissions, government gazettes and foreign ministries by region; USA Federal Register/GovInfo | P1 |
| Finance/trade transmission (market facts) | SEC press, BLS, EIA, central banks, crypto venues | Bond yields, FX, commodities, sector indices and order-flow/funding/OI where accessible; company-specific market moves **as observation, not proof of causality** | P1 |
| AI/crypto technology | Strong: OpenAI, DeepMind, NVIDIA, research, CoinDesk/Decrypt etc. | Keep multiple official publisher and practitioner perspectives; measure duplicate narratives, not a need to remove valuable independent sources automatically | Maintain |

### Candidate API/reference evidence (official links)

- DSCA official RSS index: https://www.dsca.mil/RSS (press/policy/**major arms sales**)
- OFAC official Sanctions List Service API description: https://ofac.treasury.gov/other-ofac-sanctions-lists ; **OFAC old RSS retired 2025-01-31**, do not revive it: https://ofac.treasury.gov/recent-actions/20241122
- UNSC official consolidated list (XML): https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list and updates: https://main.un.org/securitycouncil/en/content/list-updates-unsc-consolidated-list
- UK current Sanctions List: https://www.gov.uk/government/publications/the-uk-sanctions-list ; prior OFSI consolidated register closed 2026-01-28
- EU Commission sanctions guidance RSS: https://finance.ec.europa.eu/node/1296/rss_en
- U.S. MARAD subscribable alerts and **official catalogue of multiple distinct regional centres**: https://www.maritime.dot.gov/msci/us-maritime-alerts-and-advisories-subscriptions
- U.S. GovInfo official publication and **custom search RSS**: https://www.govinfo.gov/feeds
- U.S. SEC EDGAR submissions/XBRL APIs (not merely SEC press): https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- CISA KEV catalog JSON: https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json
- UCDP georeferenced events / candidate data, documented JSON API: https://ucdp.uu.se/downloads/
- GDACS free real-time hazard API: https://data.gdacs.org/Documents/2025/GDACS_API_quickstart_v1.pdf
- ACLED licensing and API coverage require entitlement checks: https://acleddata.com/conflict-data

**Caution**: Official machine-readable sanctions/filings catalogs may require a delta comparator to turn a new item/update into an EventGraph event. Do not shoehorn a complete multi-thousand-record dataset into an article feed and treat ancient records as breaking news. Prefer native delta/bulletin feeds, or a small generic official-JSON snapshot diff only after measuring cost and ability to preserve stable entity IDs. Do not add a crawler.

### Measured cn-dev endpoint probes (2026-10-25)

A bounded read-only probe using EventGraph's **own** `fetchRss` or `fetchJsonList` on cn-dev found:

| Candidate | Verified parser/network result | Treatment |
|---|---|---|
| EU Commission sanctions guidance RSS (`node/1296/rss_en`) | 19 RSS entries with dates, **newest 2026-01-15** as of probe | **Technically parses but stale** for new-event monitoring; may still serve static policy background |
| EU guidance trade-specific filtered RSS | HTTP 403 on cn-dev | Do not enable until lawful access works |
| CISA KEV official JSON | HTTP 403 on cn-dev | Official data exists but current route blocked; alternative access/DeepSeek discovery candidate; no evasion |
| GovInfo guessed `/rss/FR.xml` | HTTP 404 | This guessed URL is invalid; official GovInfo can generate search-based RSS, derive URL from their UI/API rather than hardcoding |
| NATO guessed `/cps/en/natohq/news.xml` | HTTP 404 | Do not register guessed path |
| State.gov guessed press RSS | Network failure | Not verified |

**Three independent states** must be recorded separately for any source: (1) valuable candidate, (2) technical endpoint tested, (3) actually **enabled and producing unique useful current material in development**. The 10 feeds merged from #133 passed bounded network previews before merge, but they have not been independently confirmed as enabled, ingesting and healthy in the development DB.

## Second cn-dev live feed probe — candidate discovery examples

The same current EventGraph `fetchRss` parser was run on five **new candidate URLs** (2026-10-25). These were **not registered/activated**; keeping all candidates in the lifecycle registry rather than auto-enabling before policy/preview checks is deliberate:

| Candidate | Real parse | Newest source timestamp UTC | Use |
|---|---:|---|---|
| USTR official trade policy RSS `https://www.ustr.gov/rss.xml` | 10/10 dated | 2026-10-23 20:06:58 | **High priority T1** official trade-policymaker feed; first candidate for safe RSS trial |
| gCaptain maritime `https://www.gcaptain.com/feed/` | 12/12 dated | 2026-10-25 01:52:30 | **High priority T2** maritime corroboration, not a substitute for UKMTO/MARAD primary incident notices |
| TASS English `https://tass.com/rss/v2.xml` | 41/41 dated | 2026-10-25 08:31:10 | **Attribution-only state-aligned viewpoint** for a conflict party, never an independent military fact |
| Yonhap English `https://en.yna.co.kr/RSS/news.xml` | 100/100 dated | 2026-10-25 07:27:36 | **Useful South Korea regional viewpoint**, select targeted topics to avoid off-topic volume |
| NOAA/NHC `https://www.nhc.noaa.gov/index-at.xml` | 2/2 dated | **2026-10-26 17:28:18 (future relative to probe)** | Flag anomalous dates and **do not auto-promote** until timestamps are understood; prefer verified official alert APIs |

Candidates have distinct information roles, so they should be individually tested and can coexist with sources in the same topical sector. This is precisely why portfolio decisions require provenance, unique contribution and dates, not a numerical cap.

## Quality and lifecycle: avoid the obvious mistakes

1. **Coverage unit = event × affected region × evidence role × viewpoint**, not a publication count. For geopolitical conflict, retain statements from affected parties separately (each carries a provenance/claim label) and add independent corroboration; no single media outlet makes another source redundant by category.
2. **Uniqueness** means newly found *source-attributable facts, documents, entities or time changes* corroborated by other evidence, **not** simply headlines with different wording. Deduplicate content by event identity, preserve all independent citations/attributions.
3. **Do not penalize rare authoritative issuers for silence**: regulation, sanctions designations, emergency notices may be irregular. Measure quiet periods relative to each source's own cadence (`sources/health.ts` already computes median gaps); treat highly valuable T1 legal/official sources as protected absent a genuine broken endpoint.
4. **Dynamic discovery**: daily or event-triggered scoped DeepSeek queries find new original publishers/documents; the assistant suggests candidate official RSS/API or domain-limited DeepSeek source. Automatically probe with existing `previewSource`, require a nonduplicated article URL, valid published dates, permissible rights and at least one unique timely contribution. Trial in **T2 hot_signal** with modest interval and no historical backfill; upgrade after results.
5. **Lifecycle**: proposed → validating → trial → active → cooling → paused/retired. T1 designation requires verified official ownership, not a media outlet's source citation. Trial and pause decisions are auditable, reversible, and accompanied by evidence and costs.
6. **Utility**: assess per-domain/region quality, timeliness vs expected cadence, original-doc discoveries, independent corroboration, noise/duplicates, persistent 403/timeouts, and cost; don't force a universal top-N or winner-takes-all. If publisher coverage has unique perspective, retain even if volume small.
7. **Cost**: DeepSeek Search/Fetch only with an independent finite budget (`deepseek_web`) as being implemented in PR #132; avoid calls without configured budget; no blind bulk Fetch. Keep source rights/attribution and published-time guards; do not reprocess historical articles.
8. **Operational visibility**: admin should distinguish active registry from manifest, and for each source show domain/evidence role/cadence, latest real event, unique contribution, last preview, current failure and lifecycle reason. Gaps should actively trigger discovery.

## Next implementation increments

1. Implement the low-maintenance candidate registry + evaluator **on top of existing settings and source health**, without a new crawler. Candidate records link to evidence and have bounded lifecycle statuses.
2. Add automated candidate detection from fresh original-source URLs and **DeepSeek topic searches** once PR #132 passes; then preview and restricted trial. Do not silently promote unverified sources.
3. Reuse existing source admin create/update/audit + queue on promotion; evaluate trend via actual 7/30-day source stats and event coverage, not mere article counts; add per-source override. Collect only future results and preserve rollback.
4. Confirm actual cn-dev DB source count, enabled/disabled/working/not producing, using authorized read-only SQL or admin API. The Git manifest cannot answer this.
