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
## Agent operations specifications

- [GitHub-hosted autonomous development queue (012) — owner-approved, operational](012-github-hosted-agent-queue/spec.md)
- [Multi-engine GH-AW Workers (013) — Owner-approved 2026-10-30; pending merge](013-projects-agent-workers/spec.md)

The Explorer + Story documents remain **DRAFT** until explicitly approved. Spec 013 is owner-approved on 2026-10-30; implementation must pin its exact merged revision.
