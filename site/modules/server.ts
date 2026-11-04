// The backend of the site's modules, installed by the api and worker when they start.
import type { ServerModule } from "@aihot/backend/modules";
import { researchServer } from "@aihot/research/server";
import { runDailyDiscovery } from "@aihot/backend/admin/discovery";

// Compose the daily source lifecycle at the site layer. The worker itself must never
// depend on admin/; serverModules().schedules is its existing extension seam.
const sourceDiscoveryServer: ServerModule = {
  name: "source-discovery",
  schedules: [{
    name: "sources.discover",
    cron: "10 5 * * *",
    missed: "once",
    when: () => process.env.COLLECT_ENABLED === "true",
    run: () => runDailyDiscovery(),
  }],
};

export const SERVER_MODULES: readonly ServerModule[] = [researchServer, sourceDiscoveryServer];
