# EventGraph — Google AdSense deployment checklist

Scope: **preparing the site for a (re-)application**. This repository's code ships **no ad-serving JavaScript, no ad units, no Auto Ads and no ad cookies**; only the ownership-verification meta tag and `/ads.txt` exist, and only behind an explicit flag with a real publisher ID. Updated 2026-11-11 after the empty-page rejection (specs/adsense-minimal-readiness-20261111); the earlier 2026-10 "curated-only index / 30 days / 150 pages / fixed www" checklist is superseded — see §3 for what is actually required.

**Three separate stages, never conflated:**

1. **Verification only** (today, and until the owner sets a real `ca-pub-` ID): no ad anything. Safe to deploy.
2. **Site review requested**: still no ad anything on our side. Google's crawler reads the site; a passed review changes nothing visible.
3. **Ads serving**: only after approval, with its own separate authorization and switch (§7). Approval does not switch anything on by itself.

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

With default `ADSENSE_VERIFICATION_ENABLED=false` (or a missing/invalid ID), the meta tag is absent and `/ads.txt` is HTTP 404 without advertising identifiers. This is intentional; do **not** create a fake `ads.txt`. A verification success **does not** imply approval, and approval does not imply ads may serve.

## 2. What is already true in code, and what is not

| Claim | State |
|---|---|
| Policy pages filled (operator Jianbo Wang, contact login@livingruntime.com, effective 2026-10-24); legal footer on every page; `/en/privacy`, `/en/terms` | Implemented; `npm run adsense:preflight` fails closed on placeholders |
| `robots.txt` allows Google's ad crawlers; sitemap carries lastmod; SEO metadata, hreflang `/en` edition | Implemented |
| Empty or unreadable sections stay out of the index: `/research` and `/en/research` answer `noindex,follow` with nothing published (HTTP 503 when the research API fails), are absent from the sitemap, and have no navigation entry (sidebar, /more, /about) until a piece is published | Implemented (specs/adsense-minimal-readiness-20261111 US1) |
| Index policy: public news with a readable summary is indexable by default (PR #114); `indexable`/`selected`/`seo_indexed_at` say nothing about human review or ad eligibility | Implemented; the public wording on `/about` and `/terms` (zh/en) now says aggregation is automated with partial human review, not page-by-page curation |
| Site actually deployed at the public domain, one canonical origin, HTTPS everywhere, redirects correct | **Needs runtime verification** at the deployed site (e.g. `SMOKE_EXPECT_HTTPS=1 python3 scripts/production-smoke.py`); the canonical host is whatever `SITE_URL` is set to in production — nothing requires `www.` specifically, only that one form is canonical and the others redirect |
| Verification meta/ads.txt live | **Needs the owner's real `ca-pub-` ID** (§1) |
| AdSense account settings: Auto ads OFF, no other ad scripts or third-party CDN injections | **Needs the AdSense console and the live pages** — mark UNVERIFIED until actually checked (§6) |

Google's site review asks for original value, reachable pages, working navigation and policy compliance (support.google.com/adsense/answer/7299563, /12176698). There is **no** fixed "30 days of history" or "150 pages" threshold, and traffic-request counts are not human page views — nothing here promises approval.

## 3. Before requesting (re-)review

1. **Fix the rejection cause.** The previous application was rejected for ads on empty/low-value pages. The empty-research treatment above is the structural fix; §5–§6 are the proof it holds.
2. **Human-reviewed substance, not just indexed pages.** Search indexing and automated admission never make a page eligible for ads. Each candidate page needs evidence a person actually looked at it before it may carry an ad (§4).
3. **CMP and privacy**: when (and only when) ads will actually serve to EEA/UK/CH visitors, a Google-certified CMP is required; the privacy page's ad section must then name the real services. Not needed for verification or review.
4. **Run the checks in §6 and record the results** (including anything that can only be marked UNVERIFIED). A re-application with an open UNVERIFIED item that turns out to be "Auto ads ON" repeats the rejection.

Editor notes and topic briefs are edited in `site/editor-notes.ts` and `site/topic-briefs.ts` (deployed with the site; no admin UI yet — see `specs/003-content-assets/spec.md` §6).

## 4. First-batch ad-eligible pages and the one placement each

Eligibility is per page, from evidence, and **only these three kinds of detail page**:

- `/research/:slug` and `/en/research/:slug` — a published piece with substantial body, method, byline, and evidence of human review (the editor's publish action in the audit trail).
- `/story/:publicId` and `/en/story/:publicId` — an event with sufficient multi-source evidence, a substantial written overview, and human-review evidence.
- `/daily/:key` (Chinese daily only) — an issue with complete real sections, factual sourcing, and human-review evidence.

Being one of these paths does not make a page eligible by itself: `indexable`, `selected`, `seo_indexed_at`, title/summary length or model scores never substitute for the human-review evidence. A page without that evidence is banned. The English (`/en/…`) version needs a complete English body meeting the same bar — an English shell over Chinese content is not eligible.

**One manual placement per eligible page, at most** (a placement design, implemented only after approval under §7):

- Research article: after the method-and-data block and the opening substantive body — never before the reader has reached real content.
- Event page: after the substantive overview and background, **before** the timeline's interactive controls.
- Daily issue: after the first complete substantive section.

Every placement carries a visible "广告 / Advertisement" label, sits away from navigation buttons, outbound source links and filter controls, and covers or misleads nothing on desktop or at 390px.

## 5. Banned from ads (first batch, entirely)

All lists and landing pages: `/`, `/en`, `/all`, `/hot`, `/topics`, `/knowledge`, `/explore`, search results and empty search results, the `/research` list pages, `/more`, every report directory/archive index (`/daily`, `/daily/archive`, `/weekly`, `/monthly`, …). All site pages: `/about`, `/privacy`, `/terms`, `/feedback`, `/admin/**`, the login page. All non-content states: 404/500/503 pages, API-failure pages, loading skeletons, navigation placeholders, empty bodies, drafts, retired and otherwise unpublished content. Every detail page not named in §4. `/items/:id` news pages are banned for now (AI-written summary; insufficient human-review evidence) — including them later needs fresh verification and explicit authorization. `/weekly` and `/monthly` issues are out of the first batch.

Banned means **zero Google ad JS loaded and zero Google ad network requests** — not a hidden ad slot. This holds across SPA transitions, language switches, the 0→1→0 published-content cycle, error and loading states, at every viewport.

## 6. Pre-application acceptance: zero ad requests

Re-apply only after recording all of these:

- [ ] `node scripts/adsense-smoke.mjs` against the deployed (or preview) site: default-off mode passes (no meta, `/ads.txt` 404, no ad scripts on `/`, `/research`, `/en/research` or the 404 page).
- [ ] Browser run (`e2e/adsense-zero.spec.ts`) with network interception: normal public pages zh+en, the empty `/research` pages, an empty search, the 404 page, SPA transitions between them — **0 requests to any Google ad host, 0 `adsbygoogle.js` loads**, desktop and 390px. The verification meta tag and `/ads.txt` are not ad requests.
- [ ] `npm run adsense:preflight` passes (placeholders, contact, and no re-introduced "human-curated index" claim).
- [ ] `python3 scripts/production-smoke.py` (and with `SMOKE_EXPECT_HTTPS=1` in production): policy, sitemap lastmod, ad-crawler rules, redirects.
- [ ] AdSense console: **Auto ads OFF** for the site. Without console access this stays **UNVERIFIED** — it must be resolved before re-applying; last rejection cause was ads on empty pages, so a live Auto-ads setting would repeat it.
- [ ] Live pages' network tab: no third-party ad/analytics scripts beyond the configured Cloudflare Web Analytics beacon. **UNVERIFIED** until actually observed on the production domain.

## 7. Serving, after approval (separate authorization; not in this repository yet)

Ads serving requires all of: an explicit new switch **distinct from** `ADSENSE_VERIFICATION_ENABLED`, real account authorization, server-confirmed HTTP 200 with full public body and recorded human-review evidence per §4, the CMP decision for EEA/UK/CH, and placements per §4. No whole-site `adsbygoogle.js` in the root layout: the request to Google happens only from an eligible page's own placement. None of this exists today, by design.

## 8. Regression checks

```sh
npm run test:standalone
npm run typecheck
npm run adsense:preflight   # no placeholders, contact set, no false curation claims (CI runs it too)
node scripts/production-smoke.py  # policy placeholders, sitemap lastmod, ad-crawler rules (and 301s with SMOKE_EXPECT_HTTPS=1)
node scripts/adsense-smoke.mjs # checks the running site, default verification OFF
node --test apps/web/tests/research-empty.test.ts  # research empty/published/unreadable × zh/en: entries, robots, sitemap
# With default disabled: expect HTTP 404 and NO account meta/script.
curl -si http://127.0.0.1:3000/ads.txt
curl -s http://127.0.0.1:3000/ | grep 'google-adsense-account' # should have no match
```

Google official sources:
- [Connect your site to AdSense](https://support.google.com/adsense/answer/7584263)
- [Ads.txt guide](https://support.google.com/adsense/answer/12171612)
- [Google-certified CMP requirements for EEA, UK, Switzerland](https://support.google.com/adsense/answer/13554116)
- [Ads on pages with little/no value](https://support.google.com/publisherpolicies/answer/11112688) — the policy behind the empty-page rejection
- [Auto ads controls](https://support.google.com/adsense/answer/9305577) — keep OFF

**AdSense ownership verification, site approval, and ads actually serving remain separate states.**
