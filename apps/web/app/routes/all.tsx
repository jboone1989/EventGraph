// The 全部 feed's list: search, sorting, day groups and paging. The page frame — feed bar, filters,
// heading, aside — lives in routes/feed-layout.tsx; a search keeps its query in the phone bar here.
import { useEffect } from "react";
import { Link, redirect, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/all";
import type { PoolResponse } from "@aihot/contracts/site";
import { SITE, subjectAfter } from "@aihot/site";
import { beijingTime } from "@aihot/contracts/time";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, hasFeedFilters, itemListLd, listPath, pageMeta, readFilters } from "../lib/seo";
import { PillTabs } from "../components/ui/Tabs";
import { DayList, Pagination } from "../features/feed/DayList";
import { EmptyState } from "../components/ui/Page";
import { IconSearch } from "../components/icons";
import { PhoneBar } from "../components/shell/PhoneBar";
import { isPhone, type Screen } from "../components/shell/screens";
import { openSearch } from "../features/search/SearchOverlay";
import { addRecentSearch } from "../lib/local-state";
import { useText,useUiLanguage } from "../components/LanguageSwitch";

export const handle: Screen = { tab: "featured", name: "全部" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

const ALL_TITLE = subjectAfter("全部", "动态");

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 200) || null;
  const tab = url.searchParams.get("tab") === "relevance" ? "relevance" : null;
  // Older deep-paging parameters (deep, anchorAt) still open a normal page.
  const page = Math.min(Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1), 50);
  const data = await loadOr404<PoolResponse>(
    listPath("/api/site/pool", { ...filterParams(readFilters(url.searchParams)), q, tab, page: page > 1 ? page : null }),
    // The busy page keeps the search, so it can be tried again as it was.
    { signal: request.signal, busyRedirect: `/all/search-busy${url.search}` },
  );
  // Past the last page of what there is: the last page, with the same search and filters.
  if (data.total > 0 && data.page > data.pageCount) throw redirect(pageHref(url.searchParams, data.pageCount));
  return cachedPage(60, { data });
}

export function meta({ loaderData }: Route.MetaArgs) {
  const f = loaderData?.data.filters;
  const q = f?.q;
  const page = loaderData?.data.page ?? 1;
  const path = listPath("/all", { ...(f && filterParams(f)), q, tab: q && f?.tab === "relevance" ? "relevance" : null, page: page > 1 ? page : null });
  const title = `${q ? `搜索：${q}` : ALL_TITLE}${page > 1 ? ` · 第 ${page} 页` : ""}`;
  const noindex = !!q || hasFeedFilters(f);
  return pageMeta({
    title,
    description: `${SITE.name} 收录的${subjectAfter("全部", "相关动态")}，可按频道、类别与标签筛选，支持中英文搜索。`,
    path,
    noindex,
    jsonLd: noindex ? undefined : itemListLd(path, title, loaderData?.data.items.map((i) => i.title) ?? []),
  });
}

function pageHref(params: URLSearchParams, page: number) {
  const sp = new URLSearchParams(params);
  sp.delete("deep");
  sp.delete("anchorAt");
  sp.delete("search");
  if (page <= 1) sp.delete("page");
  else sp.set("page", String(page));
  const s = sp.toString();
  return s ? `/all?${s}` : "/all";
}

export default function AllPage() {
  const { data } = useLoaderData<typeof loader>();
  const t=useText();
  const language=useUiLanguage();
  const [params] = useSearchParams();
  const f = data.filters;
  const searchTabHref = (tab: "time" | "relevance") => {
    const sp = new URLSearchParams(params);
    sp.delete("page");
    if (tab === "relevance") sp.set("tab", "relevance");
    else sp.delete("tab");
    return `/all?${sp}`;
  };
  const updated = beijingTime(data.freshness);
  // Searches are remembered in this browser for the phone search (listed in the privacy notice).
  useEffect(() => {
    if (f.q) addRecentSearch(f.q);
  }, [f.q]);
  // Older phone links (/all?search=1) opened the search field; they open the search now.
  useEffect(() => {
    if (params.get("search") === "1" && isPhone()) openSearch(f.q ?? "");
  }, []);

  return (
    <>
      {/* Phones: for a search the query (tap to change it) and back to 全部; otherwise the layout's feed bar shows. */}
      {f.q && (
        <PhoneBar
          back={{ to: "/all", label: t("全部","All news") }}
          center={
            <button type="button" onClick={(event) => openSearch(f.q ?? "", event.currentTarget)} className="flex h-11 min-w-0 max-w-full items-center gap-2 rounded-full bg-bg-sunk px-3.5 text-[15px] text-ink ring-1 ring-inset ring-line-soft dark:bg-bg-muted/60">
              <IconSearch size={16} className="shrink-0 text-ink-4" />
              <span className="truncate">{f.q}</span>
            </button>
          }
        />
      )}

      {f.q && (
        <div className="mb-3 mt-1 flex flex-wrap items-center justify-between gap-2 lg:mt-0">
          <PillTabs
            size="xs"
            layoutId="all-search-sort"
            label={t("搜索排序","Search sorting")}
            active={f.tab}
            items={(["time", "relevance"] as const).map((t) => ({ key: t, label: t === "time" ? (language==="en"?"Latest":"最新（标题与摘要）") : (language==="en"?"Relevance":"全文相关"), to: searchTabHref(t) }))}
          />
          <span className="text-[12px] text-ink-4">
            {t("找到","Found")} <span className="num">{data.total >= 2000 ? "2000+" : data.total}</span> {t("条 · 更新于","results · updated")} <span className="num">{updated}</span>
          </span>
        </div>
      )}

      {data.items.length === 0 ? (
        <div className="mt-2 lg:card">
          <EmptyState
            title={t("没有找到相关内容","No matching results")}
            action={
              f.q && f.tab === "time" ? (
                <Link to={searchTabHref("relevance")} className="text-[13px] font-medium text-accent hover:underline">
                  {t("试试“全文相关”，连正文一起搜","Try full-text relevance search")}
                </Link>
              ) : undefined
            }
          >
            {f.q ? t("换个说法，或者去掉筛选再试。","Try a different query or remove filters.") : t("这个筛选下暂时没有内容。","No news matches these filters.")}
          </EmptyState>
        </div>
      ) : (
        <DayList items={data.items} todayCount={f.q ? null : data.todayCount} />
      )}
      <Pagination page={data.page} pageCount={data.pageCount} href={(p) => pageHref(params, p)} />
      {data.page >= 50 && <p className="mt-4 text-center text-[12px] text-ink-4">{t("最多提供 50 页，更早的内容请使用搜索或主题页。","Up to 50 pages are available. Search for older reports.")}</p>}
    </>
  );
}
