# Feature specifications

EventGraph uses the official [GitHub Spec Kit](https://github.com/github/spec-kit), initialized at version 1.2.1. See [docs/spec-review.md](../docs/spec-review.md).

For non-trivial feature work, the agent generates:

```text
specs/<feature>/
  spec.md      # Observable requirements and acceptance criteria
  plan.md      # Existing-code / upstream evidence and minimal technical plan
  tasks.md     # Implementation tasks and verification
```

Get the user's approval before implementing substantial behavior changes. Reference the approved `spec.md` **Git SHA and path** (or approved Issue) in the implementation PR. A spec edited only in an implementation branch is a draft, not proof of approval.

For a small bug fix, one short `spec.md` recording the observed failure, minimal intended correction and acceptance check is sufficient; `plan.md` and `tasks.md` are optional. An Issue alone does not pass the new CI gate. Merge the spec separately **before** implementing the fix.

All implementation PRs must include `Spec: specs/<feature>/spec.md@<full-approved-commit-SHA>` in their description. The required `Check` job verifies that the spec existed on the target branch before the implementation and remains unchanged at the referenced revision. Claude independently challenges scope creep, duplicate implementations, unnecessary compatibility, masked failures and untruthful tests. This gate checks presence/version, not genuine user intent: review approval evidence separately.

## Product specifications

- [Dynamic source lifecycle (007) — coverage audit + auto discovery/trial/promotion spec](007-dynamic-source-lifecycle/spec.md)
- [EventGraph Explorer + Story — Draft full product spec](eventgraph-explorer/spec.md)
- [Minimal reuse/implementation plan](eventgraph-explorer/plan.md)
- [Agent-sized tasks and acceptance](eventgraph-explorer/tasks.md)
- [Agent handoff guide](eventgraph-explorer/handoff.md)

The Explorer + Story documents are **DRAFT** until explicitly approved; implementation must pin the approved revision.
