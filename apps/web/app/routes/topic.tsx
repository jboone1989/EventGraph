import { REPORTS, REPORTS_EN, SITE } from "@aihot/site";
import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/topic";
import type { TopicPage } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { breadcrumbLd, localized, pageMeta, titled, topicLd } from "../lib/seo";
import { DayList, Pagination } from "../features/feed/DayList";
import { BrandMark } from "../components/BrandMark";
import { EmptyState } from "../components/ui/Page";
import { IconArrowLeft } from "../components/icons";
import { beijingDate } from "@aihot/contracts/time";
import { monthDay, localizedMonthDayTime } from "../lib/format";
import { enTopic, enDescription, englishOnly, EN_TOPIC_GROUPS } from "../lib/english";
import { PhoneBar } from "../components/shell/PhoneBar";
import { useUiLanguage, useText } from "../components/LanguageSwitch";
import { FollowControls } from "../components/FollowButton";
import { inNav } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import type { TopicPagePart } from "../modules";
import { loadParts } from "../site-modules";

export const handle: Screen = { home: inNav("/topics") ? "me" : "featured" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

/** Selected items of a topic: shared caches keep the page as long as its api answer (one minute). */
export async function loader({ params, request }: Route.LoaderArgs) {
  const page = params.page ? Number(params.page) : 1;
  if (params.page !== undefined && (!/^\d+$/.test(params.page) || page < 1)) throw new Response("Not found", { status: 404 });
  // Page 1 lives at the topic's own address (308).
  if (params.page === "1") throw redirect(`/topics/${params.slug}`, 308);
  const data = await loadOr404<TopicPage>(`/api/site/topics/${encodeURIComponent(params.slug)}?page=${page}`, { signal: request.signal });
  return cachedPage(60, { data });
}

const PARTS = await loadParts((m) => m.topicPage);

type Part = TopicPagePart & { key: string; data: unknown };

/** The modules' parts that have something on this page, in the site's order. */
function partsOf(data: TopicPage): Part[] {
  return PARTS.flatMap(({ name, part }) => {
    const value = data.modules[name];
    return value !== undefined && part.shows(value, data.topic) ? [{ ...part, key: name, data: value }] : [];
  });
}

/** The search snippet: what the topic covers, after when it last changed and its biggest recent events. */
function description(data: TopicPage, parts: Part[]): string {
  const { topic } = data;
  let text = topic.definition;
  const news = parts.flatMap((p) => p.news(p.data)).slice(0, 2).map((title) => title.replace(/[。.]$/u, "")).join("；");
  if (news && topic.latest) text = `${monthDay(beijingDate(topic.latest.at))}更新：${news}。${topic.definition}`;
  return text.length > 150 ? `${text.slice(0, 149)}…` : text;
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("主题不存在") }, { name: "robots", content: "noindex" }];
  const data = loaderData.data;
  const { topic, page } = data;
  const parts = partsOf(data);
  const path = page > 1 ? `/topics/${topic.slug}/page/${page}` : `/topics/${topic.slug}`;
  const text = page > 1 ? `${topic.name}的精选归档第 ${page} 页。${topic.definition}` : description(data, parts);
  // Under the topics page only while it is a way in, as the back link.
  const crumbs = breadcrumbLd([{ name: SITE.name, path: "/" }, ...(inNav("/topics") ? [{ name: "主题", path: "/topics" }] : []), { name: topic.name, path: `/topics/${topic.slug}` }]);
  return localized(pageMeta({
    title: page > 1
      ? `${topic.name} 精选 · 第 ${page} 页`
      : `${topic.name} 最新动态${parts.length ? `与${parts.map((p) => p.name).join("、")}` : ""}`,
    description: text,
    path,
    image: `/og/topics/${topic.slug}.png`,
    noindex: !topic.indexable,
    jsonLd: page > 1
      ? crumbs
      : [
          topicLd({
            path,
            name: `${topic.name} 最新动态`,
            description: text,
            dateModified: topic.latest?.at ?? null,
            lists: parts.map((p) => ({ name: p.name, entries: p.entries(p.data) })),
          }),
          crumbs,
        ],
  }), location.pathname, {
    title: `${enTopic(topic)} · Latest reports`,
    description: `${enDescription(topic)}: the latest selected reports, with links to their original sources and an RSS feed.`,
    noindex: !topic.indexable,
  });
}

