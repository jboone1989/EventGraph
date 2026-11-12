# EventGraph — Google AdSense deployment checklist

Scope: **ownership verification, plus the owner-approved future ad-placement policy (§3)**. This change does not inject the ad-serving JavaScript, create ad placements, collect ad cookies or enable Auto Ads. It is safe to deploy with the default settings.

## 1. Verify ownership (when you have the real publisher ID)

1. In Google AdSense, add the *actual public site domain* that will host this site (not the development IP).
2. In the deployment environment, set:
   ```dotenv
   ADSENSE_VERIFICATION_ENABLED=true
   ADSENSE_PUBLISHER_ID=ca-pub-<your exact 16-digit publisher number>
   ```
   Never commit the real `.env` file. No test/example ID is shipped or used.
3. Restart/recreate **both** API and Web services; web renders the meta tag, API owns `/ads.txt`.
4. Check `https://YOUR-DOMAIN/` HTML **source** for a single `<meta name="google-adsense-account" content="ca-pub-...">` in `<head>`.
5. Check `https://YOUR-DOMAIN/ads.txt` for **exactly**:
   `google.com, pub-<the same 16 digits>, DIRECT, f08c47fec0942fa0`
   Response must be HTTP 200 and `text/plain`. This is the Google-owned seller record, *not* an ad script.
6. In AdSense choose the **meta tag** or **ads.txt** verification method and request site review.

With default `ADSENSE_VERIFICATION_ENABLED=false` (or a missing/invalid ID), the meta tag is absent and `/ads.txt` is HTTP 404 without advertising identifiers. This is intentional; do **not** create a fake `ads.txt`. If the public domain is served by another app or CDN, make sure its **root** URL is actually routed to this application, not just the dev IP.

## 2. Before turning on advertising

- **Publishing policy:** Review and complete both actual privacy pages (`/privacy`), terms (`/terms`), legal operator identity, contact channel, retention periods and the services you actually use. The present source copies remain drafts with placeholders. The verification text alone does not satisfy consent laws or Google's privacy disclosure requirements.
- **Consent management:** When serving ads to visitors in the EEA, UK or Switzerland, use the appropriate Google-certified CMP integrated with IAB TCF as required. Google's AdSense Privacy & Messaging CMP may be configured *after* registering the site. The current software does not implement one.
- **Ad display:** Do not add AdSense Auto ads / ad units until site review, policy disclosures and CMP decisions are complete. The verification flag intentionally **does not control any ad script**; any future ad runtime should have separate gating and tests.
- **Content quality:** Check substantial original explanations/research, factual source attribution, sensible navigation and no auto-generated low-value pages or content copied without sufficient additional value. A verification success **does not** imply approval.
- **SEO:** Confirm public canonical domain, robots.txt, sitemap.xml, structured metadata, no login requirement, mobile accessibility and site ownership. The English edition is server-rendered under `/en` with its own canonical and `hreflang` pairs, and the sitemap lists its pages. English event pages enter the sitemap only once the worker has written their English digest (`content.english`). English article pages add the event overview, other coverage, knowledge-graph relations and prices around the report, and enter the sitemap only when they have English copy and their event has at least two public reports; since the public `noindex` removal (specs/remove-public-noindex-20261111) a lone summary page stays out of the sitemap but, like every public page, carries no `noindex`.
- **Production:** The new knowledge site must actually be deployed on the same domain you add to AdSense. A dev-only deployment cannot verify the public production site.

## 3. Ad placement priorities — measured Cloudflare traffic (2026-11-11)

Owner-approved revision ([specs/adsense-traffic-first-20261111](../specs/adsense-traffic-first-20261111/spec.md)): the earlier first-batch decision — “news detail pages carry no ads; only research/event/daily pages are first candidates” — is corrected on measured traffic: **news detail pages are the primary ad candidate**. This is future placement design only. No ad unit, script or request exists today; §2 and the zero-request acceptance in §3.4 stay in force until ads are separately approved and enabled.

### 3.1 Measured traffic, and what it does not prove

