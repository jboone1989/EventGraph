// The research module's web parts: a sidebar entry for the section, a phone entry on 我的, and its
// place in the admin's 内容 group (specs/002-adsense-readiness US3, 003-content-assets FR-008).
import { defineWebModule } from "@aihot/web/modules";
import { IconDoc } from "@aihot/web/components/icons";

export const researchWeb = defineWebModule({
  name: "research",
  sidebar: {
    section: "更多",
    items: [{ to: "/research", label: "研究", labelEn: "Research", icon: IconDoc }],
  },
  tools: [{ to: "/research", label: "研究", icon: <IconDoc size={20} /> }],
  admin: {
    content: [{ to: "/admin/research", label: "研究稿件" }],
  },
});
