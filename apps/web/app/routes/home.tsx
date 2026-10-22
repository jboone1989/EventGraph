import { useState } from "react";
import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { HotResponse, ReportIndexResponse, SiteStats, TimelineResponse } from "@aihot/contracts/site";
import { cachedPage, loadOr404, apiGet } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, hasFeedFilters, itemListLd, listPath, localized, pageMeta, readFilters, siteLd } from "../lib/seo";
import { inNav } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import { Timeline } from "../features/feed/Timeline";
import { ActiveFilters, CategoryTabs, FeedBar, ScopeTabs, SearchField } from "../features/feed/Filters";
import { IconArrowRight } from "../components/icons";
import type { KnowledgeGraph, KnowledgeStats } from "../components/KnowledgeNetwork";
import { useText } from "../components/LanguageSwitch";
import { AgentCard, DailyCard, LeadStory, MarketCard, PulseStrip, Trending } from "../features/home/Overview";
import { FollowingFeed } from "../features/home/Following";
import { useFollows } from "../lib/local-state";

const EMPTY_GRAPH: KnowledgeGraph = { entities: 0, edges: [], status: "unavailable" };
const EMPTY_STATS: KnowledgeStats = { entities: 0, relations: 0, episodes: 0, status: "unavailable" };
export const handle: Screen = { tab: "featured", name: "观察" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (q && q.trim()) throw redirect(`/all${url.search}`);
  const filters = readFilters(url.searchParams);
  const upstream = new Headers();
  const signal = request.signal;
  const [data, graph, stats, hot, site, dailies] = await Promise.all([
    loadOr404<TimelineResponse>(listPath("/api/site/timeline", filterParams(filters)), { responseHeaders: upstream, signal }),
    apiGet<KnowledgeGraph>("/api/site/knowledge/overview", { signal, timeoutMs: 1_800 }).catch(() => EMPTY_GRAPH),
    apiGet<KnowledgeStats>("/api/site/knowledge/stats", { signal, timeoutMs: 1_800 }).catch(() => EMPTY_STATS),
    apiGet<HotResponse>("/api/site/hot", { signal, timeoutMs: 1_800 }).catch(() => null),
    apiGet<SiteStats>("/api/site/stats", { signal, timeoutMs: 1_800 }).catch(() => null),
    apiGet<ReportIndexResponse>("/api/site/reports/daily", { signal, timeoutMs: 1_800 }).catch(() => null),
  ]);
  const lead = hot?.entries[0] ?? null;
  const storyGraph = lead
    ? await apiGet<KnowledgeGraph>(`/api/site/knowledge/stories/${encodeURIComponent(lead.story.publicId)}`, { signal, timeoutMs: 1_800 }).catch(() => EMPTY_GRAPH)
    : EMPTY_GRAPH;
  return cachedPage(60, { data, filters, graph, stats, hot: hot?.entries ?? [], site, storyGraph, daily: dailies?.items[0] ?? null }, upstream);
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const path = listPath("/", loaderData ? filterParams(loaderData.filters) : {});
  const titles = loaderData?.data.cards.map(c => c.item.title) ?? [];
  return localized(pageMeta({
    title: "事件观察",
    description: "实时追踪 AI、加密与金融事件，沿报道时间线深入长期知识关系与原始证据。",
    path, noindex: hasFeedFilters(loaderData?.filters),
    jsonLd: path === "/" ? [...siteLd(), itemListLd("/", "事件观察", titles)] : undefined,
  }), location.pathname, {
    title: "Event intelligence for AI, crypto & global events",
    description: "Follow AI, crypto, finance and global events as they develop — source-linked timelines and knowledge graphs, published for humans and AI agents.",
  });
}

export default function Home() {
  const { data, filters, graph, stats, hot, site, storyGraph, daily } = useLoaderData<typeof loader>();
  const t=useText();
  const filtered = Boolean(filters.tag || filters.category || (filters.channel !== "all"));
  const follows = useFollows();
  const [following, setFollowing] = useState(false);
  return (
    <div className="pb-6 lr-home">
      <FeedBar base="/" category={filters.category} channel={filters.channel} />
      <ActiveFilters base="/" category={filters.category} channel={filters.channel} tag={filters.tag} />
      {!filtered && (
        <>
          <PulseStrip site={site} graph={stats} />
          <LeadStory entry={hot[0] ?? null} storyGraph={storyGraph} overview={graph} />
        </>
      )}
      <div className="lr-home-grid">
        <div className="min-w-0">
          {!filtered && inNav("/hot") && <Trending entries={hot.slice(1, 5)} />}
          <div className="lr-feed-heading">
            <div>
              <div className="lr-eyebrow">{t("实时信息流","NEWS STREAM")}</div>
              <h2>{following ? t("我关注的","Following") : filters.tag ? `#${filters.tag}` : filtered ? t("筛选后的动态","Filtered news") : t("正在发生的事","What’s happening now")}</h2>
            </div>
            {filtered
              ? <Link to="/all" className="lr-inline-link">{t("全部动态","All news")} <IconArrowRight size={16}/></Link>
              : <div className="lr-feed-switch" role="group" aria-label={t("信息流范围","Feed scope")}>
                  <button type="button" aria-pressed={!following} onClick={() => setFollowing(false)}>{t("精选","Featured")}</button>
                  <button type="button" aria-pressed={following} onClick={() => setFollowing(true)}>{t("我关注的","Following")}{follows.length > 0 && <span className="ml-1 font-mono text-[11px] text-ink-4">{follows.length}</span>}</button>
                </div>}
          </div>
          {following && !filtered ? <FollowingFeed /> : <>
          <div className="hidden lg:block">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                {!inNav("/all") && <ScopeTabs base="/" />}
                <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-desk" className="min-w-0" />
              </div>
              <SearchField keep={{category: filters.category}}/>
            </div>
          </div>
          <Timeline initial={data} filters={data.filters}/>
          </>}
        </div>
        <aside className="lr-home-aside" aria-label={t("行情、日报与接入","Markets, daily brief and access")}>
          <MarketCard />
          <DailyCard latest={daily} />
          <AgentCard />
        </aside>
      </div>
    </div>
  );
}