Cloudflare RUM (`rumPageloadEventsAdaptiveGroups`, `livingruntime.com` + `www.livingruntime.com`, 2026-11-04 07:32 – 2026-11-11 07:32 UTC; 1,775 page loads across all pages):

| Page type | 7-day RUM page loads |
| --- | ---: |
| News detail `/items/:id` · `/en/items/:id` | **501** |
| Knowledge entity detail | 422 |
| `/explore` · `/en/explore` | 341 |
| Event detail `/story/:publicId` | 110 |
| Home `/` · `/en` | 70 |
| `/all` | 46 |
| Daily/weekly report detail | 12 |
| Admin (background) | 217 |

Last 24 h: 141 loads / 32 visits — news 26, home 27, `/all` 19, story 15, explore 5.

These ranks order the candidates; the numbers are **not** audience counts. Entity/explore/news loads show concentrated anomalous spikes on some days — strip automated browsing before estimating readership or revenue (422 entity loads ≠ 422 human readers). `/explore`'s enormous HTTP request volume is crawler traffic: in one recent 24 h, ElevenlabsCrawler alone produced 5,582 requests across the two main US records, alongside Semrush, MJ12 and Amzn-SearchBot — against 5 RUM loads. Requests and RUM loads are not real visitors, not ad impressions and not revenue; placements are never allocated by crawler request volume.

### 3.2 Candidate priority (per page, from evidence; nothing is enabled now)

1. **Primary: news detail `/items/:id`, `/en/items/:id`.** A page is a candidate only with genuinely published effective content, a traceable original source, substantial independent value (background, real source comparison, impact explanation, or evidenced event relation) **and** verifiable human review/curation evidence — for example an editor's recorded action in the existing admin. `indexable`, `selected`, `seo_indexed_at`, LLM scores and summary length are automated signals and never prove human review. Not eligible: a short machine summary alone, template reason text alone, rewrites/reprints without added value, a title plus outbound link, or an English route without a complete English body. Missing evidence is **UNVERIFIED → no ad**; it never defaults to serving. Ad candidacy is independent of search indexing (PR #114): this does **not** reinstate per-item manual approval as an indexing prerequisite, and it does not open ads for the news class as a whole.
2. **Conditional second: home `/`, `/en`** — only once the page carries substantial real editorial content with curation evidence. The homepage as currently shipped is a story hero plus news-card timeline (`apps/web/app/routes/feed-layout.tsx`, `home.tsx`) without an editorial prose block, so it is **not eligible now**; never pad it with generated text to qualify.
3. **Second batch: event detail `/story/:publicId`** with multi-source evidence, substantial background and real curation; **research articles and complete daily issues** remain small-traffic supplements (12 loads / 7 d).
4. **Observation only: knowledge entity detail** — 422 loads contaminated by automated browsing; reassess only after bots are separated from humans.
5. **Banned**: `/explore` · `/en/explore` (crawler-dominated requests, ~5 human RUM loads a day), `/all`, `/hot`, `/topics`, `/knowledge`, every list and search page, report directories and archives, `/more`, policy pages (`/about`, `/privacy`, `/terms`, `/feedback`), `/admin/**`, the login page, and every non-content state — 404/500/503, API failures, loading skeletons, empty bodies, drafts, unpublished or retired content.

### 3.3 Placement design (only after approval, under a switch separate from verification)

- Qualified news item: **at most one** fixed manual slot per page, visibly labeled “广告 / Advertisement”, placed **after** the reader has reached real substance — the displayed AI brief (`briefText`), the independent explanation (`reasonText`, `ItemExplainer`) or substantive event background — and before any later legally showable full body or subsequent news. A page without enough body gets **zero** slots. The slot stays clear of the “阅读原始报道” outbound-source button, entity links, cards and later interactive controls — no overlap or accidental taps on desktop or at 390 px.
- Qualified home page: at most one slot, only after a complete substantial editorial block; never interleaved between navigation and news cards.
- Event, research and daily pages keep the limited fixed positions defined earlier (substance first, one per page).

### 3.4 Pre-application acceptance is unchanged: zero ad requests

