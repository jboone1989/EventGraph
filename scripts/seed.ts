// Seeds a fresh site from the industry pack: the demo sources (industry/sources.json, only the ones not
// there yet, so admin edits are never undone). Topics need no seeding: they are read from industry/topics.json.
// Re-runnable:  node --env-file=.env scripts/seed.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";
import { EDITOR_NOTES } from "@aihot/site/editor-notes";

interface SeedSource {
  id: string;
  name: string;
  kind: "rss" | "web_list" | "json_list" | "x_search" | "mp_account" | "external";
  config: Record<string, unknown>;
  tier?: string;
  owner_entity_id?: string | null;
  participation_mode?: string;
  interval_minutes?: number;
  tags?: string[];
  site_fulltext?: boolean;
  syndicate_fulltext?: boolean;
  enabled?: boolean;
}

const { sources } = JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/sources.json"), "utf8")) as { sources: SeedSource[] };
let added = 0;
for (const s of sources) {
  assertSupportedConfig(s.kind, s.config);
  const tier = s.tier ?? "T2";
  // First-party means a T1 source, as the admin sets it.
  const inserted = await sql`
    INSERT INTO sources (id, name, kind, config, tier, first_party, owner_entity_id, participation_mode, interval_minutes, tags, site_fulltext, syndicate_fulltext, enabled, next_fetch_at)
    VALUES (${s.id}, ${s.name}, ${s.kind}, ${sql.json(s.config as never)}, ${tier}, ${tier === "T1"}, ${s.owner_entity_id ?? null},
            ${s.participation_mode ?? "editorial"}, ${s.interval_minutes ?? 60}, ${s.tags ?? []}, ${s.site_fulltext ?? false}, ${s.syndicate_fulltext ?? false},
            ${s.enabled ?? true}, now())
    ON CONFLICT (id) DO NOTHING RETURNING id`;
  added += inserted.length;
}
console.log(`sources: ${added} added, ${sources.length - added} already there`);
// PR #97 may have already inserted these feeds before their wall-clock timezone was specified.
// Fill only the missing key; preserve all other settings and explicit admin timezones.
await sql`
  UPDATE sources
  SET config = config || jsonb_build_object('publishedAtUtcOffset', '+08:00')
  WHERE id IN ('nbs-data-release', 'nbs-latest-releases-en')
    AND kind = 'rss' AND NOT (config ? 'publishedAtUtcOffset')`;
// The editor notes file seeds its rows once (specs/004-editorial-ops FR-001); after that the admin
// owns them and a deploy never overwrites what was written there.
for (const [day, note] of Object.entries(EDITOR_NOTES)) {
  await sql`INSERT INTO editor_notes (day, note, note_en, updated_by) VALUES (${day}, ${note.note}, ${note.noteEn ?? null}, 'seed')
    ON CONFLICT (day) DO NOTHING`;
}
// Model providers are not throttled by project-owned seed defaults.
// Existing operator budgets are managed separately; provider HTTP 429 still has retry handling.
await closeDb();
