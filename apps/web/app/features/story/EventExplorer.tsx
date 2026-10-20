import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { StoryDetail } from "@aihot/contracts/site";
import type { KnowledgeGraph } from "../../components/KnowledgeNetwork";
import { TemporalKnowledgeAtlas } from "./TemporalKnowledgeAtlas";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { englishText } from "../../components/EnglishStory";
import { EventTimeMachine } from "./EventTimeMachine";
import { buildReplayFrames, developmentsAt } from "./replay";
import type { ExplorerClock, ExplorerTimeState } from "./explore-state";

/** The selected cutoff drives the source list, event progress and graph query. The standalone
 *  /explore page seeds and mirrors the time state through initialTime/onTimeState (deep links). */
export function EventExplorer({ story, initialTime, onTimeState }: {
  story: StoryDetail;
  initialTime?: { clock: ExplorerClock; position: number };
  onTimeState?: (time: ExplorerTimeState) => void;
}) {
  const t = useText(), lang = useUiLanguage();
  const [clock, setClock] = useState<"known" | "valid">(initialTime?.clock ?? "known");
  // Open at the most recent known point; a reader can then rewind the event.
  const [position, setPosition] = useState(() => initialTime?.position ?? Math.max(0, buildReplayFrames(story.timeline, "known").length - 1));
  const [tab, setTab] = useState<"time" | "graph" | "evidence">("time");
  const frames = useMemo(() => buildReplayFrames(story.timeline, clock === "known" ? "known" : "published"), [story.timeline, clock]);
  const step = Math.min(position, Math.max(0, frames.length - 1));
  const asOf = frames[step]?.publishedAt;
  const chooseClock = (next: "known" | "valid") => {
    // Preserve the selected historical neighborhood when changing time semantics.
    const nextFrames = buildReplayFrames(story.timeline, next === "known" ? "known" : "published");
    const cutoff = asOf ? Date.parse(asOf) : Date.now();
    const target = nextFrames.findLastIndex(frame => Date.parse(frame.publishedAt) <= cutoff);
    setClock(next);
    setPosition(Math.max(0, target));
  };
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const scope = clock+":"+(asOf??"none");
  const [graphScope,setGraphScope] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!asOf) { setGraph(null); setGraphScope(scope); setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({asOf, clock});
    fetch("/api/site/knowledge/stories/" + encodeURIComponent(story.publicId) + "?" + params.toString(), {signal:ctrl.signal})
      .then(r => {if (!r.ok) throw Error("historical graph unavailable"); return r.json() as Promise<KnowledgeGraph>;})
      .then(g => {if (!ctrl.signal.aborted) {setGraph(g.status==="unavailable" || g.status==="disabled"?null:g);setGraphScope(scope);}})
      .catch(() => {if (!ctrl.signal.aborted) {setGraph(null);setGraphScope(scope);}})
      .finally(() => {if (!ctrl.signal.aborted) setLoading(false);});
    return () => ctrl.abort();
  }, [asOf, clock, story.publicId, scope]);
  const reports = useMemo(() => story.timeline.filter(r => {
    const at = clock === "known" ? r.discoveredAt : r.publishedAt;
    return !!at && !!asOf && Number.isFinite(Date.parse(at)) && Date.parse(at) <= Date.parse(asOf);
  }), [story.timeline, clock, asOf]);
  useEffect(() => {
    if (onTimeState) onTimeState({ clock, position: step, asOf: asOf ?? null });
  }, [onTimeState, clock, step, asOf]);
  const developments = useMemo(() => developmentsAt(story.developments, asOf, clock), [story.developments, asOf, clock]);
  const reportTitle = (r: StoryDetail["timeline"][number]) => lang === "zh" ? r.title :
    englishText(r.english?.title) ?? englishText(r.originalTitle) ?? englishText(r.title) ?? "Original source";
  const formatTime = (value: string) => new Date(value).toLocaleString(lang==="zh"?"zh-CN":"en-US",{timeZone:"Asia/Shanghai"});
  const tabButton = (v:"time"|"graph"|"evidence", label:string) =>
    <button role="tab" type="button" aria-selected={tab===v} onClick={()=>setTab(v)}
      className={tab===v?"rounded-lg bg-accent px-3 py-2 text-sm text-white":"rounded-lg border border-line px-3 py-2 text-sm"}>{label}</button>;
  const explorerHref = (lang === "en" ? "/en" : "") + "/explore?story=" + encodeURIComponent(story.publicId) +
    (asOf ? `&clock=${clock}&asOf=${encodeURIComponent(asOf)}` : "");
  return <section className="space-y-4" aria-label={t("事件探索工作台","Event Explorer")}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-3">
      <strong className="text-sm">EVENTGRAPH EXPLORER</strong>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={clock==="known"} onClick={()=>chooseClock("known")}
          className={clock==="known"?"rounded-lg bg-accent px-3 py-2 text-xs text-white":"rounded-lg border border-line px-3 py-2 text-xs"}>{t("按收录时间重建","Recorded-time reconstruction")}</button>
        <button type="button" aria-pressed={clock==="valid"} onClick={()=>chooseClock("valid")}
          className={clock==="valid"?"rounded-lg bg-accent px-3 py-2 text-xs text-white":"rounded-lg border border-line px-3 py-2 text-xs"}>{t("事实生效时间","Valid time")}</button>
        <a href={explorerHref} className="ml-1 inline-flex items-center text-xs font-medium text-accent hover:underline">
          {t("在独立工作台打开 ↗","Open in the standalone explorer ↗")}
        </a>
      </div>
    </div>
    <div className="flex gap-2 lg:hidden" role="tablist" aria-label={t("探索视图","Explorer views")}>
      {tabButton("time",t("时间","Timeline"))}{tabButton("graph",t("关系","Relations"))}{tabButton("evidence",t("来源","Sources"))}
    </div>
    <div className={tab==="time"?"space-y-4":"hidden space-y-4 lg:block"}>
      <EventTimeMachine reports={story.timeline} totalReports={story.reportCount}
        clock={clock==="known"?"known":"published"} position={step} onPosition={setPosition}/>
      <section className="rounded-panel border border-line-soft p-4" aria-label={t("按时点筛选的事件进展","Event developments at selected time")}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">{t("事件进展","Event developments")}</h3>
          <span data-testid="event-development-count" data-count={developments.length} className="text-xs text-ink-4">{developments.length} {t("条进展","developments")}</span>
        </div>
        {developments.length > 0 ? <ol className="mt-3 space-y-3">
          {developments.map(d => {
            const timestamp = clock === "known" ? d.representative.discoveredAt! : d.representative.publishedAt;
            return <li key={d.factId} className="border-l-2 border-line pl-3">
              <p className="text-xs text-ink-4">{formatTime(timestamp)}</p>
              <Link to={lang==="en"?"/en/items/"+d.representative.id:"/items/"+d.representative.id} className="mt-1 block text-sm font-medium hover:text-accent">
                {reportTitle(d.representative)}
              </Link>
              <p className="mt-1 text-xs text-ink-4">{d.representative.source.name}</p>
            </li>;
          })}
        </ol> : <p className="mt-3 text-sm text-ink-4">{t("这个时点没有带有可核验时间戳的进展记录。","No timestamped developments are available at this cutoff.")}</p>}
        <p className="mt-3 text-xs text-ink-4">
          {clock === "known"
            ? t("按本站首次收录时间筛选；只显示代表报道在此时点前已收录的进展。当前事件归组可能后来修订，不是完整历史快照。","Filtered by first discovery; only representative reports already discovered by this cutoff are shown. Story grouping may have changed later, so this is not a complete historical snapshot.")
            : t("按最早报道发布时间筛选；列表时间显示代表报道自己的发布时间。当前事件归组可能后来修订，不是完整历史快照。","Filtered by first report publication; the displayed time is the representative report's own publication time. Story grouping may have changed later, so this is not a complete historical snapshot.")}
        </p>
      </section>
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <div className={tab==="graph"?"min-w-0":"hidden min-w-0 lg:block"}>
        <h3 className="mb-2 text-sm font-semibold">{t("此时的实体关系","Relations at this time")}</h3>
        {(loading||graphScope!==scope) && <p role="status" className="rounded-panel border border-line-soft p-5 text-sm text-ink-4">{t("正在读取历史关系…","Loading time-scoped relations…")}</p>}
        {graph && <div aria-hidden={graphScope!==scope||loading}
          className={graphScope===scope&&!loading?"":"invisible h-0 overflow-hidden"}>
          <TemporalKnowledgeAtlas graph={graph}/>
        </div>}
        {!loading && graphScope===scope && !graph && <p role="status" className="rounded-panel border border-line-soft p-5 text-sm text-ink-4">
          {t("历史关系无法验证，不以当前图谱替代。","Historical graph unavailable; no present-day graph substituted.")}</p>}
      </div>
      <aside aria-label={clock==="known" ? t("当时可用的报道来源","Reports available by this time") : t("该时点之前发布的报道来源","Reports published by this time")} className={tab==="evidence"?"min-w-0":"hidden min-w-0 lg:block"}>
        <h3 className="mb-2 text-sm font-semibold">{clock==="known" ? t("当时可用的报道来源","Reports available by this time") : t("该时点之前发布的报道来源","Reports published by this time")} · {reports.length}</h3>
        <ol className="max-h-[620px] divide-y divide-line-soft overflow-auto rounded-panel border border-line-soft px-3">
          {reports.map(r => <li key={r.id} className="py-3">
            <p className="text-xs text-ink-4">{r.source.name} · {t("发布","Published")} {formatTime(r.publishedAt)} · {r.discoveredAt ? t("收录","First seen") + " " + formatTime(r.discoveredAt) : t("收录时间未知","First-seen time unavailable")}</p>
            <Link to={lang==="en"?"/en/items/"+r.id:"/items/"+r.id} className="mt-1 block text-sm font-medium hover:text-accent">{reportTitle(r)}</Link>
            {r.originalUrl && /^https?:\/\//i.test(r.originalUrl) && <a href={r.originalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-accent">{t("核查原文 ↗","Check original source ↗")}</a>}
          </li>)}
        </ol>
        {story.reportCount>story.timeline.length && <p className="mt-2 text-xs text-ink-4">{t("只回放已加载报道；早期资料可能遗漏。","Only loaded reports; early history may be missing.")}</p>}
      </aside>
    </div>
    <p className="text-xs leading-relaxed text-ink-4">
      {clock==="known" ? t("历史重建（非精确快照）：按首次收录与关系记录时间筛选；实体名、关系陈述和事件归组可能已经被后来修订，不能将其当作当时原始记录。","Bounded reconstruction, not an exact snapshot: entity names, relationship text and story grouping may include later revisions.")
        : t("有效时间：关系按 Graphiti 的事实生效/失效时间查询；报道列表仍按报道发布时间截断。这是回顾视角，不等同当时已知。","Valid time queries Graphiti's fact validity intervals; the source list is still limited by publication time. This is retrospective, not what was known then.")}
      {t(" 下方综述与完整来源索引仍属于当前视角。"," Overview and full source archive below remain current.")}
    </p>
  </section>;
}
