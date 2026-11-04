# Reconcile main into develop before production release

Approved by owner on 2026-11-04: resolve the divergence between `main` and `develop` then publish `develop` into `main`.

- Preserve commits reachable only from `main` by merging `main` into `develop`; no force-push, history rewrites or direct writes to protected branches.
- Resolve conflicting workflow governance and historical Specs against the newer `develop` versions, retaining all nonconflicting `main` changes. Do not reinstate retired automation merely to preserve old revisions.
- Keep all conflict-resolution changes visible in a dedicated PR with existing Check, Docker, E2E and review gates.
- After reconciling and verifying the code, promote using the existing `develop → main` release PR and confirm production deployment.
- No production host changes outside the GitHub-native release flow.
