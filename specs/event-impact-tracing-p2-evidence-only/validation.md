# Actual validation — 2026-10-29

Node v24.22.1 from the local Actions runner; dependencies copied into this worktree
from `/tmp/eg-review/repo/node_modules` (offline cache, not a fresh `npm ci`).
No service was started or deployed; no production database was accessed.

| Acceptance | Files / actual result |
| --- | --- |
| Typed evidence and provenance | `energy-shipping-evidence.ts`; 4 adapter tests PASS |
| Public/time boundary reused | `impact-evidence.ts`; 6 existing P1 tests PASS |
| Bilingual cards and source drawer | `EnergyShippingEvidence.tsx` integrated in `ImpactEvidence.tsx`; 1 SSR rendering test PASS, including known cutoff and empty states |
| No invented numeric observations | Adapter tests assert no numeric fields; report numbers remain report title text |
| Web types | React Router typegen then `tsc -p apps/web`: PASS |
| Web build | React Router production client + SSR build: PASS |
| Contracts and E2E types | `tsc -p packages/contracts` and `tsc -p e2e`: PASS |
| Wider types | Backend/API/worker/tests/modules report existing `packages/backend/src/lib/egress-proxy.ts:40` generic `ConnectData<T>` / `opaque` type errors. Full typecheck is NOT green; this patch does not touch that file |
| All web test files | Attempted `node --test apps/web/tests/*.test.ts`: 13 file entries pass, 18 fail (31 files total). Direct reruns of case-replay, content-assets and request-target show `listen EPERM 127.0.0.1`; request-target/content-assets also have cleanup errors after failed listen. Other failing entries not individually diagnosed |
| Full database tests / smoke / live E2E | Not run: no local test DB/service, sandbox refuses loopback listeners. No claim of 390px browser acceptance, production validation, independent review or GitHub CI |

Reproduce focused checks from repo root (Node 24 on PATH):

```sh
node apps/web/tests/impact-evidence.test.ts
node apps/web/tests/energy-shipping-evidence.test.ts
node apps/web/tests/energy-shipping-ui.test.ts
node node_modules/typescript/bin/tsc -p packages/contracts
node node_modules/typescript/bin/tsc -p e2e
cd apps/web
node ../../node_modules/@react-router/dev/bin.cjs typegen
node ../../node_modules/typescript/bin/tsc -p .
node ../../node_modules/@react-router/dev/bin.cjs build
```

The SSR test uses Vite middleware mode with sockets/HMR disabled; it renders the
actual React component in Chinese and English. It is not browser layout evidence.
The new Spec remains DRAFT; no approved-Spec gate was bypassed or represented as
passing. Do not merge/deploy this patch until approval and the normal checks/review.
