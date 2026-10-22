import { POLICY, SITE } from "@aihot/site";
import copy from "@aihot/site/pages/terms.md?raw";
import copyEn from "@aihot/site/pages/terms.en.md?raw";
import { edgeTtl } from "../lib/api.server";
import { pageMeta, siteUrl } from "../lib/seo";
import { renderMarkdown, type CopyDocument } from "../lib/markdown";
import { prepareCopy } from "../lib/site-copy";
import { CopyPage, LegalFooterLinks } from "../features/copy/CopyPage";
import { useText, useUiLanguage } from "../components/LanguageSwitch";
import { englishOnly } from "../lib/english";
import type { Screen } from "../components/shell/screens";
import { webModules } from "../site-modules";

export const handle: Screen = { tab: "me" };

const TERMS = prepareCopy(copy);
/** The English document: the source terms' sections in English, with the same meta values. */
const TERMS_EN = {
  doc: {
    title: "Terms of use",
    meta: TERMS.doc.meta,
    intro: "An English explanation of the site's current template terms. Some operational and licensing details remain to be finalized for launch.",
    body: "",
  } as CopyDocument,
  rendered: renderMarkdown(copyEn, siteUrl()),
};

export function headers() {
  return edgeTtl(300);
}

export function meta() {
  return pageMeta({ title: POLICY.terms.name, description: POLICY.terms.description, path: "/terms", image: "/og/pages/terms.png" });
}

export default function TermsPage() {
  const language = useUiLanguage();
  const t = useText();
  const en = language === "en";
  const D = en ? TERMS_EN : TERMS;
  // The meta values are the site's own fill-ins and may still be Chinese placeholders; English omits those.
  const version = (en ? englishOnly(TERMS.doc.meta["版本"] ?? "") : TERMS.doc.meta["版本"]) ?? "";
  const effective = en ? englishOnly(TERMS.doc.meta["生效日期"] ?? "") : TERMS.doc.meta["生效日期"];
  return (
    <CopyPage
      doc={D.doc}
      rendered={D.rendered}
      eyebrow={SITE.name}
      footer={
        <LegalFooterLinks
          links={[
            { to: "/privacy", label: t("隐私说明", "Privacy information") },
            { to: "/agent", label: t("Agent 接入页", "Agent integration") },
            ...webModules().flatMap((m) => m.termsLinks ?? []),
          ]}
          note={en
            ? ["Terms of use", version, effective ? `effective ${effective}` : ""].filter(Boolean).join(" · ")
            : `${POLICY.terms.name} ${version} · ${effective ?? ""}`}
        />
      }
    />
  );
}
