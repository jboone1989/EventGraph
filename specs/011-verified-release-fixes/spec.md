# 011 · Verified release fixes: promote digest integrity and SSR-stable graph geometry

- **Approval source**: owner session instruction of 2026-10-29 (EventGraph #112 round, "merge once checks are green" with Auto-fix authorization): fix the two verified claude-review round-1 findings on the develop→develop sync PR and merge once CI is green. The findings were verified against the code before fixing (82%/80% confidence with file:line evidence) and the fixes were re-reviewed clean (round 2: 0 blocking). This spec is the written form of that change set; it is a draft until its PR is reviewed.
- **Replaces**: nothing. It closes two correctness gaps in the existing 008 promotion pipeline and in the web app's hydration path; it changes no deployment topology, target host or credential.

## User-visible behavior

1. **The pinned digest is the source of truth on the host** (`scripts/deploy-prod.sh`). A promotion that only repins `.github/production-image.env` (the #94 "promote without rebuild" flow) deploys the newly pinned digest even when the source diff against the released tag shows no application change: the script records the digest it deployed as `LRSITE_APP_IMAGE_REF` in the host `.env`, treats a mismatch between that record and the pinned `IMAGE_REF` as an application change (pull + re-tag + release advance), and only keeps the existing release when the record already matches the pin. After a successful run the running app image is the pinned digest; a rerun after a partial failure converges on the pin instead of silently keeping a stale image. Legacy hosts without the record converge on the pin on their first post-change run.
2. **Promotion binds the digest to its source commit** (`.github/workflows/check.yml` `promote`). Beyond digest syntax, existence and the `check`/`e2e`/`publish` successes on `SOURCE_SHA`, the job resolves the digest of the `sha-<SOURCE_SHA>` tag — the tag the `publish` job alone writes for that commit — and requires the pinned `IMAGE_REF` digest to equal it. A pin that pairs a valid `SOURCE_SHA` with any other image in the GHCR repository fails promotion, so production can only ever run an image built from and tested at the verified source.
3. **Server and browser render identical graph geometry** (`apps/web`). The knowledge-graph node coordinates are rounded to two decimals after the trigonometry in the shared layout, and the report calendar headers are keyed by position, so React hydration compares identical attribute strings and key sets on every first paint. Readers see no hydration-mismatch console errors on the home graph and no duplicate-key warnings from the English `M/T/W/T/F/S/S` calendar heads.

## Out of scope

- The Graphiti/Neo4j knowledge image release flow (independent by design; an app digest cannot replace it).
- Branch protection, required-check names, `deploy_production` opt-in state, and the `main` promotion gate's other validations.
- Introducing rounding anywhere user data is displayed; the rounding is scoped to the computed SSR layout geometry.

## Acceptance criteria

| # | Criterion | Evidence |
| --- | --- | --- |
| AC-1 | Pin-only change deploys the pinned digest; unchanged pin with matching record keeps the existing release | `deploy-prod.sh` reads `LRSITE_APP_IMAGE_REF` and forces `APP_CHANGED=1` on mismatch; logic verified by claude-review round 2 on #112 |
| AC-2 | Every successful promote run leaves `LRSITE_APP_IMAGE_REF=<pinned IMAGE_REF>` in the host `.env` | `WRITE_RELEASE` writes the key from the validated `IMAGE_REF` argument on both the pull and keep paths |
| AC-3 | `promote` fails when the pinned digest differs from the digest of `sha-<SOURCE_SHA>` | workflow resolves the tag digest and compares it to `IMAGE_REF`; format check fails closed |
| AC-4 | Home page hydrates with zero hydration-mismatch console errors | browser verification on the local develop build 2026-10-24: reload before fix logged the `y2`/`cy` mismatch every load; after the fix, zero errors and coordinates render as two-decimal strings |
| AC-5 | English daily/monthly calendar renders without duplicate-key React warnings | SPA navigation `/daily→/hot→/daily` on the local build: 4 warnings per pass before the fix, 0 after |

## Validation

- Static: `bash -n scripts/deploy-prod.sh`; digest-line extraction exercised against the `imagetools inspect` output format (`Digest:` with tolerant spacing).
- Independent review: claude-review round 2 on PR #112 reports 0 blocking for the change set at `f77d8f4`; the spec PR itself receives the same review.
- Live: the full `check`/`docker`/`e2e` pipeline on PR #112; the host-side AC-1/AC-2 path takes effect on the next production promotion run.
