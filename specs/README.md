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

For a small fix, an Issue with concrete acceptance criteria is sufficient. Either ChatGPT or Claude can review against the approved version.

For Specs intended for automatic Project #2 and native Work Queue intake, use the strict Work Items format in [docs/spec-review.md](../docs/spec-review.md) and [Spec 015](015-spec-task-intake/spec.md). The Producer creates Issues only after an owner-merged, owner-approved Spec PR reaches `develop`.

## Product specifications

- [EventGraph Explorer + Story — Draft full product spec](eventgraph-explorer/spec.md)
- [Minimal reuse/implementation plan](eventgraph-explorer/plan.md)
- [Agent-sized tasks and acceptance](eventgraph-explorer/tasks.md)
- [Agent handoff guide](eventgraph-explorer/handoff.md)

The Explorer + Story documents are **DRAFT** until explicitly approved; implementation must pin the approved revision.

## Agent operations specifications

- [Spec-driven GitHub Projects + native Work Queue intake (015)](015-spec-task-intake/spec.md)
