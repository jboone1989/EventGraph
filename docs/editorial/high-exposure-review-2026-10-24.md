# High-impression landing pages — editorial correction batch (2026-10-24)

Scope: actual EventGraph Google Search Console results for **2026-09-24 to 2026-10-23**, not generated keywords. These are editorial data corrections, **not** instructions to unconditionally set `indexable=true`. Keep the existing manual curation gate, sitemap and one production release path.

| Existing page / entity | GSC impressions · clicks | Verified issue | Editorial decision |
| --- | ---: | --- | --- |
| [September 2026 CPI](https://www.livingruntime.com/en/story/e12a596a-5c29-46bb-ae2f-d4ee4d23d6df) | 159 · 0 | English and Chinese digests confuse year-on-year gasoline growth (34.2%) with a December increase, and fuel oil (74.2%) with gasoline | Source summary **corrected 2026-10-24**; new Chinese story digest verified. Keep noindex until English digest and final curation verified. Two sources, one first party |
| [Federal DeepSeek removal](https://www.livingruntime.com/en/story/371c7188-e7d9-4276-b419-20852defd2ea) | 74 · 0 | One Decrypt article is cited; the primary Federal Register notice should be linked for verification | Currently indexable; check primary-source link and title, do not delete accurate content |
| [Meta Muse Wonder](https://www.livingruntime.com/en/story/b82abfea-a9b7-49c3-98a2-8fd00b4d39f2) | 59 · 0 | At audit start, **production** Meta Muse contained two unrelated Kimi K3.1 reports; English digest misstated **1,000,000** as “100-token” | **Grouping corrected 2026-10-24**; both Kimi reports detached, confirmed 0 remaining associations. Chinese digest now refers only to Meta. Keep noindex until refreshed English text is verified. |
| [BLS URL misidentified as entity](https://www.livingruntime.com/en/knowledge/entity/8c4dce06-7fca-435e-ac7a-2243f7ed8048) | 57 · 0 | Raw source URL used as entity title | Handled by PR #109 `noindex` once published. Preserve the valid linked CPI concepts |
| [XRPL amendment entity](https://www.livingruntime.com/en/knowledge/entity/518d091c-32e6-44cf-a649-8539c544ecaa) | 28 · 0 | Technical identifier is a legitimate entity name. Future activation date is a *scheduled event*, not proof of bad data | Keep index eligibility; check evidence and dates, do not arbitrarily hide technical names |

## BLS CPI: verified replacement brief

**First-party evidence:** [BLS CPI September 2026 news release, published 2026-10-14](https://www.bls.gov/news.release/archives/cpi_10142026.htm).

中文核校底稿：

> 美国劳工统计局于 2026 年 10 月 14 日公布：2026 年 9 月整体 CPI 经季节调整后环比上涨 0.6%，未经季节调整同比上涨 3.7%；剔除食品和能源的核心 CPI 环比上涨 0.3%、同比上涨 2.6%。汽油价格环比上涨 9.1%，同比上涨 34.2%；**燃油（fuel oil）**同比上涨 74.2%，不是汽油的同比涨幅。汽油价格的月度上涨贡献了整体 CPI 当月涨幅的一半以上。能源指数环比上涨 5.2%、同比上涨 20.4%。

English verified replacement brief:

> In September 2026, U.S. CPI rose 0.6% month over month on a seasonally adjusted basis and 3.7% year over year before seasonal adjustment. Core CPI rose 0.3% month over month and 2.6% year over year. Gasoline rose 9.1% month over month and 34.2% year over year, accounting for over half the monthly increase in the all-items CPI. Fuel oil, a different category, rose 74.2% year over year. The energy index rose 5.2% month over month and 20.4% year over year.

Remove the erroneous “34.2% in December” and any claim that *gasoline* rose 74.2%. Do not mark indexed until the **actual story digest and English copy** have been checked on the intended environment.

## DeepSeek: verified primary source

[U.S. Department of Homeland Security / Federal Register, 91 FR 66346, 2026-10-20](https://www.govinfo.gov/content/pkg/FR-2026-10-20/html/2026-21447.htm) formally orders exclusion and removal of DeepSeek products in federal civilian executive branch IT systems/procurement. The original [Decrypt report](https://decrypt.co/381347/us-orders-civilian-agencies-rip-deepseek-out-government-systems) can remain, but the event's primary-source citation and time should distinguish the October 19 coverage from the October 20 Federal Register publication. Do not convert a news report into an unsupported claim of independent investigation.

## Meta Muse: existing operations path; no new CMS

- Production's misplaced Kimi article IDs **before correction**: `z1631k7x4d75t9h1yfmgk5f33` and `yglp49z8s6k8x9t7l3rp7bwfl`. Confirm each article's *current* fact/story membership before acting because regrouping can change it.
- Existing authenticated editor route `POST /api/admin/content/:id/detach` calls `detachFromFact`, records a durable grouping override and enqueues digest regeneration. Prefer this over ad-hoc SQL. Move to a verified dedicated Kimi fact if one exists; otherwise detaching leaves them as standalone readable reports until explicitly regrouped.
- **Completed on production 2026-10-24:** existing `detachFromFact` removed both Kimi memberships (each reported `detached: 1`); a fresh SQL check returned **0** misplaced memberships. Confirm the Meta story is based only on the two Meta sources (`v3yeblihkjet3a7rsjqetmwn6`, `thn11hkjifisvdp3sc6r6dv86`), then verify its Chinese and English digest. The generated English “100-token context” must be replaced with the sourced **one-million-token context**, not hidden by superficial title edits.
- **Development database check (2026-10-24):** the Meta story already contains only the two Meta reports. Do **not** run production-data corrections on the `develop` database, where the erroneous Kimi memberships are absent.
- Normal code deployment does **not** repair incorrect production data. **Separately from this PR**, the production corrections were performed through existing audited backend editorial functions: two `detachFromFact` calls for Kimi, and an `overrideFields` call for CPI's incorrect BBC summary (version 0). The CPI event digest was then regenerated with the correct gasoline figures. Both stories remained `noindex`. English story copy was temporarily absent after regeneration and must be checked before the editor permits indexing.

## Measurement after editorial changes

Compare the **same page URLs**, the prior 14 complete dates and the next 14 complete dates in Search Console, separately tracking impressions, clicks, CTR and average position; reconcile `noindex`, actual HTML canonical, sitemap membership, and whether story/source/graph exploration events follow. Do not mix anonymous sessions with unique visitors or claim improved traffic before post-release evidence.
