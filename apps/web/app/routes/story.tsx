import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IntentLink } from "../components/ui/IntentLink";
import { Link, redirect, useLoaderData, useLocation } from "react-router";
import type { Route } from "./+types/story";
import type { StoryDetail, StoryReportView, StoryRoute } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { breadcrumbLd, localized, pageMeta, storyLd, titled } from "../lib/seo";
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import { localizedMonthDay, localizedMonthDayTime, relativeTime } from "../lib/format";
import { HeatChart } from "../features/story/HeatChart";
import { EventPrices, type StoryMarket } from "../features/story/EventPrices";
import { englishText, localizedSourceName, enTopicName } from "../lib/english";
import { isEnglishPath } from "../lib/edition";
import { sessionCache } from "../lib/session-cache";
import { isReload } from "../lib/restore";
import { Badge, SelectedBadge } from "../components/ui/Badge";
import { PillTabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Controls";
import { IconArrowLeft, IconChevronRight, IconClock, IconDoc, IconUsers } from "../components/icons";
import { PhoneBar } from "../components/shell/PhoneBar";
import { inNav } from "../components/shell/nav";
import { useText, useUiLanguage } from "../components/LanguageSwitch";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { home: inNav("/hot") ? "hot" : "featured" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ params, request }: Route.LoaderArgs) {
  const storyPromise = loadOr404<StoryDetail>(`/api/site/stories/${encodeURIComponent(params.publicId)}`, { signal: request.signal, merged: (id) => `/story/${id}` });
  // Graph availability must never hide an otherwise public event and its source timeline.
  const marketPromise = apiGet<StoryMarket>(`/api/market/stories/${encodeURIComponent(params.publicId)}`, { signal: request.signal, timeoutMs: 1_500 }).catch(() => null);
  // The story route is derived from the story itself; its absence hides one panel, not the page.
  const routePromise = apiGet<StoryRoute>(`/api/site/stories/${encodeURIComponent(params.publicId)}/route`, { signal: request.signal, timeoutMs: 4_000 }).catch(() => null);
  const [story, market, route] = await Promise.all([storyPromise, marketPromise, routePromise]);
  // A quick note (a single short-digest source) has no event page of its own (specs/004-editorial-ops
  // FR-003): its one report's page carries everything, so the address forwards there, 302 to stay reversible.
  const note = story.note && story.reportCount === 1 ? story.timeline[0] ?? null : null;
  if (note) throw redirect(`${isEnglishPath(new URL(request.url).pathname) ? "/en" : ""}/items/${encodeURIComponent(note.id)}`);
  return cachedPage(120, { story, market, route });
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("事件不存在") }, { name: "robots", content: "noindex" }];
  const s = loaderData.story;
  const english = s.english ?? null;
  return localized(pageMeta({
    title: s.title,
    description: (s.digest ?? s.summary ?? s.excerpt?.text)?.slice(0, 150) ?? `${s.sourceCount} 个报道来源 ${s.reportCount} 篇报道，完整时间线与最新进展。`,
    path: `/story/${s.publicId}`,
    image: `/og/stories/${s.publicId}.png`,
    type: "article",
    // FR-006/FR-009: an uncured or thin single-source event page stays readable but out of the index.
    noindex: !s.indexable,
    jsonLd: [
      storyLd(s),
      // Under the board only while it is a way in, as the back link.
      breadcrumbLd([{ name: SITE.name, path: "/" }, ...(inNav("/hot") ? [{ name: "热点榜", path: "/hot" }] : []), { name: s.title, path: `/story/${s.publicId}` }]),
    ],
  }), location.pathname, {
    title: english?.title ?? englishText(s.englishTitle) ?? "Event timeline",
    description: english ? english.digest.slice(0, 160) : `${s.reportCount} reports from ${s.sourceCount} sources, with the full timeline, knowledge-graph relations and links to the original reporting.`,
    // Without an English digest of its own (editorial/english.ts) the English page is headlines only and is not indexed;
    // the curation decision is the Chinese page's (FR-012).
    noindex: !english || !s.indexable,
  });
}

