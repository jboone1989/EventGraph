// One-time explicit migration from a Ferro-only site to the independent AIHot news hub.
// Use after migrating and before enabling collection:
//   node --env-file=.env scripts/sync-news-sources.ts
// Unlike seed.ts, this intentionally updates EXISTING known sources. Do not invoke
// on every application startup; future changes in the admin should remain authoritative.
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";

type NewsSource = {
  id: string; name: string; kind: "rss"; config: Record<string, unknown>;
  tier: string; owner_entity_id?: string | null; participation_mode: string;
  interval_minutes: number; tags: string[]; site_fulltext: boolean;
  syndicate_fulltext: boolean;
};
const input = JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/sources.json"), "utf8")) as { sources: NewsSource[] };
if (input.sources.some(s => s.id === "ferro")) throw new Error("Ferro must not be a default news source");
let updated = 0;
for (const source of input.sources) {
  assertSupportedConfig(source.kind, source.config);
  const { id, name, kind, config, tier, owner_entity_id, participation_mode, interval_minutes, tags, site_fulltext, syndicate_fulltext } = source;
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, first_party, owner_entity_id, participation_mode, interval_minutes, tags, site_fulltext, syndicate_fulltext, enabled, next_fetch_at)
    VALUES (${id}, ${name}, ${kind}, ${sql.json(config as never)}, ${tier}, ${tier === "T1"}, ${owner_entity_id ?? null}, ${participation_mode}, ${interval_minutes}, ${tags}, ${site_fulltext}, ${syndicate_fulltext}, true, now())
    ON CONFLICT (id) DO UPDATE SET
      name = excluded.name, kind = excluded.kind, config = excluded.config, tier = excluded.tier,
      first_party = excluded.first_party, owner_entity_id = excluded.owner_entity_id,
      participation_mode = excluded.participation_mode, interval_minutes = excluded.interval_minutes,
      tags = excluded.tags, site_fulltext = excluded.site_fulltext, syndicate_fulltext = excluded.syndicate_fulltext,
      enabled = true, next_fetch_at = now()`;
  updated += 1;
}
// Stop the legacy Ferro RSS loop without removing historical, already-published articles.
await sql`UPDATE sources SET enabled = false WHERE id = 'ferro'`;
console.log(`AIHot sources synchronized: ${updated}; legacy Ferro feed disabled`);
await closeDb();
