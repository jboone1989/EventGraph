// The frame the 精选 and 全部 feeds share: the overview, the heading, the filter row and the aside
// stay mounted while the list below swaps, so switching scope feels like changing a tab on one page
// rather than opening another page. URLs stay / and /all; each child route owns only its list.
import { useState } from "react";
import { Link, Outlet, useLoaderData, useLocation, useNavigation, useOutletContext, useSearchParams } from "react-router";
import type { Route } from "./+types/feed-layout";
import type { HotResponse, ReportIndexResponse, SiteStats } from "@aihot/contracts/site";
import { subjectAfter } from "@aihot/site";
import { cachedPage, apiGet } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { readFilters, feedFrameKey, feedFrameFallbackKey, showsFeedOverview } from "../lib/seo";
import { inNav } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import type { KnowledgeGraph, KnowledgeStats } from "../components/KnowledgeNetwork";
import { ActiveFilters, CategoryTabs, FeedBar, ScopeTabs, SearchField } from "../features/feed/Filters";
import { AgentCard, DailyCard, LeadStory, MarketCard, PulseStrip, Trending } from "../features/home/Overview";
import { IconArrowRight } from "../components/icons";
import { useFollows } from "../lib/local-state";
import { useText } from "../components/LanguageSwitch";

const EMPTY_GRAPH: KnowledgeGraph = { entities: 0, edges: [], status: "unavailable" };
const EMPTY_STATS: KnowledgeStats = { entities: 0, relations: 0, episodes: 0, status: "unavailable" };

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const showOverview = showsFeedOverview(url);
  const upstream = new Headers();
  const signal = request.signal;
  const [graph, stats, hot, site, dailies] = await Promise.all([
    showOverview ? apiGet<KnowledgeGraph>("/api/site/knowledge/overview", { signal, timeoutMs: 1_800 }).catch(() => EMPTY_GRAPH) : EMPTY_GRAPH,
    showOverview ? apiGet<KnowledgeStats>("/api/site/knowledge/stats", { signal, timeoutMs: 1_800 }).catch(() => EMPTY_STATS) : EMPTY_STATS,
    showOverview ? apiGet<HotResponse>("/api/site/hot", { signal, timeoutMs: 1_800 }).catch(() => null) : null,
    showOverview ? apiGet<SiteStats>("/api/site/stats", { signal, timeoutMs: 1_800 }).catch(() => null) : null,
    apiGet<ReportIndexResponse>("/api/site/reports/daily", { signal, timeoutMs: 1_800 }).catch(() => null),
  ]);
  const lead = hot?.entries[0] ?? null;
  const storyGraph = showOverview && lead
    ? await apiGet<KnowledgeGraph>(`/api/site/knowledge/stories/${encodeURIComponent(lead.story.publicId)}`, { signal, timeoutMs: 1_800 }).catch(() => EMPTY_GRAPH)
    : EMPTY_GRAPH;
  return cachedPage(60, { graph, stats, hot: hot?.entries ?? [], site, storyGraph, daily: dailies?.items[0] ?? null }, upstream);
}

// One result for both scopes: switching 精选/全部 re-runs this loader but reads the same fresh
// entry, so the frame never asks the server for data the list switch did not change.
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>(feedFrameKey, feedFrameFallbackKey);

export const handle: Screen = { tab: "featured" };

const ALL_TITLE = subjectAfter("全部", "动态");

export default function FeedLayout() {
  const { hot, site, stats, graph, daily, storyGraph } = useLoaderData<typeof loader>();
  const t = useText();
  const location = useLocation();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const [following, setFollowing] = useState(false);
  const follows = useFollows();
  const base = location.pathname === "/all" ? "/all" : "/";
  const filters = readFilters(params);
  const q = params.get("q")?.trim().slice(0, 200) || null;
  const filtered = Boolean(filters.tag || filters.category || filters.channel !== "all");
  const busy = navigation.state === "loading" && ["/", "/all"].includes(navigation.location?.pathname ?? "");
  const allTitle = q ? t(`搜索“${q}”`, `Search: ${q}`) : filters.tag ? `#${filters.tag}` : null;
  return (
    <div className="pb-6 lr-home">
      {/* A /all search keeps its query in the phone bar instead (all.tsx), so the scope bar steps aside. */}
      {!(base === "/all" && q) && <FeedBar base={base} category={filters.category} channel={filters.channel} />}
      <ActiveFilters base={base} category={filters.category} channel={filters.channel} tag={filters.tag} />
      {!filtered && !q && (
        <>
          <PulseStrip site={site} graph={stats} />
          <LeadStory entry={hot[0] ?? null} storyGraph={storyGraph} overview={graph} />
        </>
      )}
      <div className="lr-home-grid">
        <div className="min-w-0">
          {!filtered && !q && inNav("/hot") && <Trending entries={hot.slice(1, 5)} />}
          {base === "/" ? (
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
          ) : (
            <div className="hidden lg:block">
              {/* h2 like the 精选 heading: the lead story above is the page's h1 on both views. */}
              <h2 className="text-[24px] font-semibold leading-[1.3] text-ink">{allTitle ?? t(ALL_TITLE,"All news")}</h2>
            </div>
          )}
          <div className="hidden lg:block">
            <div className={`mb-5 @container ${base === "/all" ? "mt-4" : ""}`}>
              <div className="flex min-w-0 flex-col gap-3 @[1120px]:flex-row @[1120px]:items-center @[1120px]:justify-between">
                <div className="flex min-w-0 w-full items-center gap-3 @[1120px]:flex-1">
                  {!inNav("/all") && <ScopeTabs base={base} />}
                  <CategoryTabs base={base} category={filters.category} channel={filters.channel} layoutId="feed-cat-desk" className="min-w-0 flex-1" />
                </div>
                <div className="flex justify-end @[1120px]:shrink-0">
                  <SearchField defaultValue={q ?? ""} keep={{ category: filters.category, channel: filters.channel }} />
                </div>
              </div>
            </div>
          </div>
          <div className={`transition-opacity duration-200 ${busy ? "opacity-50" : ""}`}>
            <Outlet context={{ following }} />
          </div>
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