const STATUS = {
  active: { label: "持续更新", tone: "hot" },
  watching: { label: "观察中", tone: "amber" },
  settled: { label: "历史事件", tone: "neutral" },
} as const;

// Section anchors keep the old page's ids so shared links still land in the right place.
const SECTIONS = { overview: "event-overview", reports: "event-reports", heat: "event-heat" } as const;
type SectionKey = keyof typeof SECTIONS;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A main-column card: 17px title, 24px padding. */
function Panel({ id, title, sub, right, children, className = "" }: { id?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`card scroll-mt-[calc(var(--bar-h)+64px)] p-5 lg:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-[650] leading-[1.5] text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-[12.5px] text-ink-4">{sub}</p>}
        </div>
        {right && <div className="shrink-0 text-[11.5px] text-ink-4">{right}</div>}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** A rail card: 14px title, 22px padding. */
function RailCard({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 lg:p-[22px] ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-[650] text-ink">{title}</h2>
        {right && <span className="num text-[11.5px] text-ink-4">{right}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Highlights the section nav entry whose section is under the sticky bar. */
function useActiveSection(keys: SectionKey[]): [SectionKey, (k: SectionKey) => void] {
  const [active, setActive] = useState<SectionKey>("overview");
  const clampedTarget = useRef<{ key: SectionKey; landed: boolean } | null>(null);
  useEffect(() => {
    const sections = keys.flatMap((key) => {
      const el = document.getElementById(SECTIONS[key]);
      return el ? [{ key, el }] : [];
    });
    const onScroll = () => {
      let cur: SectionKey = keys[0]!;
      // Use the same offset as anchor scrolling; fractional positions need one pixel of tolerance.
      for (const { key, el } of sections) {
        const offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
        if (el.getBoundingClientRect().top <= offset + 1) cur = key;
      }
      // Several short sections can share the bottom landing. A click disambiguates that landing;
      // scrolling away restores the ordinary position-based highlight.
      const bottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (bottom) {
        cur = clampedTarget.current?.key ?? keys[keys.length - 1]!;
        if (clampedTarget.current) clampedTarget.current.landed = true;
      } else if (clampedTarget.current?.landed) clampedTarget.current = null;
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const resized = new ResizeObserver(onScroll);
    resized.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      resized.disconnect();
    };
  }, [keys.join()]);
  const go = (k: SectionKey) => {
    const el = document.getElementById(SECTIONS[k]);
    if (!el) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const destination = window.scrollY + el.getBoundingClientRect().top - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
    clampedTarget.current = destination >= max - 1 ? { key: k, landed: false } : null;
    setActive(k);
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    history.replaceState(history.state, "", `#${SECTIONS[k]}`);
  };
  return [active, go];
}

