# 014 · Main promotion runtime-source equivalence

- **Problem**: the existing `main` promotion gate pins a previously verified `develop` image and correctly refuses to rebuild it, but its source-equivalence check currently treats repository control-plane files under `scripts/ci/**` and `specs/**` as application/runtime source. After GitHub-hosted GH-AW control-plane changes landed on `main`, the `promote` job therefore failed even though the pinned release's runtime/application tree was unchanged.
- **Evidence**: `main` Check run 1425 failed only in `promote` while validating the pin `f21d603b95efc7290fb2be12eadf6318eda3bd1e`. A tree comparison between that pinned source and the then-current `main` showed that every difference outside the already-excluded `.github/**` and host-only deployment documentation/scripts was confined to `scripts/ci/**` and `specs/**`.
- **Intent**: keep production promotion fail-closed for runtime changes while allowing independently reviewed repository automation/governance changes to coexist with an older, still-equivalent pinned application image. This changes no deployment topology, host, credential, release pin, model, queue policy, or production enablement flag.

## Required behavior

1. The `main` `promote` job must compare the pinned `SOURCE_SHA` with current `main` for **runtime/application source equivalence**, not byte-for-byte repository equivalence.
2. In addition to the existing exclusions, changes limited to these control/governance paths must not by themselves invalidate runtime equivalence:
   - `scripts/ci/**`
   - `specs/**`
3. All other paths remain fail-closed unless already explicitly excluded by the existing promotion contract. In particular, application code, packages, migrations, dependency manifests, `Dockerfile`, Compose/runtime configuration, industry/runtime data and ordinary runtime scripts must still make promotion fail when they differ from the pinned source.
4. This exception affects only the post-merge `main` promotion source-equivalence comparison. It does **not** make `scripts/ci/**` or `specs/**` documentation-only for PR CI, and it does not weaken Check, E2E, Docker, Spec, independent review, branch protection or GH-AW gates.
5. The pinned image must remain the exact immutable image named by `.github/production-image.env`; existing successful-`check`/`e2e`/`publish` evidence requirements and digest/existence checks remain unchanged.
6. `deploy_production` remains opt-in behind the existing `EVENTGRAPH_PROD_AUTO_DEPLOY` variable and production environment controls. This change must not enable or directly run VM09 production deployment.

## Out of scope

- Selecting a newer production release or changing `.github/production-image.env`.
- Promoting today's `develop` application changes to `main`.
- Broad exclusions such as all Markdown, all scripts, agent configuration, dependency files or build files.
- Reworking image build/publish, development deployment, GH-AW scheduling, independent review or auto-repair.
- Touching VM09.

## Acceptance criteria

| # | Criterion |
| --- | --- |
| AC-1 | A pinned source and `main` that differ only under existing exclusions plus `scripts/ci/**` and `specs/**` pass the source-equivalence check. |
| AC-2 | A difference in representative runtime paths such as `apps/**`, `packages/**`, `Dockerfile`, `package.json`, `database/**` or runtime Compose files still fails closed. |
| AC-3 | The implementation changes only the promotion equivalence logic and focused regression coverage/documentation needed for that logic; it does not change the production pin or deployment switch. |
| AC-4 | The implementation PR passes normal PR Check and independent GLM review. |
| AC-5 | After merge, the `main` push `promote` job succeeds for the existing reviewed pin when only the authorized control/governance differences remain; `deploy_production` remains skipped unless already explicitly enabled outside this change. |

## Validation

- Deterministic tests cover both allowed control-plane differences and rejected runtime differences.
- The real `main` post-merge workflow is the acceptance run for AC-5.
