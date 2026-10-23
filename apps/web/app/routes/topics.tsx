import { useLoaderData } from "react-router";
import { SITE, subjectAfter, withSubject } from "@aihot/site";
import type { Route } from "./+types/topics";
import type { TopicSummary, TopicsResponse } from "@aihot/contracts/site";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { breadcrumbLd, localized, pageMeta, siteUrl } from "../lib/seo";
import { localizedRelativeTime } from "../lib/format";
import { enTopic, enDescription, englishText, englishOnly, EN_TOPIC_GROUPS } from "../lib/english";
import { IconChevronRight } from "../components/icons";
import { IntentLink } from "../components/ui/IntentLink";
import { BrandMark } from "../components/BrandMark";
import { PhoneBar } from "../components/shell/PhoneBar";
import { useUiLanguage, useText } from "../components/LanguageSwitch";
import { inNav } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { home: inNav("/topics") ? "me" : "featured", name: "主题" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  return cachedPage(300, await apiGet<TopicsResponse>("/api/site/topics", { signal: request.signal }));
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  if (!loaderData) return pageMeta({ title: SITE.topicsTitle, path: "/topics", image: "/og/pages/topics.png" });
  const { groups, topics } = loaderData;
  const by = groups.map((g) => g.name).join("、");
  const indexed = topics.filter((t) => t.indexable);
  const named = indexed.slice(0, 6).map((t) => t.name.split(" / ")[0]).join("、");
  const base = siteUrl();
  return localized(pageMeta({
    title: SITE.topicsTitle,
    description: `按${by}${subjectAfter("追踪", "最新动态")}：${named ? `${named}等 ` : ""}${topics.length} 个主题，浏览最新精选与重要进展，持续更新。`,
    path: "/topics",
    image: "/og/pages/topics.png",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": `${base}/topics#collection`,
        url: `${base}/topics`,
        name: withSubject("主题"),
        inLanguage: SITE.locale,
        isPartOf: { "@id": `${base}/#website` },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: indexed.length,
          itemListElement: indexed.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, url: `${base}/topics/${t.slug}` })),
        },
      },
      breadcrumbLd([{ name: SITE.name, path: "/" }, { name: "主题", path: "/topics" }]),
    ],
  }), location.pathname, {
    title: "Topics",
    description: `Follow ${topics.length} topics across AI, crypto, finance and research, each with its latest selected reports and RSS feed.`,
  });
}

/** Phones: a row per topic in a grouped list; wider screens: a card per topic. */
function TopicCard({ topic }: { topic: TopicSummary }) {
  const language = useUiLanguage();
  const t = useText();
  const summary = language === "en" ? englishText(topic.latest?.title) ?? enDescription(topic) : topic.latest?.title ?? topic.definition;
  return (
    <IntentLink
      viewTransition
      to={`/topics/${topic.slug}`}
      className="group flex items-center gap-3 py-3 pl-4 pr-3 transition-colors active:bg-bg-sunk lg:card lg:card-hover lg:h-full lg:flex-col lg:items-stretch lg:gap-0 lg:px-5 lg:py-4 lg:active:bg-surface"
    >
      {topic.brand && (
        <span className="flex shrink-0 lg:hidden">
          <BrandMark brand={topic.brand} size={30} />
        </span>
      )}
      <span className="min-w-0 flex-1 lg:flex lg:flex-col">
        <span className="flex items-center gap-2.5 text-[15.5px] font-semibold text-ink transition-colors group-hover:text-accent lg:text-[15px] lg:font-bold">
          {topic.brand && (
            <span className="hidden lg:flex">
              <BrandMark brand={topic.brand} size={22} />
            </span>
          )}
          {t(topic.name, enTopic(topic))}
        </span>
        <span className="mt-0.5 line-clamp-1 text-[12.5px] leading-[1.6] text-ink-4 lg:mt-1.5 lg:line-clamp-2 lg:flex-1 lg:text-[13px] lg:leading-[1.65] lg:text-ink-2">
          {summary}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-ink-4 lg:mt-3 lg:justify-between">
          {topic.latest && <time dateTime={topic.latest.at} suppressHydrationWarning>{localizedRelativeTime(topic.latest.at, language)}</time>}
          <span>
            {topic.recent > 0 ? (
              language === "en" ? (
                <><span className="num font-semibold text-ink-3">{topic.recent}</span> in the last 30 days</>
              ) : (
                <>近 30 天 <span className="num font-semibold text-ink-3">{topic.recent}</span> 条</>
              )
            ) : (
              t("近 30 天暂无新精选", "No new selections in the last 30 days")
            )}
          </span>
        </span>
      </span>
      <IconChevronRight size={16} className="shrink-0 text-ink-4 lg:hidden" />
    </IntentLink>
  );
}

export default function TopicsPage() {
  const language = useUiLanguage();
  const t = useText();
  const { groups, topics } = useLoaderData<typeof loader>();
  const groupNames = groups.map((g) => (language === "en" ? EN_TOPIC_GROUPS[g.key]?.[0] ?? englishOnly(g.name) : g.name)).filter((n) => n !== null).join(language === "en" ? ", " : "、");
  return (
    <div className="pb-10">
      <PhoneBar back={{ to: "/more", label: t("我的", "More") }} title={t("主题", "Topics")} />
      <header className="pb-2 pt-3 lg:pt-1">
        <h1 data-page-title="" className="text-[24px] font-semibold leading-[1.3] text-ink">{t(subjectAfter("按主题看"), "Explore by topic")}</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
          {language === "en" ? "Browse " : `按${groupNames}浏览 `}
          <span className="num">{topics.length}</span>
          {language === "en" ? ` topics across ${groupNames}, tracking the latest selections and key developments.` : " 个主题，追踪最新精选与重要进展。"}
        </p>
      </header>
      {groups.map((g) => {
        const heading = language === "en" ? EN_TOPIC_GROUPS[g.key]?.[0] ?? englishOnly(g.name) : g.name;
        const blurb = language === "en" ? EN_TOPIC_GROUPS[g.key]?.[1] ?? englishOnly(g.blurb) : g.blurb;
        return (
        <section key={g.key} aria-labelledby={`topics-${g.key}`} className="pt-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            {heading && (
              <h2 id={`topics-${g.key}`} className="text-[15px] font-bold text-ink">
                {heading}
              </h2>
            )}
            {blurb && <p className="text-[12px] text-ink-4">{blurb}</p>}
          </div>
          <ul className="mt-3 divide-y divide-line-soft overflow-hidden rounded-card border border-line bg-surface lg:mt-3.5 lg:grid lg:grid-cols-3 lg:gap-3 lg:divide-y-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent xl:grid-cols-4">
            {topics
              .filter((t) => t.group === g.key)
              .map((t) => (
                <li key={t.slug}>
                  <TopicCard topic={t} />
                </li>
              ))}
          </ul>
        </section>
        );
      })}
    </div>
  );
}
