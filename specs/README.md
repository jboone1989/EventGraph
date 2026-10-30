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

## Product specifications

- [Dynamic source lifecycle (007) — coverage audit + auto discovery/trial/promotion spec](007-dynamic-source-lifecycle/spec.md)
- [EventGraph Explorer + Story — Draft full product spec](eventgraph-explorer/spec.md)
- [Minimal reuse/implementation plan](eventgraph-explorer/plan.md)
- [Agent-sized tasks and acceptance](eventgraph-explorer/tasks.md)
- [Agent handoff guide](eventgraph-explorer/handoff.md)
- [Multi-engine GH-AW Workers (013) — Draft; owner approval required](013-projects-agent-workers/spec.md)

The Explorer + Story documents and Spec 013 are **DRAFT** until explicitly approved; implementation must pin the approved revision.
