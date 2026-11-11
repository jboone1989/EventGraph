import type { AdminNavCounts } from "@aihot/contracts/admin";
import { sql } from "../db.ts";
import { serverModules } from "../modules.ts";
import { failedFlowUnitCount } from "./runs.ts";

/**
 * Items waiting for the admin, on the navigation: new feedback, failing sources, today's failed
 * flow execution units, and what the modules count.
 */
export async function navCounts(): Promise<AdminNavCounts> {
  const [[c], runs, counts] = await Promise.all([
    sql<AdminNavCounts[]>`
    SELECT (SELECT count(*)::int FROM feedback WHERE status = 'new') AS feedback,
           (SELECT count(*)::int FROM sources WHERE enabled AND health = 'failing') AS sources`,
    failedFlowUnitCount(),
    Promise.all(serverModules().flatMap((m) => Object.entries(m.admin?.counts ?? {}).map(async ([key, count]) => [key, await count()] as const))),
  ]);
  return { ...c, runs, ...Object.fromEntries(counts) };
}
