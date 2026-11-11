# Work items: pre-merge Spec validation

**Status:** Owner-approved
**Spec:** specs/016-validate-work-items-before-merge/spec.md

## Work Items

### T001 — Provide a standalone canonical task validator
**Scope:** Add a deterministic offline CLI entrypoint that calls the existing parseTasks function to validate a supplied tasks.md file, returning an actionable failure code without GitHub API or Work Queue calls.
**Depends on:** none
**Acceptance:**
- Running a local Node CLI against a valid canonical tasks.md exits zero and reports parsed task count.
- Invalid task documents exit nonzero and display the existing parser's error.
- Focused tests cover valid input, missing Scope, unknown dependencies, duplicate Task IDs, cycles and duplicate Work Items sections.
- Existing Producer runtime behavior, Issue identity and native Work Queue submission remain unchanged.

### T002 — Validate changed tasks.md in the existing pull request Check
**Scope:** Connect the standalone task validator to the existing develop pull request Check job, running it for every changed canonical specs/<feature>/tasks.md without duplicating the parser or adding a new workflow.
**Depends on:** T001
**Acceptance:**
- Pull requests containing a newly added or modified canonical tasks.md invoke the T001 validator before the Spec can merge.
- A malformed tasks.md fails the existing Check; valid tasks pass without modifying repository state.
- Legacy Spec PRs that modify only spec.md and not tasks.md are unaffected.
- Add focused tests for the changed-file selection and keep existing Check, Docker and E2E requirements intact.
