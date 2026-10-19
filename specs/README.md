# Feature specifications

Use GitHub [Spec Kit](https://github.com/github/spec-kit) conventions for non-trivial changes:

```text
specs/<feature>/
  spec.md      # Approved, testable requirements
  plan.md      # Existing implementation / upstream references + minimal design
  tasks.md     # Concrete work, tests, completion evidence
```

The spec must be approved **before** the implementation PR asserts conformance. Pin `spec.md` to an approved Git commit SHA in the PR; Claude reviews that immutable version. For small fixes, a clear Issue is sufficient. Never use an unapproved spec modified in the implementation branch as the authority.

This directory by itself is not a complete Spec Kit CLI initialization; see [docs/spec-review.md](../docs/spec-review.md).
