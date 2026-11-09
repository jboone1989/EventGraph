// One bounded read-only probe of the published hot ranking, run inside the deployed api image
// (docker compose exec -T api node scripts/hot-diagnose.ts --api-entries <count>) by the production
// smoke (specs/prod-hot-ranking-release-gate-20261109). Reuses the backend's heat queries and public
// read layer, writes nothing, prints a single aggregate JSON line (counts and timestamps only; no
// story titles, source IDs, credentials or article text), and fails closed on any error.
import { closeDb } from "@aihot/backend/db";
import { evaluateHotAcceptance, readHotRankingDiagnostic } from "@aihot/backend/operations/hot-diagnostic";

const args = process.argv.slice(2);
const at = args.indexOf("--api-entries");
const apiEntries = at >= 0 ? Number(args[at + 1]) : Number.NaN;
try {
  if (!Number.isInteger(apiEntries) || apiEntries < 0) throw new Error("usage: node scripts/hot-diagnose.ts --api-entries <public entry count>");
  const diagnostic = await readHotRankingDiagnostic();
  console.log(JSON.stringify({ diagnostic, acceptance: evaluateHotAcceptance(apiEntries, diagnostic) }));
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
} finally {
  await closeDb();
}
