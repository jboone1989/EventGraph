// /research: the site's own signed analysis (specs/002-adsense-readiness US3) — the list. The /en
// address reads the same data and shows English titles where the piece has them.
//
// Module route files live outside apps/web/app, so react-router's typegen writes no `+types` for them:
// the loader and meta are typed structurally here, as the runtime calls them.
import { apiGet, cachedPage } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { useText, useUiLanguage } from "@aihot/web/components/LanguageSwitch";
import { englishText } from "@aihot/web/lib/english";
import type { Screen } from "@aihot/web/components/shell/screens";
import type { ResearchArticlesResponse } from "../types.ts";

export const handle: Screen = { tab: "me" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";

/** What the page renders: cachedPage's wrapper is unwrapped by the router before it reaches props. */
type LoaderData = ResearchArticlesResponse & { expiresAt: number };

export async function loader({ request }: { request: Request }) {
  return cachedPage(120, await apiGet<ResearchArticlesResponse>("/api/research/articles", { signal: request.signal }));
}

export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export function meta({ location }: { location: { pathname: string } }) {
  const en = location.pathname.startsWith("/en/");
  return pageMeta({
    title: en ? "Original research" : "原创研究",
    description: en
      ? "Signed analysis from EventGraph: method, data and sources stated on every piece, kept apart from the aggregated news."
      : "EventGraph 的署名研究：每篇写明方法、数据与来源，与聚合的新闻报道分开呈现。",
    path: en ? "/en/research" : "/research",
  });
}

export default function ResearchIndex({ loaderData }: { loaderData?: LoaderData }) {
  const t = useText();
  const en = useUiLanguage() === "en";
  const articles = loaderData?.articles ?? [];
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-14 lg:pt-3">
      <PhoneBar back={{ to: "/more", label: t("我的", "More") }} title={t("原创研究", "Original research")} />
      <header className="pt-4 lg:pt-0">
        <div className="text-[12px] font-semibold text-accent">{t("研究 · 署名与方法", "Research · signed, with method")}</div>
        <h1 data-page-title="" className="mt-3 text-[30px] font-black leading-[1.25] tracking-[-0.02em] text-ink xl:text-[38px]">
          {t("原创研究", "Original research")}
        </h1>
        <p className="mt-4 max-w-[38em] text-[15px] leading-[1.85] text-ink-3">
          {t(
            "这里的每一篇都署名并写明方法、使用的数据与来源，由编辑审校后发布；与按事件聚合的新闻报道分开。AI 参与写作不代表结论经过独立核验，方法里写清了如何核对。",
            "Every piece here is signed and states its method, data and sources, published after the editor's review; it is kept apart from the event-aggregated news. AI help with the writing does not mean the conclusions were independently verified — the method says how to check them.",
          )}
        </p>
      </header>
      {articles.length === 0 ? (
        <p className="mt-10 text-[14px] leading-relaxed text-ink-4">{t("第一篇研究在准备中。", "The first piece is being prepared.")}</p>
      ) : (
        <ol className="mt-8 divide-y divide-line border-t border-line">
          {articles.map((a) => {
            const title = en ? (englishText(a.title_en) ?? a.title) : a.title;
            const summary = en ? (englishText(a.summary_en) ?? a.summary) : a.summary;
            const href = `${en ? "/en" : ""}/research/${a.slug}`;
            return (
              <li key={a.slug} className="py-6">
                <a href={href} className="group block">
                  <div className="mono text-[11.5px] text-ink-4">
                    {a.author}
                    {a.published_at ? ` · ${new Date(a.published_at).toISOString().slice(0, 10)}` : ""}
                  </div>
                  <h2 className="mt-1.5 text-[19px] font-bold leading-snug text-ink transition-colors group-hover:text-accent xl:text-[21px]">{title}</h2>
                  <p className="mt-2 text-[14px] leading-[1.8] text-ink-3">{summary}</p>
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
