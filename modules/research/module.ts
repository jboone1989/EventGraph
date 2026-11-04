// The research module's addresses (specs/002-adsense-readiness US3): signed original analysis beside
// the aggregated news, with author, method and sources on every piece.
import { defineModule } from "@aihot/contracts/modules";

export const module = defineModule({
  name: "research",
  pages: [
    { path: "research", file: "web/routes/research.tsx", id: "research-index" },
    { path: "research/:slug", file: "web/routes/research-article.tsx", id: "research-article" },
    // The English edition reads the same file at an /en address, as the engine's pages do.
    { path: "en/research", file: "web/routes/research.tsx", id: "en-research-index" },
    { path: "en/research/:slug", file: "web/routes/research-article.tsx", id: "en-research-article" },
  ],
  apiPaths: [/^\/api\/research(?:\/|$)/, /^\/api\/admin\/research(?:\/|$)/],
});