/** One report on the story timeline: time, source and marks, title, a summary that opens on demand. */
function TimelineRow({ r }: { r: StoryReportView }) {
  const lang = useUiLanguage();
  const t = useText();
  const title = lang === "en" ? (englishText(r.english?.title) ?? englishText(r.originalTitle) ?? englishText(r.title) ?? "Original-language report — open source") : r.title;
  const summary = lang === "en" ? (r.english?.summary ?? englishText(r.summary)) : r.summary;
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [r.summary, open]);
  return (
    <li className="grid gap-x-3 border-b border-line-soft py-4 last:border-b-0 lg:grid-cols-[48px_minmax(0,1fr)]">
      <time dateTime={r.publishedAt} className="mono text-[12px] leading-[20px] text-ink-4">
        {beijingTime(r.publishedAt)}
      </time>
      <div className="min-w-0">
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] leading-[20px] text-ink-4 lg:mt-0">
          <span className="min-w-0 truncate">{localizedSourceName(r.source.name, lang, r.originalUrl)}</span>
          {r.selected && <SelectedBadge />}
          {r.source.firstParty && <span className="rounded border border-line-soft px-1.5">{t("一手资料", "First-party source")}</span>}
        </div>
        <IntentLink viewTransition to={lang === "en" ? `/en/items/${r.id}` : `/items/${r.id}`} className="mt-1 block text-[16px] font-[650] leading-[1.6] text-ink transition-colors hover:text-accent lg:text-[15.5px]">
          {title}
        </IntentLink>
        {r.discoveredAt && <p className="mt-1 text-[11.5px] text-ink-4">{t("本站收录于", "Report first recorded")} {localizedMonthDayTime(r.discoveredAt, lang)}</p>}
        {summary && (
          <>
            <p ref={ref} className={`mt-1 text-[14px] leading-[1.75] text-ink-3 ${open ? "" : "line-clamp-2"}`}>
              {summary}
            </p>
            {(clamped || open) && (
              <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 text-[12.5px] text-note transition-colors hover:text-accent">
                {open ? t("收起摘要", "Show less") : t("展开摘要", "Show more")}
              </button>
            )}
          </>
        )}
        {r.originalUrl && /^https?:\/\//i.test(r.originalUrl) && (
          <a href={r.originalUrl} target="_blank" rel="noopener noreferrer" data-analytics-event="source_open" className="mt-1 inline-block text-[12.5px] font-medium text-accent hover:underline">
            {t("核对原始报道", "Read original source")} ↗
          </a>
        )}
      </div>
    </li>
  );
}

type Filter = "all" | "official" | "selected";
type Order = "desc" | "asc";

// The report filter and shared reading order, per history entry: back from a report restores the view.
const viewCache = sessionCache<{ savedAt: number; filter: Filter; order: Order }>("aihot:story-view:", 30 * 60 * 1000);

/** The structured story route (EG-T17): station by station, each with its evidence and
 *  uncertainty, each jumping back into the explorer at the moment the station was recorded. */
