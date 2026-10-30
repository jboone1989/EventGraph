# 011 · Verified release fixes: promote digest integrity and SSR-stable graph geometry

- **Approval source**: owner session instruction of 2026-10-29 (EventGraph #112 round, "merge once checks are green" with Auto-fix authorization): fix the verified claude-review round-1 findings on the develop→develop sync PR and merge once CI is green. This spec is the written form of that change set; it is a draft until its PR is reviewed.
- **Replaces**: nothing. It closes two correctness gaps in the existing production promotion pipeline (`docs/ci-cd.md`: the `check.yml` `promote` job and `scripts/deploy-prod.sh` on VM09 — outside 008's dev-CD scope) and in the web app's hydration path; it changes no deployment topology, target host or credential.
- **PR scope and sequencing**: this PR's diff is this spec file alone. The implementation already exists on PR #112 (branch `sync/develop-20261024`), independently re-reviewed clean (round 2: 0 blocking at `f77d8f4`), but is **not yet on develop** — the spec gate requires the approved spec to sit on the base branch before its implementation PR merges, so a spec-only diff is the intended first half of that flow, not missing code.

## User-visible behavior

1. **The pinned digest is the source of truth on the host** (`scripts/deploy-prod.sh`). A promotion that only repins `.github/production-image.env` (the #94 "promote without rebuild" flow) must deploy the newly pinned digest even when the source diff against the released tag shows no application change: the script must record the digest it deployed as `LRSITE_APP_IMAGE_REF` in the host `.env`, treat a mismatch between that record and the pinned `IMAGE_REF` as an application change (pull + re-tag + release advance), and only keep the existing release when the record already matches the pin. Legacy hosts without the record converge on the pin on their first post-change run; reruns stay idempotent.
2. **Promotion binds the digest to its source commit** (`.github/workflows/check.yml` `promote`). Beyond digest syntax, existence and the `check`/`e2e`/`publish` successes on `SOURCE_SHA`, the job must resolve the digest of the `sha-<SOURCE_SHA>` tag — the tag the `publish` job alone writes for that commit — and require the pinned `IMAGE_REF` digest to equal it. A pin that pairs a valid `SOURCE_SHA` with any other image in the GHCR repository fails promotion, so production can only ever run an image built from and tested at the verified source.
3. **Server and browser render identical graph geometry** (`apps/web`). The knowledge-graph node coordinates are rounded to two decimals after the trigonometry in the shared layout, and the report calendar headers are keyed by position, so React hydration compares identical attribute strings and key sets on every first paint. Readers see no hydration-mismatch console errors on the home graph and no duplicate-key warnings from the English `M/T/W/T/F/S/S` calendar heads.

**Implementation status**: behaviors 1–3 are implemented on PR #112 and verified there (round-2 independent review 0 blocking at `f77d8f4`; browser checks on the local build, 2026-10-24). Current `develop` does not yet include them: `LRSITE_APP_IMAGE_REF` appears in no script, `promote` checks digest existence only, and the hydration mismatch and duplicate-key warnings are live. This spec PR changes no code and authorizes no production change by itself.

## Out of scope

- The Graphiti/Neo4j knowledge image release flow (independent by design; an app digest cannot replace it).
- Branch protection, required-check names, `deploy_production` opt-in state, and the `main` promotion gate's other validations.
- Introducing rounding anywhere user data is displayed; the rounding is scoped to the computed SSR layout geometry.

## Acceptance criteria

| # | Criterion | Evidence |
| --- | --- | --- |
| AC-1 | Pin-only change deploys the pinned digest; unchanged pin with matching record keeps the existing release | `deploy-prod.sh` reads `LRSITE_APP_IMAGE_REF` and forces `APP_CHANGED=1` on mismatch (PR #112) |
| AC-2 | Every completed promotion run leaves `LRSITE_APP_IMAGE_REF=<pinned IMAGE_REF>` in the host `.env` — the `--check` dry-run exits before any write and records nothing | `WRITE_RELEASE` writes the key from the validated `IMAGE_REF` argument on both the pull and keep paths (PR #112) |
| AC-3 | `promote` fails when the pinned digest differs from the digest of `sha-<SOURCE_SHA>` | workflow resolves the tag digest and compares it to `IMAGE_REF`; format check fails closed (PR #112) |
| AC-4 | Home page hydrates with zero hydration-mismatch console errors | browser verification on the local develop build 2026-10-24: reload before the fix logged the `y2`/`cy` mismatch every load; after, zero errors and two-decimal coordinates |
| AC-5 | English daily calendar renders without duplicate-key React warnings | SPA navigation `/daily→/hot→/daily` on the local build: 4 warnings per pass before the fix, 0 after (weekly and monthly grids render no heads at all) |

## Validation

- Static: `bash -n scripts/deploy-prod.sh`; digest-line extraction exercised against the `imagetools inspect` output format (`Digest:` with tolerant spacing).
- Independent review: round 2 on PR #112 reports 0 blocking for the change set at `f77d8f4`; this spec PR receives its own independent review.
- Live: the full `check`/`docker`/`e2e` pipeline on PR #112 before it merges; the host-side AC-1/AC-2 path takes effect on the next production promotion run.
- Sequencing: develop gains these behaviors only when PR #112 merges; until then this spec intentionally describes them ahead of the code, per the spec gate.
