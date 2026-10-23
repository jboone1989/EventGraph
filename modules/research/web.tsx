// The research module's web parts: a sidebar entry for the section, and its place in the admin's
// 内容 group (specs/002-adsense-readiness US3).
import { defineWebModule } from "@aihot/web/modules";
import { IconDoc } from "@aihot/web/components/icons";

export const researchWeb = defineWebModule({
  name: "research",
  sidebar: {
    section: "研究",
    items: [{ to: "/research", label: "研究", icon: IconDoc }],
  },
  admin: {
    content: [{ to: "/admin/research", label: "研究稿件" }],
  },
});
