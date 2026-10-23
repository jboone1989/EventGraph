// /research/:slug: one signed piece — byline, method, body, Article structured data
// (specs/002-adsense-readiness FR-013/015/016). The /en address shows the English fields when present.
//
// Module route files live outside apps/web/app, so react-router's typegen writes no `+types` for them:
// the loader and meta are typed structurally here, as the runtime calls them.
import { apiGet, cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta, siteUrl } from "@aihot/web/lib/seo";
import { renderMarkdown } from "@aihot/web/lib/markdown";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { useText, useUiLanguage } from "@aihot/web/components/LanguageSwitch";
import { englishText, hasHan } from "@aihot/web/lib/english";
import type { Screen } from "@aihot/web/components/shell/screens";
import { SITE } from "@aihot/site";
import type { ResearchArticleView, ResearchArticleResponse } from "../types.ts";

export const handle: Screen = { tab: "me" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";

/** What the page renders: cachedPage's wrapper is unwrapped by the router before it reaches props. */
type LoaderData = { article: ResearchArticleView; expiresAt: number };

export async function loader({ params, request }: { params: { slug: string }; request: Request }) {
  return cachedPage(120, {
    article: (await loadOr404<ResearchArticleResponse>(`/api/research/articles/${encodeURIComponent(params.slug)}`, { signal: request.signal })).article,
  });
}

export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

function articleLd(a: ResearchArticleView, at: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.summary,
    author: { "@type": "Person", name: a.author },
    publisher: { "@type": "Organization", name: SITE.name },
    datePublished: a.published_at ?? a.created_at,
    dateModified: a.updated_at,
    mainEntityOfPage: `${siteUrl()}${at}`,
  };
}

export function meta({ loaderData, location }: { loaderData?: LoaderData; location: { pathname: string } }) {
  if (!loaderData?.article) return [{ title: "研究不存在" }, { name: "robots", content: "noindex" }];
  const a = loaderData.article;
  const en = location.pathname.startsWith("/en/");
  return pageMeta({
    title: en ? (englishText(a.title_en) ?? a.title) : a.title,
    description: (en ? englishText(a.summary_en) ?? a.summary : a.summary).slice(0, 200),
    path: location.pathname,
    type: "article",
    jsonLd: articleLd(a, location.pathname),
  });
}

export default function ResearchArticle({ loaderData }: { loaderData?: LoaderData }) {
  const t = useText();
  const prefersEn = useUiLanguage() === "en";
  const a = loaderData?.article;
  if (!a) return null;
  // The /en address reads English fields; without them it stays on the Chinese text, clearly labelled.
  const showEn = prefersEn && a.title_en && a.body_md_en;
  const title = showEn ? a.title_en! : a.title;
  const summary = showEn ? a.summary_en ?? a.summary : a.summary;
  const body = showEn ? a.body_md_en! : a.body_md;
  const rendered = renderMarkdown(body, siteUrl());
  const date = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : "");
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-14 lg:pt-3">
      <PhoneBar back={{ to: prefersEn ? "/en/research" : "/research", label: t("研究", "Research") }} title={title} />
      <article className="pb-10 pt-4 lg:pt-2">
        <div className="mono text-[11.5px] text-ink-4">
          {a.author}
          {a.author_note ? ` · ${a.author_note}` : ""}
          {a.published_at ? ` · ${t("发布", "published")} ${date(a.published_at)}` : ""}
          {a.updated_at && a.published_at && date(a.updated_at) !== date(a.published_at) ? ` · ${t("更新", "updated")} ${date(a.updated_at)}` : ""}
        </div>
        <h1 data-page-title="" className="mt-3 text-[28px] font-black leading-[1.3] tracking-[-0.02em] text-ink xl:text-[36px]">{title}</h1>
        <p className="mt-4 text-[15.5px] leading-[1.85] text-ink-3 xl:text-[16.5px]">{summary}</p>
        <section aria-label={t("方法与数据", "Method and data")} className="mt-6 rounded-card border border-line bg-surface px-5 py-4">
          <h2 className="text-[13px] font-semibold text-ink">{t("方法与数据来源", "Method and data sources")}</h2>
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-[1.8] text-ink-3">{a.method}</p>
        </section>
        {!showEn && prefersEn && hasHan(title) ? (
          <p className="mt-6 text-[12.5px] leading-relaxed text-ink-4">
            {t("这篇研究暂无英文版，正文为中文。", "This piece has no English edition yet; the body is in Chinese.")}
          </p>
        ) : null}
        <div className="prose prose-compact mt-8 lg:mt-10" dangerouslySetInnerHTML={{ __html: rendered.html }} />
        <p className="mt-10 border-t border-line pt-5 text-[12.5px] leading-relaxed text-ink-4">
          {t(
            "原创研究，与聚合的新闻报道分开；AI 参与写作不代表结论经过独立核验。更正会更新本页并记录。",
            "Original research, kept apart from the aggregated news; AI help with the writing does not mean the conclusions were independently verified. Corrections update this page and are recorded.",
          )}
        </p>
      </article>
    </div>
  );
}
