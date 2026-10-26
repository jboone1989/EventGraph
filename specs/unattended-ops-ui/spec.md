# Spec — Unattended editorial operations UI cleanup

Status: approved by site owner, 2026-10-26. Scope: remove manual editorial UI; **do not remove public research**.

## Intent
EventGraph runs automated news ingestion, grouping, reports, and evidence services. Ferro will operate original research in the future. Routine news publication must not depend on a human editor clicking a dashboard.

## In scope
- Remove the human-only admin editor note page, its navigation, and editor note blocks from daily report presentation. Preserve existing historical records and database migrations.
- Remove the human-authored research **admin desk only** (navigation and route); preserve original research publishing/storage infrastructure.
- Hide the SelectBench admin UI and Provider-to-benchmark link; retain evaluation scripts, APIs, and historical run data.
- Keep article content diagnostics as searchable, read-only evidence. Remove the human daily curation queue and manual editorial actions on that diagnostic surface.
- No new fallback engines, compatibility shims, or automation introduced by this cleanup.

## Non-negotiable preservation
The public `/research`, `/research/:slug`, `/en/research`, `/en/research/:slug` routes, research sidebar, public research API, existing published articles, DB tables, and sitemap stay intact. News homepage, daily body, events, graph, source management, Provider management, and operational status remain unchanged.

## Verification
- TypeScript build and targeted CI checks pass.
- Public research routes and module/sidebar/API registrations remain active; administrative research form is absent.
- Admin notes, SelectBench, and curation UI routes/links are removed; no editor-note block appears in daily report.
- `/admin/content` can still search and show a processing trace without requiring an editor to approve publication.
- No database migrations or destructive data operations.
