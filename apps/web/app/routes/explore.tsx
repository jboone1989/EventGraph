import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/explore";
import type { ExploreGalleryResponse, HotResponse, StoryDetail } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { localized, pageMeta } from "../lib/seo";
import { localizedRelativeTime } from "../lib/format";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import { EmptyState } from "../components/ui/Page";
import { IconArrowRight, IconSearch } from "../components/icons";
import { useText, useUiLanguage } from "../components/LanguageSwitch";
import { EventExplorer } from "../features/story/EventExplorer";
import { explorerTimeState, type ExplorerTimeState } from "../features/story/explore-state";
import { KnowledgeAtlas } from "../components/KnowledgeAtlas";
import type { AtlasNode } from "../lib/knowledge-atlas";

// The standalone event explorer workbench: one shared time state over the story page's
// EventExplorer, entered from the sidebar, the story page and /knowledge. The landing
// reuses the site's own event board and entity search; no new search service here.
export const handle: Screen = { home: "knowledge", name: "探索工作台" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const storyId = url.searchParams.get("story")?.trim().slice(0, 100) || null;
  if (storyId) {
    const prefix = url.pathname.startsWith("/en") ? "/en" : "";
    const story = await loadOr404<StoryDetail>(`/api/site/stories/${encodeURIComponent(storyId)}`,
      { signal: request.signal, merged: (mergedId) => `${prefix}/explore?story=${mergedId}` });
    return cachedPage(30, { story, hot: null, gallery: null });
  }
  const [hot, gallery] = await Promise.all([
    apiGet<HotResponse>("/api/site/hot", { signal: request.signal, timeoutMs: 4_000 }).catch(() => null),
    apiGet<ExploreGalleryResponse>("/api/site/explore/gallery", { signal: request.signal, timeoutMs: 4_000 }).catch(() => null),
  ]);
  return cachedPage(60, { story: null, hot, gallery });
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const story = loaderData?.story;
  return localized(pageMeta({
    title: story ? `${story.title} · 探索工作台` : "探索工作台",
    description: `在 ${SITE.name} 的事件探索工作台里回到任意时点，联动查看当时的报道、实体关系与可核查的证据来源。`,
    path: location.pathname,
    noindex: !!story,
  }), location.pathname, {
    title: story ? `${story.title} · Event explorer` : "Event explorer",
    description: "Replay a public event's reports, relations and evidence at any point in time, from the same records the site publishes.",
  });
}

function EntitySearch({ prefix }: { prefix: string }) {
  const t = useText();
  const [query, setQuery] = useState("");
  const [centers, setCenters] = useState<AtlasNode[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/site/knowledge/centers?q=" + encodeURIComponent(query.trim()), { signal: controller.signal })
        .then((r) => { if (!r.ok) throw Error("search failed"); return r.json() as Promise<{ nodes: AtlasNode[] }>; })
        .then((v) => setCenters(v.nodes ?? []))
        .catch(() => { if (!controller.signal.aborted) setCenters([]); });
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <section className="mt-8">
    <h2 className="text-[18px] font-semibold text-ink">{t("按实体寻找线索","Follow an entity")}</h2>
    <p className="mt-1 text-[13px] text-ink-4">{t("搜索已公开出现的公司、人物或技术，在工作台里按任意时点探索它们的关系。","Search companies, people or technologies that appeared in public reporting, and explore their relations at any point in time.")}</p>
    <label className="mt-3 flex max-w-[420px] items-center gap-2 rounded-control border border-line bg-bg-sunk/40 px-3 py-2 text-[14px]">
      <IconSearch size={16} className="shrink-0 text-ink-4" />
      <span className="sr-only">{t("搜索实体","Search entities")}</span>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("搜索实体名称…","Search entity names…")}
        className="min-w-0 flex-1 bg-transparent outline-none" />
    </label>
    {centers.length > 0 && <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {centers.slice(0, 8).map((node) => (
        <li key={node.key}>
          <Link to={`${prefix}/explore?entity=${encodeURIComponent(node.key)}`}
            className="flex min-h-[44px] items-center justify-between gap-2 rounded-control border border-line-soft px-3 text-[14px] font-medium text-ink hover:border-accent hover:text-accent">
            <span className="truncate">{node.name}</span>
            <span className="shrink-0 text-[12px] text-ink-4">{node.degree} {t("条关系","relations")}</span>
          </Link>
        </li>
      ))}
    </ul>}
  </section>;
}

