# Implementation plan — reuse existing GitHub-native development workflow

## Search Before Build (repository inspection, 2026-11-07)
- `specs/015-spec-task-intake/spec.md` and `scripts/ci/spec-task-producer.mjs`: canonical Spec triplet, one `## Work Items`, deterministic task markers, Issues, Work Graph and default Worker profile; reuse unchanged when possible.
- `.github/workflows/eventgraph-native-queue-events.yml`: on successful develop Check, validate current SHA, invoke existing producer, submit native work graph and single dispatch; controls include repository variable `EVENTGRAPH_NATIVE_QUEUE_EVENTS_ENABLED`. Distinguish expected skipped workflow_run events from a genuinely blocked queue.
- `.github/workflows/check.yml`: `auto_merge_develop` already exists, checks same-HEAD PR results and invokes `gh pr merge --auto --squash` after approval, with optional native update-branch on behind. Preserve this flow.
- PR #464: all checks and review passed, auto_merge_develop skipped; PR reported behind develop. Inspect specific workflow event metadata and expression outcomes before editing, including `needs` propagation, docs-only, Spec branch conditions and review dependencies.

## Execution
1. Let existing Spec PR independent review and auto-approval merge this complete triplet. Do not manually write application code.
2. Existing Producer should create T001 Issue/Projects Todo and GH-AW work; verify actual resulting IDs from logs/GitHub API.
3. Agent on one task audits and minimally fixes review/merge lifecycle, including isolated tests for the root cause and any blockers to intake. If a required repo variable/credential is missing, report it rather than bypassing gates.
4. Worker proposes one implementation PR referencing its Issue, Task ID, pinned merged Spec SHA. Existing CI/review/auto-merge handles release to develop. Do not touch production or main.

## Constraints
- Existing EventGraph GH-AW Agent owns implementation; no parallel manual patch to PR #464.
- No automatic claim of completion from a successful Spec merge alone.
- No duplicate Worker PRs, bespoke queues, additional schedules or forced pushes.
