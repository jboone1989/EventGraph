// Official giscus client: third-party code loads only after reader interaction.
import { useEffect, useRef, useState } from "react";
import { useUiLanguage, useText } from "../../components/LanguageSwitch";
import { discussionTermFor } from "../../lib/discussions";
import { SITE } from "@aihot/site";

const CATEGORY = import.meta.env.VITE_GISCUS_CATEGORY_ID?.trim() ?? "";
const { repo: DISCUSSION_REPO, repoId: REPO_ID } = SITE.discussions;

function Embed({ term, lang }: { term: string; lang: "en" | "zh-CN" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.repo = DISCUSSION_REPO;
    script.dataset.repoId = REPO_ID;
    script.dataset.categoryId = CATEGORY;
    script.dataset.mapping = "specific";
    script.dataset.term = term;
    script.dataset.strict = "1";
    script.dataset.reactionsEnabled = "1";
    script.dataset.emitMetadata = "0";
    script.dataset.inputPosition = "bottom";
    script.dataset.theme = "preferred_color_scheme";
    script.dataset.lang = lang;
    script.dataset.loading = "lazy";
    host.append(script);
    return () => { host.replaceChildren(); };
  }, [term, lang]);
  return <div ref={ref} className="giscus min-w-0" />;
}

export function StoryDiscussion({ storyPublicId }: { storyPublicId: string | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const t = useText();
  const language = useUiLanguage();
  const term = discussionTermFor(storyPublicId);
  // Do not display a dead comments UI until GitHub Discussion category is configured.
  if (!term || !CATEGORY || !DISCUSSION_REPO || !REPO_ID) return null;
  return <section className="mt-7 min-w-0 rounded-panel border border-line-soft p-4" aria-label={t("事件讨论", "Event discussion")}>
    <h2 className="text-[16px] font-semibold text-ink">{t("事件讨论", "Event discussion")}</h2>
    <p className="mt-1 text-[12px] leading-relaxed text-ink-4">
      {t("读者观点通过 GitHub Discussions 发布，发言需登录 GitHub；评论不等于已经核实的事实。",
        "Reader opinions are hosted on GitHub Discussions; posting requires a GitHub account. Comments are not verified facts.")}
    </p>
    {!expanded && <button type="button" onClick={() => setExpanded(true)}
      className="mt-3 rounded-control border border-line px-4 py-2 text-[13px] font-semibold text-accent hover:border-accent">
      {t("加载讨论", "Load discussion")}
    </button>}
    {expanded && <div className="mt-4"><Embed term={term} lang={language === "en" ? "en" : "zh-CN"} /></div>}
    <a href={`https://github.com/${DISCUSSION_REPO}/discussions`} target="_blank" rel="noopener noreferrer"
      className="mt-3 inline-block text-[12px] text-accent hover:underline">
      {t("在 GitHub 打开讨论", "Open GitHub Discussions")}
    </a>
  </section>;
}