Until ads are separately approved and enabled, the whole site — normal news and home pages, explore, empty and error states, SPA transitions, Chinese and English, desktop and 390 px, admin and login — must show **0 Google ad-serving JS and 0 Google ad network requests**, verified by the existing `npm run adsense:preflight`, `scripts/adsense-smoke.mjs` and browser regression checks. No ad units, Auto ads, third-party scripts or a global `adsbygoogle.js` may be added. The ownership-verification meta tag and `/ads.txt` remain the only AdSense artifacts and are not ad requests. Whether the AdSense account actually has Auto ads, a CMP or third-party injection off cannot be determined from this repository — keep those items **UNVERIFIED** until checked in the console and on the live pages.

## 4. Operator checklist before applying for review

Code shipped on `feature/adsense-readiness` (specs/002-adsense-readiness): policy pages filled (operator Jianbo Wang, contact login@livingruntime.com, effective 2026-10-24), the legal footer on every page, `/en/privacy` and `/en/terms`, AdSense crawlers allowed in `robots.txt`, a curated-only index (`SEO.curatedIndexOnly`) with the daily queue in 后台 → 内容诊断 → 当日待策展, thin single-source event pages out of discovery, per-day reason dedup, and `npm run adsense:preflight` (placeholders/contact, fail-closed).

Still needs the operator, in order:

1. **Daily curation** (from deploy day on): in 后台 → 内容诊断, review 当日待策展 and confirm/exclude — only curated pages enter the sitemap and index. Target before applying: ≥30 consecutive days of decisions and ≥150 curated indexable pages (spec SC-004). Track it with `npm run curation:report` (coverage of the last 30 days: indexed, excluded, waiting).
2. **Original research**: ≥3 signed pieces in the `/research` section (spec FR-013/014; the section ships with the readiness work — see `specs/002-adsense-readiness/tasks.md` US3; draft texts await review in `specs/002-adsense-readiness/research-drafts/`).
3. **Cloudflare normalization**: redirect `http://*` and `https://livingruntime.com` to `https://www.livingruntime.com` (301, preserve path), enable HSTS. `SITE_URL` stays `https://www.livingruntime.com`. Run `SMOKE_EXPECT_HTTPS=1 python3 scripts/production-smoke.py` afterwards — it checks the redirects too.
4. **CMP**: Google-certified consent (AdSense → Privacy & messaging) for EEA/UK/CH visitors; expand privacy section 6 with the actual ad services, cookies and withdrawal once ads are enabled.
5. **Deploy** this branch through `feature → develop → main` (`docs/deploy.md`; migrations are additive), then verify ownership as in section 1. `/api/health` now reports the deployed release (`AIHOT_RELEASE` is written by `deploy-prod.sh`).
6. **Wait before requesting review**: let `content.english` fill recent reports, let curated pages accumulate, and run `node scripts/adsense-preflight.mjs` plus section 5 locally. Reviewers should find substantial original text, not mostly links.

Editor notes and topic briefs are edited in `site/editor-notes.ts` and `site/topic-briefs.ts` (deployed with the site; no admin UI yet — see `specs/003-content-assets/spec.md` §6).

## 5. Regression checks

```sh
npm run test:standalone
npm run typecheck
npm run adsense:preflight   # no placeholders, contact email set (fail-closed; CI runs it too)
node scripts/production-smoke.py  # policy placeholders, sitemap lastmod, ad-crawler rules (and 301s with SMOKE_EXPECT_HTTPS=1)
node scripts/adsense-smoke.mjs # checks current preview, default verification OFF
# With default disabled: expect HTTP 404 and NO account meta/script.
curl -si http://127.0.0.1:3000/ads.txt
curl -s http://127.0.0.1:3000/ | grep 'google-adsense-account' # should have no match
```

Google official sources:
- [Connect your site to AdSense](https://support.google.com/adsense/answer/7584263)
- [Ads.txt guide](https://support.google.com/adsense/answer/12171612)
- [Google-certified CMP requirements for EEA, UK, Switzerland](https://support.google.com/adsense/answer/13554116)

**AdSense ownership verification, AdSense site approval, and ads actually serving are separate states.**
