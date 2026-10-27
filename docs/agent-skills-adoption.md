# Selected Agent Skills — adoption provenance

This repository vendors **five** task-focused engineering skills from [jboone1989/agent-skills](https://github.com/jboone1989/agent-skills), a fork of [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills).

- Upstream revision: `aeac41d4d005999432bb7312f7ff06383a91d59d` (v0.6.13).
- Vendored skills: `constraint-driven-development`, `context-engineering`, `debugging-and-error-recovery`, `source-driven-development`, `code-simplification`.
- Canonical project quality bar: `.agents/CONSTRAINTS.md`.
- For Pi/Codex: `.agents/skills/<name>/SKILL.md`. For Claude Code: `.claude/skills/<name>/SKILL.md`. Both paths contain the **same Git blob content**; preserve parity on updates.
- The constraint skill also includes its linked `references/floor-guard.md`. Its example scripts are *not* automatically added to the existing CI; project checks remain authoritative.
- The skills are on-demand task guidance; they do not replace GitHub Spec Kit, existing Review R01–R18, CI, or the durable task queue.
- Review skill adoption against the project's actual behavior and don't add generic thresholds or make every run wait for human approval.

License: MIT, Copyright (c) 2025 Addy Osmani. Full license notice: [agent-skills-MIT-LICENSE.md](third-party/agent-skills-MIT-LICENSE.md).

### Smoke validation

1. Both skill directories contain all five `SKILL.md` files, with matching content.
2. Constraint skill resolves its local reference.
3. `AGENTS.md` routes research, failures, simplification, handoff and quality checks to the selected skill.
4. No existing Spec Kit, GitHub Actions or Claude review program is replaced or disabled.

The documentation-only adoption is intentionally independent of deployable EventGraph application changes.
