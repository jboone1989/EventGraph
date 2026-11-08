# Implementation plan — CI red PR recovery in existing GitHub-native lifecycle

1. **Evidence baseline:** preserve #501 current failed HEAD, failing Check Run #42438923985, #491 immutable Spec marker; inspect existing Check, GH-AW Worker, native queue continuation and official `push-to-pull-request-branch` capabilities before touching code.
2. **Minimum integration:** extend existing GitHub-native lifecycle to detect a failed *current* `agent-work` PR and assign a bounded, authorized same-PR repair. Prefer reusing native Work Queue and existing GH-AW worker identity. If a separate GH-AW repair workflow is necessary for safe-output contract reasons, it must be only the official GH-AW execution path with no second queue, no bespoke model process or timer.
3. **Strict trust gates:** exact PR/issue/Spec/branch/HEAD and completed Check failure; idempotent max 2 attempts, no migrations/protected files, no review policy bypass. Integrate GitHub event instead of polling.
4. **Compile and test:** GH-AW v1.0.1 official strict compile for any source/frontmatter edit; include generated lock and regression tests for event filters, same-PR write scope, dedup, and correct follow-up Check triggering, then run normal PR Check/Docker/E2E/independent reviewer and native merge.
5. **Real acceptance:** test #501 before other tasks, verify original PR repair, CI, merge, develop deployment, then native dispatch of #477/#490; keep #482 blocked until historical data safety resolved.

Not a second scheduler/queue/project, not a direct PR-code hotfix by coordinator, and no main/production changes.
