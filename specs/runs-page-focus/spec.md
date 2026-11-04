# Run & Backlog page: action-first hierarchy

## Problem
The admin runs page currently shows all diagnostic tables, module fragments, queues, receipts and metrics in a single long vertical sequence. Operators cannot quickly decide whether the system is healthy or what to do.

## Design
- Top of page: a concise **Operations overview** (worker health, queue backlog, stalled articles, failed articles) and a single, clearly prioritized **Needs attention** list with grounded counts and actions. Never claim health when no heartbeat or missing data.
- Keep new-news 24h funnel visible in a compact form. Normal filtering remains clearly distinct from failures.
- Below, use accessible, native expandable sections: **Issues & recovery**, **Models & routing**, **Queues & jobs**, **History & diagnostics**. Keep heavy tables collapsed initially. The summary for each section states how many outstanding issues it contains so nothing critical is hidden silently.
- Retain every existing table, recovery action, receipt/delivery verification modal and module-specific operations panel; move only their presentation, not API or processing semantics.
- Retain 20s refresh while users expand/collapse, and preserve small-screen layouts.
- No new server tables, endpoints, jobs, or charts. Use current runsOverview payload.

## Acceptance
1. First screen prioritizes health, backlog, stalled/failed work and actions.
2. Detailed queues, model metrics, 24h failures, receipts, sources, timelines remain reachable and all actions work.
3. Automatically refreshed data updates counts without forcibly resetting expanded sections.
4. No duplicated totals or misleading assertion that zero recent failures means no historical problems.
5. Full existing CI checks pass.

## Release
Spec-first, implementation PR to develop; no automatic production promotion.
