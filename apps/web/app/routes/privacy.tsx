import { POLICY, SITE } from "@aihot/site";
import copy from "@aihot/site/pages/privacy.md?raw";
import copyEn from "@aihot/site/pages/privacy.en.md?raw";
import { edgeTtl } from "../lib/api.server";
import { pageMeta, siteUrl } from "../lib/seo";
import { renderMarkdown, type CopyDocument } from "../lib/markdown";
import { prepareCopy } from "../lib/site-copy";
import { CopyPage, LegalFooterLinks } from "../features/copy/CopyPage";
import { useText, useUiLanguage } from "../components/LanguageSwitch";
import { englishOnly } from "../lib/english";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "me" };

const PRIVACY = prepareCopy(copy);
/** The English document: the source policy's sections in English, with the same meta values. */
const PRIVACY_EN = {
  doc: {
    title: "Privacy information",
    meta: PRIVACY.doc.meta,
    intro: "An English explanation of the site's data-handling design. Operator identity, contact and exact retention details still require completion before commercial launch.",
    body: "",
  } as CopyDocument,
  rendered: renderMarkdown(copyEn, siteUrl()),
};

export function headers() {
  return edgeTtl(300);
}

export function meta() {
  return pageMeta({ title: "隐私说明", description: POLICY.privacy.description, path: "/privacy", image: "/og/pages/privacy.png" });
}

export default function PrivacyPage() {
  const language = useUiLanguage();
  const t = useText();
  const en = language === "en";
  const D = en ? PRIVACY_EN : PRIVACY;
  // The meta values are the site's own fill-ins and may still be Chinese placeholders; English omits those.
  const version = (en ? englishOnly(PRIVACY.doc.meta["版本"] ?? "") : PRIVACY.doc.meta["版本"]) ?? "";
  const effective = en ? englishOnly(PRIVACY.doc.meta["生效日期"] ?? "") : PRIVACY.doc.meta["生效日期"];
  return (
    <CopyPage
      doc={D.doc}
      rendered={D.rendered}
      eyebrow={SITE.name}
      footer={
        <LegalFooterLinks
          links={[
            { to: "/terms", label: en ? "Terms of use" : POLICY.terms.name },
            { to: "/feedback", label: t("反馈页", "Feedback") },
          ]}
          note={en
            ? ["Privacy information", version, effective ? `effective ${effective}` : ""].filter(Boolean).join(" · ")
            : `隐私说明 ${version} · ${effective ?? ""}`}
        />
      }
    />
  );
}
