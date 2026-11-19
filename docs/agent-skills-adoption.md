# Selected Agent Skills — adoption provenance

Adopt exactly five task-focused engineering skills from [jboone1989/agent-skills](https://github.com/jboone1989/agent-skills), a fork of [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills).

- Pinned upstream commit: `aeac41d4d005999432bb7312f7ff06383a91d59d` (v0.6.13).
- Names: `constraint-driven-development`, `context-engineering`, `debugging-and-error-recovery`, `source-driven-development`, `code-simplification`.
- **One canonical body per Skill** at `.agents/skills/<name>/SKILL.md` for Pi/Codex. Claude Code discovers lightweight `.claude/skills/<name>/SKILL.md` entries that **must read** the canonical body before acting. This avoids tripling the code-review diff.
- The constraint Skill's local `references/floor-guard.md` is stored beside the canonical body; its example checker is NOT auto-installed in CI.
- Project quality bar is `.agents/CONSTRAINTS.md`. Skills supplement GitHub Spec Kit, existing Check/E2E/Docker and Claude independent R01–R18 review. No new generic thresholds or approval loops.
- Imported in two focused PRs (constraint + source; context + debug + simplify) to stay within the **existing 80KB reviewer diff limit** without weakening it. Both are needed for the complete five-skill catalog.

MIT License: Copyright (c) 2025 Addy Osmani. Full license: [agent-skills-MIT-LICENSE.md](third-party/agent-skills-MIT-LICENSE.md).

## modern-web-guidance (2026-11-11)

Adopted separately from the five-skill fork above, at the owner's request, from the Chrome/Edge/Firefox/MDN-stewarded project [GoogleChrome/modern-web-guidance-src](https://github.com/GoogleChrome/modern-web-guidance-src) (npm: [`modern-web-guidance`](https://www.npmjs.com/package/modern-web-guidance)), installed via `npx modern-web-guidance@latest install` (Project scope). Source pin and content hash live in `skills-lock.json`.

- Canonical body: `.agents/skills/modern-web-guidance/SKILL.md`; Claude Code uses a lightweight discovery adapter at `.claude/skills/modern-web-guidance/SKILL.md` (same one-canonical-body rule as above). The upstream installer links `.claude/skills/modern-web-guidance` as a Windows junction; the committed tree replaces it with the adapter file because `core.symlinks=false` would duplicate the corpus in Git.
- The ~2 MB `guides/` corpus written next to the canonical body is intentionally untracked (see `.gitignore`): it exceeds the 80KB reviewer diff limit, and the skill's runtime workflow is entirely `npx`-based `search`/`retrieve`, which ships its own corpus. `npx modern-web-guidance update` refreshes it locally.
- Runtime: `npx -y modern-web-guidance@latest search|retrieve|legacy-scan`. Google anonymous usage telemetry can be disabled with `DISABLE_TELEMETRY=1`.
