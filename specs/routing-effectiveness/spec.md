# Smart model routing effectiveness

## Goal
Show whether EventGraph's newly deployed free-first model router materially improves successful processing without introducing paid calls, using existing PostgreSQL receipts and the existing Run & Backlog admin page.

## Scope
- Add a compact 24-hour **Smart Routing Effect** panel to `/admin/runs` (same auto-refresh as the page).
- Show real attempt counts, successful responses, unknown outcomes, known rejection failures, provider counts (OpenRouter/NVIDIA), and p95 request latency; show automatic **fallback success** only when an explicit switch from a rejected model is followed by a successful response. Show per-workflow breakdown.
- Preserve article completion/waiting/failed counters already on the same page; do not claim request success proves editorial accuracy. Show denominator/period, and explain empty metrics honestly.
- Mark only new auto-routed requests with routing stage, requested tier and fallback origin in existing receipt request metadata, without credentials. Existing fixed-model requests remain unchanged.
- Reuse `receipts`, `receipt_attempts`, existing admin runs loader/API, and contracts. No new database tables, background tasks, external monitoring, or misleading synthetic values.
- Keep automatic failover/unknown receipt safety unchanged. Every statistic must count real live attempts, and historical receipts without routing metadata must not be called "auto".
- Add tests for metadata / reporting semantics and admin UI integration; honor 24-hour scope and empty-data semantics.

## Acceptance
1. Auto-routed calls are tagged with stage, level and prior rejected model only on actual failover, without API key data.
2. The panel separates successful model responses from article completion and exposes failures/unknown and provider distribution with explicit denominators.
3. Fallback-success count only includes a successful live attempt with an explicit fallback marker.
4. Per-stage metrics are grouped by recorded stage; older untagged records are excluded, never silently assigned.
5. Existing runs page, 20-second refresh, mobile view and fixed model calls still work.
6. CI typecheck, web/backend tests, docker and e2e pass.

## Release
Spec first, implementation PR to develop; no production promotion.
