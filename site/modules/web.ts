// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import { researchWeb } from "@aihot/research/web";

export const WEB_MODULES: readonly WebModule[] = [researchWeb];
