# Plan — diagnose production hot-ranking gap without weakening deployment quality

1. Reuse `scripts/production-smoke.py`, `scripts/deploy-prod.sh`, `packages/backend/src/events/hot.ts` and `packages/backend/src/publication/hot.ts`; do not build a second monitoring system.
2. Implement a bounded production host-side read-only probe of saved hot snapshot metadata and independent qualifying evidence count. Give the smoke a validated machine-readable result. Keep secrets and articles out of logs.
3. Teach the smoke to distinguish: real healthy populated heat; fresh valid empty heat with zero eligible stories; stale/absent ranking; eligible records filtered or missing publicly; broken API; collection or timeline deterioration. Fail closed if probe unavailable or inconsistent.
4. Add fixture tests covering each branch; wire into existing Check, run normal Docker/E2E and independent review.
5. After code lands develop and VM13 verifies, promote through the normal protected `develop -> main` merge. Confirm existing production release and that host live commit/digest reconcile even if previous smoke failed post-deploy. No manual VM09 action and no bypass of auto-deploy.
