import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { StoryDetail } from "@aihot/contracts/site";
import { KnowledgeExplorer, type KnowledgeGraph } from "../../components/KnowledgeNetwork";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { englishText } from "../../components/EnglishStory";
import { EventTimeMachine } from "./EventTimeMachine";
import { buildReplayFrames } from "./replay";

/** The selected cutoff drives the source list and graph query; current graph data never substitutes for history. */
export function EventExplorer({ story }: { story: StoryDetail }) {
  const t = useText(), lang = useUiLanguage();
  const [clock, setClock] = useState<"known" | "valid">("known");
  // Open at the most recent known point; a reader can then rewind the event.
  const [position, setPosition] = useState(() => Math.max(0, buildReplayFrames(story.timeline, "known").length - 1));
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
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!asOf) { setGraph(null); setLoading(false); return; }
    const ctrl = new AbortController();
    setGraph(null); setLoading(true);
    const params = new URLSearchParams({asOf, clock});
    fetch("/api/site/knowledge/stories/" + encodeURIComponent(story.publicId) + "?" + params.toString(), {signal:ctrl.signal})
      .then(r => {if (!r.ok) throw Error("historical graph unavailable"); return r.json() as Promise<KnowledgeGraph>;})
      .then(g => {if (!ctrl.signal.aborted) setGraph(g.status==="unavailable" || g.status==="disabled"?null:g);})
      .catch(() => {if (!ctrl.signal.aborted) setGraph(null);})
      .finally(() => {if (!ctrl.signal.aborted) setLoading(false);});
    return () => ctrl.abort();
  }, [asOf, clock, story.publicId]);
  const reports = useMemo(() => story.timeline.filter(r => {
    const at = clock === "known" ? r.discoveredAt : r.publishedAt;
    return !!at && !!asOf && Number.isFinite(Date.parse(at)) && Date.parse(at) <= Date.parse(asOf);
  }), [story.timeline, clock, asOf]);
  const reportTitle = (r: StoryDetail["timeline"][number]) => lang === "zh" ? r.title :
    englishText(r.english?.title) ?? englishText(r.originalTitle) ?? englishText(r.title) ?? "Original source";
  const tabButton = (v:"time"|"graph"|"evidence", label:string) =>
    <button role="tab" type="button" aria-selected={tab===v} onClick={()=>setTab(v)}
      className={tab===v?"rounded-lg bg-accent px-3 py-2 text-sm text-white":"rounded-lg border border-line px-3 py-2 text-sm"}>{label}</button>;
  return <section className="space-y-4" aria-label={t("事件探索工作台","Event Explorer")}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-3">
      <strong className="text-sm">EVENTGRAPH EXPLORER</strong>
      <div className="flex gap-2">
        <button type="button" aria-pressed={clock==="known"} onClick={()=>chooseClock("known")}
          className={clock==="known"?"rounded-lg bg-accent px-3 py-2 text-xs text-white":"rounded-lg border border-line px-3 py-2 text-xs"}>{t("按收录时间重建","Recorded-time reconstruction")}</button>
        <button type="button" aria-pressed={clock==="valid"} onClick={()=>chooseClock("valid")}
          className={clock==="valid"?"rounded-lg bg-accent px-3 py-2 text-xs text-white":"rounded-lg border border-line px-3 py-2 text-xs"}>{t("事实生效时间","Valid time")}</button>
      </div>
    </div>
    <div className="flex gap-2 lg:hidden" role="tablist" aria-label={t("探索视图","Explorer views")}>
      {tabButton("time",t("时间","Timeline"))}{tabButton("graph",t("关系","Relations"))}{tabButton("evidence",t("来源","Sources"))}
    </div>
    <div className={tab==="time"?"":"hidden lg:block"}>
      <EventTimeMachine reports={story.timeline} totalReports={story.reportCount}
        clock={clock==="known"?"known":"published"} position={step} onPosition={setPosition}/>
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <div className={tab==="graph"?"min-w-0":"hidden min-w-0 lg:block"}>
        <h3 className="mb-2 text-sm font-semibold">{t("此时的实体关系","Relations at this time")}</h3>
        {loading ? <p role="status" className="rounded-panel border border-line-soft p-5 text-sm text-ink-4">{t("正在读取历史关系…","Loading time-scoped relations…")}</p>
          :graph ? <KnowledgeExplorer key={clock+":"+asOf} graph={graph} compact/>
          :<p role="status" className="rounded-panel border border-line-soft p-5 text-sm text-ink-4">{t("历史关系无法验证，不以当前图谱替代。","Historical graph unavailable; no present-day graph substituted.")}</p>}
      </div>
      <aside className={tab==="evidence"?"min-w-0":"hidden min-w-0 lg:block"}>
        <h3 className="mb-2 text-sm font-semibold">{t("当时可用的报道来源","Sources at this time")} · {reports.length}</h3>
        <ol className="max-h-[620px] divide-y divide-line-soft overflow-auto rounded-panel border border-line-soft px-3">
          {reports.map(r => <li key={r.id} className="py-3">
            <p className="text-xs text-ink-4">{r.source.name} · {new Date(clock==="known"?r.discoveredAt!:r.publishedAt).toLocaleString(lang==="zh"?"zh-CN":"en-US",{timeZone:"Asia/Shanghai"})}</p>
            <Link to={lang==="en"?"/en/items/"+r.id:"/items/"+r.id} className="mt-1 block text-sm font-medium hover:text-accent">{reportTitle(r)}</Link>
            {r.originalUrl && /^https?:\/\//i.test(r.originalUrl) && <a href={r.originalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-accent">{t("核查原文 ↗","Original source ↗")}</a>}
          </li>)}
        </ol>
        {story.reportCount>story.timeline.length && <p className="mt-2 text-xs text-ink-4">{t("只回放已加载报道；早期资料可能遗漏。","Only loaded reports; early history may be missing.")}</p>}
      </aside>
    </div>
    <p className="text-xs leading-relaxed text-ink-4">
      {clock==="known" ? t("历史重建（非精确快照）：按首次收录与关系记录时间筛选；实体名、关系陈述和事件归组可能已经被后来修订，不能将其当作当时原始记录。","Bounded reconstruction, not an exact snapshot: entity names, relationship text and story grouping may include later revisions.")
        : t("有效时间：事后时间视角，不等同当时已知。","Valid time is retrospective, not necessarily known then.")}
      {t(" 下方综述与历史索引仍属于当前视角。"," Overview and full archive below remain current.")}
    </p>
  </section>;
}
