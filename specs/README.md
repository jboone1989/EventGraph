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
