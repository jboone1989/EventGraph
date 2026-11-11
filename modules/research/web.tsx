// The research module's web parts: a sidebar entry for the section, a phone entry on 我的, and its
// place in the admin's 内容 group (specs/002-adsense-readiness US3, 003-content-assets FR-008).
// The entries show only while at least one piece is published; an unreadable state hides them
// (specs/adsense-minimal-readiness-20261111 US1), never a link to an empty section.
import { defineWebModule } from "@aihot/web/modules";
import { IconDoc } from "@aihot/web/components/icons";
import type { ResearchArticlesResponse } from "./web/types.ts";

/** Whether the module's state says the section has anything to read: a number of published pieces ≥ 1. */
const shows = (state: unknown) =>
  typeof state === "object" && state !== null && Number((state as { published?: number }).published ?? 0) >= 1;

export const researchWeb = defineWebModule({
  name: "research",
  sidebar: {
    section: "更多",
    items: [{ to: "/research", label: "研究", labelEn: "Research", icon: IconDoc }],
  },
  tools: [{ to: "/research", label: "研究", icon: <IconDoc size={20} /> }],
  showsEntries: shows,
  root: {
    // The same public read the list page uses, beside /api/site/meta: how many published pieces there are.
    state: async (api) => {
      const { articles } = await api<ResearchArticlesResponse>("/api/research/articles");
      return { published: articles.length };
    },
  },
});