function StoryRoutePanel({ route, storyPublicId }: { route: StoryRoute; storyPublicId: string }) {
  const t = useText();
  const uiLang = useUiLanguage();
  const when = (iso: string) => localizedMonthDayTime(iso, uiLang);
  const prefix = uiLang === "en" ? "/en" : "";
  const badge = "rounded border border-line-soft px-1.5 py-0.5";
  return (
    <Panel title={t("Story 路线","Story route")}
      sub={t("从第一份公开证据到最新进展的逐站路线；每一站都带着自己的证据和不确定性。","A station-by-station route from the first public evidence onward; every station carries its own evidence and uncertainty.")}
      className="order-2">
      {route.status === "insufficient" ? (
        <p className="text-[13.5px] leading-[1.7] text-ink-4">
          {t("公开证据还不足以建立路线，不能把单方说法当作完整脉络。","Public evidence is not enough to build a route; a one-sided claim is not a storyline.")}
        </p>
      ) : (
        <>
          <ol className="border-l border-line-soft pl-4">
            {route.stations.map((s, i) => (
              <li key={s.factId} className="pb-4 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-4">
                  <span className="num font-semibold text-ink-3">{i + 1}</span>
                  <span className="num">{when(s.timeEffective ?? s.timeRecorded)}</span>
                  {s.timeEffective && <span className="num">{t("收录于","recorded")} {when(s.timeRecorded)}</span>}
                  {s.uncertainty.singleSource && <span className={badge}>{t("单一来源","single source")}</span>}
                  {s.uncertainty.occurredAtMissing && <span className={badge}>{t("时间来自报道","report-time only")}</span>}
                  {s.uncertainty.revised && <span className={badge}>{t("有修订","revised")}</span>}
                </div>
                <p className="mt-1 text-[14px] font-semibold leading-[1.6] text-ink">{s.title}</p>
                {s.reports[0] && /^https?:\/\//i.test(s.reports[0].url) && (
                  <a href={s.reports[0].url} target="_blank" rel="noopener noreferrer" data-analytics-event="source_open"
                    className="mt-1 inline-block text-[12.5px] text-accent hover:underline">
                    {t("核对原始报道","Read original source")} ↗ {localizedSourceName(s.reports[0].source, uiLang, s.reports[0].url)}
                  </a>
                )}
                <Link to={`${prefix}/explore?story=${encodeURIComponent(storyPublicId)}&clock=known&asOf=${encodeURIComponent(s.timeRecorded)}`}
                  className="mt-1.5 inline-flex items-center gap-0.5 text-[12.5px] font-medium text-accent hover:underline">
                  {t("在探索工作台回到这个时点","Replay this moment in the explorer")} <IconChevronRight size={13} />
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[12px] leading-[1.6] text-ink-4">
            {route.limits.truncated
              ? t("路线有截断；完整证据以探索工作台和证据包为准。","The route is truncated; the explorer and the evidence bundle carry the full evidence.")
              : t("不确定性标注指出需要核对原文的地方，不是已证实的因果。","Uncertainty marks flag where to check the sources; they are not proven causation.")}
          </p>
        </>
      )}
    </Panel>
  );
}

export default function StoryPage() {
  const { story, market, route } = useLoaderData<typeof loader>();
  const t=useText();
  const uiLang=useUiLanguage();
  const when = (iso: string) => localizedMonthDayTime(iso, uiLang);
  const entry = useLocation().key;
  const [filter, setFilter] = useState<Filter>(() => viewCache.peek(entry)?.filter ?? "all");
  const [order, setOrder] = useState<Order>(() => viewCache.peek(entry)?.order ?? "desc");
  // A document the browser reloaded on back/forward gets the view back after hydration.
  useEffect(() => {
    if (viewCache.peek(entry) || isReload()) return;
    const saved = viewCache.read(entry);
    if (saved) {
      setFilter(saved.filter);
      setOrder(saved.order);
    }
  }, [entry]);
  useEffect(() => {
    if (filter !== "all" || order !== "desc" || viewCache.peek(entry)) viewCache.set(entry, { savedAt: Date.now(), filter, order });
  }, [entry, filter, order]);
  const status = STATUS[story.status];
  const displayTitle = uiLang === "en" ? (story.english?.title ?? englishText(story.englishTitle) ?? englishText(story.title) ?? "Event timeline") : story.title;
  const reportPath = (id: string) => uiLang === "en" ? `/en/items/${id}` : `/items/${id}`;
  // A settled story nobody watched (history pages) has no heat to explain or chart.
  const observed = story.status !== "settled" || story.heat.length > 0 || story.whyHot.participants48h > 0 || story.whyHot.rank !== null;
  const sectionKeys: SectionKey[] = observed ? ["overview", "reports", "heat"] : ["overview", "reports"];
  const [activeSection, goSection] = useActiveSection(sectionKeys);
  const counts = {
    all: story.timeline.length,
    official: story.timeline.filter((r) => r.source.firstParty).length,
    selected: story.timeline.filter((r) => r.selected).length,
  };
  const days = useMemo(() => {
    const list = story.timeline.filter((r) => (filter === "official" ? r.source.firstParty : filter === "selected" ? r.selected : true));
    const sorted = [...list].sort((a, b) => (order === "desc" ? Date.parse(b.publishedAt) - Date.parse(a.publishedAt) : Date.parse(a.publishedAt) - Date.parse(b.publishedAt)));
    const out: Array<{ day: string; rows: StoryReportView[] }> = [];
    for (const r of sorted) {
      const d = beijingDate(r.publishedAt);
      const last = out[out.length - 1];
      if (last && last.day === d) last.rows.push(r);
      else out.push({ day: d, rows: [r] });
    }
    return out;
  }, [story.timeline, filter, order]);
  const newest = story.latestReport;
  const latestText = uiLang === "en" ? (englishText(story.timeline.find((r) => r.id === newest?.id)?.english?.title) ?? englishText(story.latest)) : story.latest;
  const overview = uiLang === "en"
    ? story.english
      ? { label: "AI overview", text: story.english.digest, note: story.digestUpdatedAt ? `Written with AI from the reporting · updated ${new Date(story.digestUpdatedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}` : "Written with AI from the reporting" }
      : (englishText(story.digest) ?? englishText(story.summary) ?? englishText(story.excerpt?.text)
      ? { label: "Source summary", text: englishText(story.digest) ?? englishText(story.summary) ?? englishText(story.excerpt?.text) ?? "", note: null }
      : null)
    : story.digest
    ? { label: "AI 综述", text: story.digest, note: story.digestUpdatedAt ? `AI 根据报道生成 · ${relativeTime(story.digestUpdatedAt)}更新` : "AI 根据报道生成" }
    : story.summary
      ? { label: "事实说明", text: story.summary, note: null }
      : story.excerpt
        ? { label: "报道摘要", text: story.excerpt.text, note: `摘自 ${story.excerpt.sourceName}` }
        : null;


  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-10">
      <PhoneBar back={inNav("/hot") ? { to: "/hot", label: t("热点","Events") } : { to: "/", label: t("精选","Featured") }} title={displayTitle} />
      <nav aria-label={t("位置","Breadcrumb")} className="hidden items-center gap-2.5 pb-5 pt-4 text-[12px] text-ink-4 lg:flex">
        <Link to={inNav("/hot") ? "/hot" : "/"} className="inline-flex items-center gap-1.5 transition-colors hover:text-ink">
          <IconArrowLeft size={15} /> {inNav("/hot") ? t("热点榜","Events") : t("精选","Featured")}
        </Link>
        <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
        <span>{t("事件详情","Event detail")}</span>
      </nav>

      <header className="max-w-[960px] pt-3 lg:pt-0">
        <div className="flex items-center gap-2 text-[12px] text-ink-4">
          EVENT / {t("热点事件","TOPIC")}
          <Badge tone={status.tone}>{t(status.label, story.status === "active" ? "Active" : story.status === "watching" ? "Watching" : "Historical")}</Badge>
        </div>
        <h1 data-page-title="" className="mt-2.5 text-[27px] font-bold leading-[1.5] tracking-[-0.01em] text-ink lg:mt-3 lg:text-[36px] lg:font-[730]">{displayTitle}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <IconDoc size={15} className="text-ink-4" />
            <b className="num font-semibold text-ink">{story.reportCount}</b> {t("篇报道","reports")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconUsers size={15} className="text-ink-4" />
            <b className="num font-semibold text-ink">{story.sourceCount}</b> {t("个报道来源","sources")}
          </span>
          {story.latestAt && (
            <span className="inline-flex items-center gap-1.5" suppressHydrationWarning>
              <IconClock size={15} className="text-ink-4" />
              {uiLang === "en" ? `${new Date(story.latestAt).toLocaleDateString("en-US", {timeZone:"UTC"})} updated` : `${relativeTime(story.latestAt)}更新`}
            </span>
          )}
          {story.curatedAt && (
            <span className="inline-flex items-center gap-1.5">
              <IconDoc size={15} className="text-ink-4" />
              {t("编辑策展于", "Curated by the editor on")}
              <time dateTime={story.curatedAt} className="mono font-semibold text-ink">{story.curatedAt.slice(0, 10)}</time>
            </span>
          )}
        </div>
      </header>

      <div className="bleed sticky top-[var(--bar-h)] z-20 mt-5 bg-bg/90 py-2 backdrop-blur-md lg:mx-0 lg:px-0">
        <PillTabs
          size="sm"
          layoutId="story-sections"
          label={t("事件内容导航","Event sections")}
          active={activeSection}
          onSelect={(k) => goSection(k as SectionKey)}
          items={[
            { key: "overview", label: t("事件概览","Overview") },
            { key: "reports", label: t("报道时间线","Report timeline"), count: story.reportCount },
            ...(observed ? [{ key: "heat", label: t("热度走势","Activity") }] : []),
          ]}
        />
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* On phones the main column dissolves so the rail's cards can sit between its sections. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <Panel id={SECTIONS.overview} title={t("当前事件综述（非历史快照）","Current overview (not historical)")} right={overview?.label} className="order-1">
            {overview ? (
              <>
                <p className="whitespace-pre-line text-[15px] leading-[1.85] text-ink-2">{overview.text}</p>
                {overview.note && (
                  <p className="mt-2 text-[12px] text-ink-4" suppressHydrationWarning>
                    {overview.note}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[13.5px] text-ink-4">{t("还没有综述，先看下面的报道时间线。","No English summary yet; use the source timeline below.")}</p>
            )}
            {latestText && (
              <div className="-mx-5 mt-5 border-t border-line-soft px-5 pt-4 lg:-mx-6 lg:px-6">
                <div className="flex items-center gap-2.5 text-[12px]">
                  <span className="font-semibold text-ink">{t("最新进展","Latest development")}</span>
                  {story.latestAt && <span className="num text-ink-4">{when(story.latestAt)}</span>}
                </div>
                {newest ? (
                  <Link viewTransition to={reportPath(newest.id)} className="group mt-1.5 inline text-[14px] leading-[1.7] text-ink-2 transition-colors hover:text-accent">
                    {latestText}
                    <IconChevronRight size={14} className="ml-0.5 inline -translate-y-px text-ink-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <p className="mt-1.5 text-[14px] leading-[1.7] text-ink-2">{story.latest}</p>
                )}
              </div>
            )}
          </Panel>

          {story.timeline.length > 0 && (
            <div className="order-2 rounded-panel border border-line-soft bg-bg-sunk/30 px-4 py-3">
              <Link to={`${uiLang === "en" ? "/en" : ""}/explore?story=${encodeURIComponent(story.publicId)}`}
                className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent hover:underline">
                {t("深入探索：历史回放、关系与证据", "Explore the timeline, relations and evidence")} <IconChevronRight size={15} />
              </Link>
            </div>
          )}

          {route && (
            <details className="order-3 rounded-panel border border-line-soft bg-bg-sunk/20 p-3">
              <summary className="cursor-pointer px-2 py-1 text-[13.5px] font-medium text-ink">
                {t("逐项查看事实路线与来源依据", "Expand the detailed fact route and sources")}
              </summary>
              <div className="mt-3"><StoryRoutePanel route={route} storyPublicId={story.publicId}/></div>
            </details>
          )}
          <Panel
            id={SECTIONS.reports}
            title={t("报道时间线","Report timeline")}
            sub={t("沿着报道，了解事件的不同侧面。","Explore every side through dated source reports.")}
            className="order-4"
            right={
              <Select value={order} onChange={(e) => setOrder(e.target.value as "desc" | "asc")} aria-label={t("报道时间线排序","Sort reports")}>
                <option value="desc">{t("最新在前","Newest first")}</option>
                <option value="asc">{t("最早在前","Oldest first")}</option>
              </Select>
            }
          >
            <PillTabs
              size="xs"
              layoutId="story-report-filter"
              label={t("报道筛选","Filter reports")}
              active={filter}
              onSelect={(k) => setFilter(k as Filter)}
              items={[
                { key: "all", label: t("全部报道","All reports"), count: counts.all },
                { key: "official", label: t("官方一手","First-party"), count: counts.official },
                { key: "selected", label: t("精选报道","Selected"), count: counts.selected },
              ]}
            />
            {days.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-ink-4">{t("这个筛选下没有报道。","No reports match this filter.")}</p>
            ) : (
              days.map(({ day, rows }) => (
                <div key={day}>
                  <div className="pb-0.5 pt-5 text-[14px] font-semibold text-ink">{localizedMonthDay(day, uiLang)}</div>
                  <ol>
                    {rows.map((r) => (
                      <TimelineRow key={r.id} r={r} />
                    ))}
                  </ol>
                </div>
              ))
            )}
            {story.reportCount > story.timeline.length && (
              <p className="pt-3 text-center text-[12px] text-ink-4">
                {t(`显示最近 ${story.timeline.length} 篇，共 ${story.reportCount} 篇报道。`, `Showing ${story.timeline.length} of ${story.reportCount} reports.`)}
              </p>
            )}
          </Panel>

          {observed && (
            <Panel id={SECTIONS.heat} title={t("本事件热度走势","Event activity trend")} className="order-5">
              <HeatChart points={story.heat} />
            </Panel>
          )}

          {story.related.length > 0 && (
            <Panel title={t("关联事件","Related events")} className="order-6">
              <ul className="-my-1 divide-y divide-line-soft">
                {story.related.map((r) => (
                  <li key={r.publicId}>
                    <Link viewTransition to={`/story/${r.publicId}`} className="group flex items-baseline gap-3 py-3">
                      <span className="shrink-0 text-[12px] text-ink-4">{r.relation === "storyline" ? t("同一故事线","Same storyline") : t("相关事件","Related event")}</span>
                      <span className="min-w-0 flex-1 text-[14.5px] font-medium text-ink-2 transition-colors group-hover:text-accent">{uiLang === "en" ? (englishText(r.title) ?? "Related event") : r.title}</span>
                      <IconChevronRight size={14} className="shrink-0 self-center text-ink-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="order-6 flex min-w-0 flex-col gap-4 lg:order-none lg:gap-5">
          <EventPrices market={market} />
          {observed && (
            <RailCard title={t("为什么热","Why trending")}>
              <p className="text-[12.5px] leading-[1.75] text-ink-3">
                {t("过去 48 小时，观察到", "Past 48 hours:")} <b className="num font-semibold text-ink">{story.whyHot.participants48h}</b> {t("个独立主体参与讨论或报道，最近 6 小时新增","participants; past 6 hours:")}{" "}
                <b className="num font-semibold text-ink">{story.whyHot.newParticipants6h}</b> {t("个。","new participants.")}
              </p>
              {!story.whyHot.observationComplete && <p className="mt-2 text-[12px] leading-relaxed text-ink-4">{t("部分信源观测不完整，以上仅为已观察到的参与。","Some source observations are incomplete.")}</p>}
              <p className="mt-2 text-[12px] text-ink-4">
                <span className="num">{story.whyHot.recentReports24h}</span> {t("篇近期报道","recent reports")}
                {story.whyHot.rank && inNav("/hot") && (
                  <>
                    <span className="mx-1">·</span>
                    <Link to="/hot" className="text-accent hover:underline">
                      {t("热点榜第","Rank")} {story.whyHot.rank} {t("名","in ranking")}
                    </Link>
                  </>
                )}
              </p>
            </RailCard>
          )}
          {story.topics.length > 0 && (
            <RailCard title={t("相关主题","Related topics")}>
              <div className="flex flex-wrap gap-1.5">
                {story.topics.filter(topic => uiLang === "zh" || !!enTopicName(topic)).map((topic) => (
                  <Link viewTransition key={topic.slug} to={`${uiLang === "en" ? "/en" : ""}/topics/${topic.slug}`} className="chip">
                    {uiLang === "en" ? enTopicName(topic) : topic.name}
                  </Link>
                ))}
              </div>
            </RailCard>
          )}
          <RailCard title={t("事件记录","Event record")} className="hidden lg:block">
            <dl className="space-y-2 text-[12.5px]">
              {story.firstReportAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-4">{t("最早报道","First report")}</dt>
                  <dd className="num text-ink-2">
                    <time dateTime={story.firstReportAt}>{when(story.firstReportAt)}</time>
                  </dd>
                </div>
              )}
              {story.latestAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-4">{t("最近更新","Last updated")}</dt>
                  <dd className="num text-ink-2">
                    <time dateTime={story.latestAt}>{when(story.latestAt)}</time>
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-3 border-t border-line-soft pt-3 text-[12px] leading-relaxed text-ink-4">{t("同一事件的报道集中在这里，新的进展会继续补充。","All reports on this event are grouped here as evidence arrives.")}</p>
          </RailCard>
        </aside>
      </div>
    </div>
  );
}