export default function TopicRoute() {
  const language=useUiLanguage();
  const t=useText();
  const { data } = useLoaderData<typeof loader>();
  const { topic, items, page, pageCount, pageSize } = data;
  const parts = partsOf(data);
  const href = (p: number) => (p <= 1 ? `/topics/${topic.slug}` : `/topics/${topic.slug}/page/${p}`);
  const first = (page - 1) * pageSize + 1;
  const last = first + items.length - 1;
  const num = (n: number) => n.toLocaleString(language === "en" ? "en-US" : "zh-CN");
  return (
    <div className="pb-6">
      <PhoneBar back={inNav("/topics") ? { to: "/topics", label: t("全部主题", "All topics") } : { to: "/", label: t("精选", "Featured") }} title={t(topic.name, enTopic(topic))} />
      <Link to={inNav("/topics") ? "/topics" : "/"} className="hidden items-center gap-1.5 py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        <IconArrowLeft size={14} /> {inNav("/topics") ? t("返回全部主题", "Back to all topics") : t("返回精选", "Back to featured")}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-5 pt-3 lg:pt-1">
        <div className="min-w-0 max-w-[760px]">
          <p className="text-[12px] font-semibold tracking-[0.08em] text-accent">{language === "en" ? EN_TOPIC_GROUPS[topic.group]?.[0] ?? englishOnly(topic.groupName) : topic.groupName}</p>
          <h1 data-page-title="" className="mt-1.5 flex items-center gap-3 text-[24px] font-bold leading-[1.3] tracking-[-0.01em] text-ink lg:text-[26px]">
            {topic.brand && <BrandMark brand={topic.brand} size={34} />}
            <span>
              {t(topic.name, enTopic(topic))}{" "}
              <span className="whitespace-nowrap font-semibold text-ink-4">{t("最新动态", "· Latest")}</span>
            </span>
          </h1>
          <p className="mt-1.5 text-pretty text-[13.5px] leading-relaxed text-ink-3">{language === "en" ? enDescription(topic) : topic.definition}</p>
          <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-4">
            <span>
              <span className="num font-semibold text-ink-2">{num(topic.total)}</span>{` ${t(REPORTS.metricUnits.selectedCount, REPORTS_EN.metricUnits.selectedCount)}`}
            </span>
            <span>
              {t("近 30 天", "In the last 30 days")} <span className="num font-semibold text-ink-2">{num(topic.recent)}</span> {language === "en" ? (topic.recent === 1 ? "report" : "reports") : "条"}
            </span>
            <span>
              {t("共收录", "Indexed")} <span className="num font-semibold text-ink-2">{num(topic.poolTotal)}</span> {language === "en" ? (topic.poolTotal === 1 ? "report" : "reports") : "条"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-ink-4">
          <FollowControls kind="topic" id={topic.slug} name={topic.name} />
          {topic.latest && (
            <span>
              <time dateTime={topic.latest.at} className="num">{localizedMonthDayTime(topic.latest.at, language)}</time> {t("更新", "updated")}
            </span>
          )}
        </div>
      </header>

      {parts.map((p) => (
        <div key={`${p.key}:${topic.slug}`} className="mb-8">
          <p.Block data={p.data} topic={topic} />
        </div>
      ))}

      <h2 className="sr-only">{page === 1 ? t(`${topic.name}的精选`, `Selected: ${enTopic(topic)}`) : t(`精选归档 · 第 ${page} 页`, `Selected archive · page ${page}`)}</h2>
      {items.length === 0 ? (
        <div className="lg:card">
          <EmptyState title={t("这个主题暂时还没有精选内容", "No selected reports in this topic yet")} />
        </div>
      ) : (
        <DayList items={items} headerAside={<span className="num whitespace-nowrap">{t(`第 ${first}–${last} 条`, `Items ${first}–${last}`)}<span className="hidden sm:inline">{t(` · 共 ${num(topic.total)} 条`, ` · ${num(topic.total)} total`)}</span></span>} />
      )}
      <Pagination page={page} pageCount={pageCount} href={href} />
    </div>
  );
}
