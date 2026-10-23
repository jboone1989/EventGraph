# EventGraph — Google AdSense deployment checklist

Scope: **ownership verification only**. This change does not inject the ad-serving JavaScript, create ad placements, collect ad cookies or enable Auto Ads. It is safe to deploy with the default settings.

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
- **SEO:** Confirm public canonical domain, robots.txt, sitemap.xml, structured metadata, no login requirement, mobile accessibility and site ownership. The English edition is server-rendered under `/en` with its own canonical and `hreflang` pairs, and the sitemap lists its pages. English event pages are indexed only once the worker has written their English digest (`content.english`). English article pages add the event overview, other coverage, knowledge-graph relations and prices around the report, and are indexed only when they have English copy and their event has at least two public reports; a lone summary page stays `noindex` and out of the sitemap.
- **Production:** The new knowledge site must actually be deployed on the same domain you add to AdSense. A dev-only deployment cannot verify the public production site.

## 3. Operator checklist before applying for review

Code shipped on `feature/adsense-readiness` (specs/002-adsense-readiness): policy pages filled (operator Jianbo Wang, contact login@livingruntime.com, effective 2026-10-24), the legal footer on every page, `/en/privacy` and `/en/terms`, AdSense crawlers allowed in `robots.txt`, a curated-only index (`SEO.curatedIndexOnly`) with the daily queue in 后台 → 内容诊断 → 当日待策展, thin single-source event pages out of discovery, per-day reason dedup, and `npm run adsense:preflight` (placeholders/contact, fail-closed).

Still needs the operator, in order:

1. **Daily curation** (from deploy day on): in 后台 → 内容诊断, review 当日待策展 and confirm/exclude — only curated pages enter the sitemap and index. Target before applying: ≥30 consecutive days of decisions and ≥150 curated indexable pages (spec SC-004).
2. **Original research**: ≥3 signed pieces in the `/research` section (spec FR-013/014; the section ships with the readiness work — see `specs/002-adsense-readiness/tasks.md` US3).
3. **Cloudflare normalization**: redirect `http://*` and `https://livingruntime.com` to `https://www.livingruntime.com` (301, preserve path), enable HSTS. `SITE_URL` stays `https://www.livingruntime.com`.
4. **CMP**: Google-certified consent (AdSense → Privacy & messaging) for EEA/UK/CH visitors; expand privacy section 6 with the actual ad services, cookies and withdrawal once ads are enabled.
5. **Deploy** this branch through `feature → develop → main` (`docs/deploy.md`; migrations are additive), then verify ownership as in section 1. `/api/health` now reports the deployed release (`AIHOT_RELEASE` is written by `deploy-prod.sh`).
6. **Wait before requesting review**: let `content.english` fill recent reports, let curated pages accumulate, and run `node scripts/adsense-preflight.mjs` plus section 4 locally. Reviewers should find substantial original text, not mostly links.

## 4. Regression checks

```sh
npm run test:standalone
npm run typecheck
npm run adsense:preflight   # no placeholders, contact email set (fail-closed)
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