// Entity mode shares the workbench's clock/as-of URL state: the same time semantics as the
// story view, applied to one entity's public relations.
function toLocalInput(iso: string | null) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function EntityTimeBar({ clock, asOf, onTime }: {
  clock: "known" | "valid";
  asOf: string | null;
  onTime: (next: { clock: "known" | "valid"; asOf: string | null }) => void;
}) {
  const t = useText();
  const [draft, setDraft] = useState(() => toLocalInput(asOf));
  useEffect(() => { setDraft(toLocalInput(asOf)); }, [asOf]);
  return <div className="mb-4 flex flex-wrap items-center gap-2">
    <button type="button" aria-pressed={clock === "known"} onClick={() => onTime({ clock: "known", asOf })}
      className={clock === "known" ? "rounded-lg bg-accent px-3 py-2 text-xs text-white" : "rounded-lg border border-line px-3 py-2 text-xs"}>
      {t("按收录时间重建","Recorded-time reconstruction")}
    </button>
    <button type="button" aria-pressed={clock === "valid"} onClick={() => onTime({ clock: "valid", asOf })}
      className={clock === "valid" ? "rounded-lg bg-accent px-3 py-2 text-xs text-white" : "rounded-lg border border-line px-3 py-2 text-xs"}>
      {t("事实生效时间","Valid time")}
    </button>
    <input type="datetime-local" aria-label={t("截至时点","As-of time")} value={draft}
      onChange={(e) => { setDraft(e.target.value); const d = new Date(e.target.value);
        if (Number.isFinite(d.getTime())) onTime({ clock, asOf: d.toISOString() }); }}
      className="rounded-lg border border-line px-3 py-2 text-xs" />
    {asOf && <button type="button" onClick={() => onTime({ clock, asOf: null })}
      className="rounded-lg border border-line px-3 py-2 text-xs">{t("回到最新","Back to latest")}</button>}
  </div>;
}

