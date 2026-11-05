import type { AdminNavCounts } from "@aihot/contracts/admin";
import { sql } from "../db.ts";
import { serverModules } from "../modules.ts";

/**
 * Items waiting for the admin, on the navigation: new feedback, failing sources, receipts and deliveries in
 * doubt, and what the modules count.
 */
export async function navCounts(): Promise<AdminNavCounts> {
  const [[c], counts] = await Promise.all([
    sql<AdminNavCounts[]>`
    SELECT (SELECT count(*)::int FROM feedback WHERE status = 'new') AS feedback,
           (SELECT count(*)::int FROM sources WHERE enabled AND health = 'failing') AS sources,
           (SELECT count(*)::int
              FROM articles a JOIN sources s ON s.id = a.source_id
              WHERE a.discovered_at > now() - interval '24 hours'
                AND a.discovered_at <= now()
                AND NOT a.backfill AND s.participation_mode = 'editorial'
                AND (a.processing_state = 'failed'
                     OR (a.processing_state = 'new' AND a.discovered_at < now() - interval '15 minutes'))) AS runs`,
    Promise.all(serverModules().flatMap((m) => Object.entries(m.admin?.counts ?? {}).map(async ([key, count]) => [key, await count()] as const))),
  ]);
  return { ...c, ...Object.fromEntries(counts) };
}