export default function ExplorePage() {
  const { story, hot, gallery } = useLoaderData<typeof loader>();
  const t = useText();
  const lang = useUiLanguage();
  const prefix = lang === "en" ? "/en" : "";
  const [params] = useSearchParams();
  // Seed the time state from the deep link once per mounted event; later time changes flow
  // back through syncTime (replaceState) and must not re-seed from the URL.
  const initialTime = useMemo(() => (story ? explorerTimeState(params, story.timeline) : null),
    [story?.publicId]);
  // EventExplorer reports its state on mount too, so the first report is not a reader move;
  // the reset effect clears it again when another event is mounted.
  const [moved, setMoved] = useState(false);
  useEffect(() => { setMoved(false); }, [story?.publicId]);
  const syncTime = useCallback((time: ExplorerTimeState) => {
    setMoved(true);
    const url = new URL(window.location.href);
    url.searchParams.set("clock", time.clock);
    if (time.asOf) url.searchParams.set("asOf", time.asOf); else url.searchParams.delete("asOf");
    window.history.replaceState(null, "", url);
  }, []);
  // Entity mode: seeded from the deep-link params; the atlas then owns the ?entity= URL as the
  // reader explores (pushState bypasses React Router, so these stay the seed).
  const entityParam = params.get("entity")?.trim().slice(0, 180) || null;
  const [entityTime, setEntityTime] = useState<{ clock: "known" | "valid"; asOf: string | null }>(() => ({
    clock: params.get("clock") === "valid" ? "valid" : "known",
    asOf: params.get("asOf"),
  }));
  const syncEntityTime = useCallback((next: { clock: "known" | "valid"; asOf: string | null }) => {
    setEntityTime(next);
    const url = new URL(window.location.href);
    url.searchParams.set("clock", next.clock);
    if (next.asOf) url.searchParams.set("asOf", next.asOf); else url.searchParams.delete("asOf");
    window.history.replaceState(null, "", url);
  }, []);
  if (entityParam && !story) {
    const time = entityTime.asOf && Number.isFinite(Date.parse(entityTime.asOf))
      ? { asOf: entityTime.asOf, clock: entityTime.clock } : null;
    return <div className="pb-8">
      <PhoneBar title={t("探索工作台","Event explorer")} />
      <EntityTimeBar clock={entityTime.clock} asOf={entityTime.asOf} onTime={syncEntityTime} />
      <KnowledgeAtlas initialKey={entityParam} time={time} />
      <p className="mt-3 text-xs leading-relaxed text-ink-4">
        {entityTime.clock === "known"
          ? t("实体关系按本站首次收录时间读取有界历史；早于收录时点的关系不显示。切换时点会重新开始探索。","Entity relations replay a bounded history by first discovery; relations recorded after the cutoff are left out. Changing the cutoff restarts the exploration.")
          : t("实体关系按事实生效/失效时间读取有界历史；这是回顾视角，不等同当时已知。","Entity relations replay a bounded history by fact validity intervals; this is retrospective, not what was known then.")}
      </p>
    </div>;
  }
  if (story) return <div className="pb-8">
    <PhoneBar title={t("探索工作台","Event explorer")} />
    {initialTime?.clamped && !moved && <p className="mb-3 rounded-panel border border-line-soft bg-bg-sunk/40 px-4 py-3 text-[13px] leading-[1.7] text-ink-3">
      {t("无法恢复此前资料：请求的时点早于本事件最早的记录，已显示最早的可用时点。",
        "Earlier material cannot be restored: the requested time predates this event's earliest record, so the earliest available point is shown.")}
    </p>}
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h1 className="text-[22px] font-semibold leading-[1.3] text-ink">{story.title}</h1>
      <Link to={prefix === "/en" ? `/en/story/${story.publicId}` : `/story/${story.publicId}`} className="text-[13px] text-accent hover:underline">
        {t("打开事件页 ↗","Open the event page ↗")}
      </Link>
    </div>
    <EventExplorer key={story.publicId} story={story} initialTime={initialTime ?? undefined} onTimeState={syncTime} standalone />
  </div>;
  const entries = hot?.entries ?? [];
  return <div className="pb-8">
    <PhoneBar title={t("探索工作台","Event explorer")} />
    <header className="mb-6">
      <h1 data-page-title className="text-[24px] font-semibold leading-[1.3] text-ink">{t("探索工作台","Event explorer")}</h1>
      <p className="mt-2 max-w-[680px] text-[14px] leading-[1.8] text-ink-3">
        {t("选择一个公开事件，回到任意时点：当时的报道、实体关系和证据来源在同一个时间状态下联动。",
          "Pick a public event and rewind it: reports, entity relations and their sources move together under one time state.")}
      </p>
    </header>
    <section>
      <h2 className="text-[18px] font-semibold text-ink">{t("当前热点事件","Hot events")}</h2>
      {entries.length ? <ul className="mt-3 grid gap-3 lg:grid-cols-2">
        {entries.map((entry) => (
          <li key={entry.story.publicId}>
            <Link to={`${prefix}/explore?story=${entry.story.publicId}`}
              className="flex min-h-[52px] flex-col gap-1 rounded-panel border border-line-soft p-4 hover:border-accent">
              <span className="text-[15px] font-semibold text-ink">
                {lang === "en" ? entry.english?.title ?? entry.englishTitle ?? entry.story.title : entry.story.title}
              </span>
              {entry.summary && <span className="line-clamp-2 text-[13px] leading-[1.7] text-ink-3">{entry.summary}</span>}
              <span className="text-[12px] text-ink-4">
                {t(`${entry.sourceCount} 个来源 · ${entry.participantCount} 个参与者`,`${entry.sourceCount} sources · ${entry.participantCount} participants`)}
              </span>
            </Link>
          </li>
        ))}
      </ul> : <div className="mt-3 rounded-panel border border-line-soft p-5">
        <EmptyState title={t("暂时没有可回放的热点事件","No hot events to replay right now")}>
          {t("事件脉络里有完整的事件列表。","The event tree lists every public event.")}
        </EmptyState>
      </div>}
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-4">
        <Link to={`${prefix}/hot`} className="inline-flex items-center gap-1 text-accent hover:underline">
          {t("全部事件","All events")} <IconArrowRight size={14} />
        </Link>
        <span>{t("时间回放说明：收录时间与事实生效时间的口径见事件页。","Both clocks are explained on each event page.")}</span>
      </p>
    </section>
    <EntitySearch prefix={prefix} />
    {gallery?.cards?.length ? <section className="mt-8">
      <h2 className="text-[18px] font-semibold text-ink">{t("按主题探索","Explore by topic")}</h2>
      <p className="mt-1 text-[13px] text-ink-4">
        {t("各主题下最近的公开事件，点开任意一张卡就进入它的时间回放。","Recent public events under each topic; any card opens that event's time replay.")}
      </p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {gallery.cards.map((card) => (
          <li key={card.story.publicId}>
            <Link to={`${prefix}/explore?story=${card.story.publicId}`}
              className="flex h-full flex-col overflow-hidden rounded-panel border border-line-soft hover:border-accent">
              {card.cover && <img src={card.cover.url} srcSet={card.cover.srcSet}
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, calc(100vw - 74px)"
                width={card.cover.width ?? undefined} height={card.cover.height ?? undefined}
                alt="" loading="lazy" decoding="async" className="aspect-[2/1] w-full object-cover" />}
              <span className="flex flex-1 flex-col gap-1 p-4">
                <span className="text-[12px] font-medium text-accent">{card.topic.name}</span>
                <span className="text-[15px] font-semibold leading-snug text-ink">
                  {lang === "en" ? card.englishTitle ?? card.story.title : card.story.title}
                </span>
                {card.summary && <span className="line-clamp-2 text-[13px] leading-[1.7] text-ink-3">{card.summary}</span>}
                <span className="mt-auto pt-1 text-[12px] text-ink-4">
                  {t(`${card.stageCount} 个阶段 · ${card.sourceCount} 个来源`,
                    `${card.stageCount} stages · ${card.sourceCount} sources`)}
                  {" · "}{localizedRelativeTime(card.latestAt, lang)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section> : null}
  </div>;
}
