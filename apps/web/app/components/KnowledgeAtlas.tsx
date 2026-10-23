import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { KnowledgeAtlasCanvas } from "./KnowledgeAtlasCanvas";
import { RelationEvidence, type KnowledgeEdge } from "./KnowledgeNetwork";
import { useText } from "./LanguageSwitch";
import { IconSearch } from "./icons";
import { groupAtlasPairs, uniqueAtlasFacts, mergeAtlasNetworks, type AtlasNetwork, type AtlasNode } from "../lib/knowledge-atlas";
import { trackAnalytics } from "../lib/analytics.client";

const empty: AtlasNetwork = { nodes: [], links: [], truncated: false };
export interface AtlasTime { asOf: string; clock: "known" | "valid" }
export function KnowledgeAtlas({ initialKey = null, time = null }: { initialKey?: string | null; time?: AtlasTime | null }) {
  const t = useText();
  const [selected, setSelected] = useState<string | null>(initialKey);
  const [hasNetwork, setHasNetwork] = useState(false);
  const [query, setQuery] = useState("");
  const [centers, setCenters] = useState<AtlasNode[]>([]);
  const [network, setNetwork] = useState<AtlasNetwork>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [activePairKey, setActivePairKey] = useState<string | null>(null);
  const [pairFacts, setPairFacts] = useState<KnowledgeEdge[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsError, setFactsError] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const detailPanel = useRef<HTMLElement>(null);
  const revealDetails = useRef(false);
  const current = useRef<string | null>(selected);
  current.current = selected;
  // A time-scoped read must not keep facts gathered under another time state.
  const timeKey = time ? `${time.clock}:${time.asOf}` : "current";
  useEffect(() => {
    setNetwork(empty);setHasNetwork(false);setHistory([]);setActivePairKey(null);
  }, [timeKey]);
  useEffect(() => {
    const sharedKey = new URLSearchParams(window.location.search).get("entity");
    if (sharedKey) setSelected(sharedKey);
  }, []);
  useEffect(() => {
    const onPop = () => {
      setSelected(new URLSearchParams(window.location.search).get("entity") ?? initialKey);
      setActivePairKey(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [initialKey]);
  const choose = (key: string | null) => {
    const url = new URL(window.location.href);
    if (key) url.searchParams.set("entity", key); else url.searchParams.delete("entity");
    window.history.pushState(null, "", url);
    setSelected(key);
  };
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/site/knowledge/centers?q=" + encodeURIComponent(query.trim()), {signal:controller.signal})
        .then(r => {if(!r.ok) throw Error("search failed"); return r.json() as Promise<{nodes:AtlasNode[]}>;})
        .then(v => setCenters(v.nodes)).catch(() => {if(!controller.signal.aborted) setCenters([]);});
    }, query ? 250 : 0);
    return () => {clearTimeout(timer);controller.abort();};
  }, [query]);
  useEffect(() => {
    if(!selected) {setNetwork(empty);setHasNetwork(false);setLoading(false);setError(false);return;}
    const controller = new AbortController();
    const scoped = time ? `?asOf=${encodeURIComponent(time.asOf)}&clock=${time.clock}` : "";
    setLoading(true);setError(false);
    fetch("/api/site/knowledge/neighborhood/" + encodeURIComponent(selected) + scoped, {signal:controller.signal})
      .then(r => {if(!r.ok) throw Error("neighborhood failed");return r.json() as Promise<AtlasNetwork>;})
      .then(v => {if(!controller.signal.aborted) {setNetwork(previous => mergeAtlasNetworks(previous, v));setHasNetwork(true);}})
      .catch(() => {if(!controller.signal.aborted) setError(true);})
      .finally(() => {if(!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [selected,attempt,timeKey]);
  const shown = useMemo<AtlasNetwork>(() => ({
    nodes: network.nodes.filter(n => n.key === selected || network.links.some(l => l.source === n.key || l.target === n.key)),
    links: network.links, truncated: network.truncated, status: network.status,
  }), [network, selected]);
  const pairs = useMemo(() => groupAtlasPairs(shown.links), [shown.links]);
  const activePair = pairs.find(p => p.key === activePairKey);
  const activePairIds = activePair?.links.map(l => l.id).join("|") ?? "";
  // Fetch all published factual assertions once from the entity profile. No edges inferred.
  useEffect(() => {
    if (!activePair) {setPairFacts([]);setFactsLoading(false);setFactsError(false);return;}
    const controller = new AbortController();
    const accepted = new Set(activePair.links.map(l=>l.id));
    const scoped = time ? `?asOf=${encodeURIComponent(time.asOf)}&clock=${time.clock}` : "";
    setPairFacts([]);setFactsLoading(true);setFactsError(false);
    fetch("/api/site/knowledge/entities/" + encodeURIComponent(activePair.a) + scoped, {signal:controller.signal})
      .then(r=>{if(!r.ok)throw Error("pair unavailable");return r.json() as Promise<{edges:KnowledgeEdge[]}>;})
      .then(v=>{
        if(controller.signal.aborted)return;
        const facts=(v.edges??[]).filter(e=>accepted.has(e.id) &&
          ((e.subject.key===activePair.a&&e.object.key===activePair.b) ||
           (e.subject.key===activePair.b&&e.object.key===activePair.a)));
        facts.sort((a,b)=>(b.validAt??"").localeCompare(a.validAt??"")||a.id.localeCompare(b.id));
        setPairFacts(uniqueAtlasFacts(facts));
      })
      .catch(()=>{if(!controller.signal.aborted)setFactsError(true);})
      .finally(()=>{if(!controller.signal.aborted)setFactsLoading(false);});
    return ()=>controller.abort();
  },[activePairKey,activePairIds,timeKey]);
  useEffect(() => {
    if(!expanded)return;
    const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setExpanded(false);};
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    document.addEventListener("keydown",close);
    return ()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",close);};
  },[expanded]);
  const focus=(key:string, traversedPairKey: string | null = null)=>{
    setActivePairKey(traversedPairKey);
    if(current.current===key)return;
    if(current.current)setHistory(v=>[...v.slice(-19),current.current!]);
    choose(key);
    setQuery("");
    trackAnalytics("graph_node_select");
  };
  useEffect(() => {
    if (activePairKey && revealDetails.current) {
      revealDetails.current = false;
      detailPanel.current?.scrollIntoView({behavior:"smooth",block:"nearest"});
    }
  }, [activePairKey]);
  const openPair = (key:string) => {
    if (activePairKey === key) {
      detailPanel.current?.scrollIntoView({behavior:"smooth",block:"nearest"});
      return;
    }
    revealDetails.current = true;
    setActivePairKey(key);
    trackAnalytics("graph_relation_select");
  };
  const back=()=>setHistory(v=>{
    setActivePairKey(null);
    const next=[...v], key=next.pop();
    if(key)choose(key);
    return next;
  });
  const center=shown.nodes.find(n=>n.key===selected)??network.nodes.find(n=>n.key===selected);
  const relations=shown.links.filter(l=>l.source===selected||l.target===selected);
  const adjacentPairs=pairs.filter(p=>p.a===selected||p.b===selected);
  const names=new Map(network.nodes.map(n=>[n.key,n.name]));
  return <section className={`lr-atlas ${expanded?"is-expanded":""}`} aria-label={t("实体关系探索","Entity relationship explorer")}>
    <div className="lr-atlas-toolbar"><div><span className="lr-pulse"/> <strong>KNOWLEDGE ATLAS</strong>
      <span className="lr-atlas-count">{selected?t(`${shown.nodes.length} 个实体 · ${shown.links.length} 条关系`,`${shown.nodes.length} entities · ${shown.links.length} relations`):t("按实体探索","Explore by entity")}</span></div>
      <div className="lr-atlas-actions">
        {history.length>0&&<button type="button" onClick={back}>{t("返回上一实体","Previous entity")}</button>}
        {selected&&<button type="button" onClick={()=>{choose(null);setHistory([]);setActivePairKey(null);}}>{t("实体目录","Directory")}</button>}
        <button type="button" aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?t("退出大图","Close expanded view"):t("大图浏览","Expand view")}</button>
      </div>
    </div>
    <div className="lr-atlas-body">
      <div className="lr-atlas-main">
        {selected&&hasNetwork&&shown.nodes.length?<><KnowledgeAtlasCanvas network={shown} selectedKey={selected} activePairKey={activePairKey} homeKey={initialKey} onNode={focus} onPair={openPair}/>
            <div className="lr-atlas-caption" role="status" aria-live="polite" style={{minHeight:"1.5em"}}>
              {error?<>{t("邻近关系读取失败","Unable to update neighbors")} <button type="button" onClick={()=>setAttempt(v=>v+1)}>{t("重试","Retry")}</button></>:loading?t("正在补充邻近关系…","Updating nearby relations…"):"\u00a0"}
            </div></>
          :error?<div className="lr-atlas-state" role="alert"><p>{t("实体关系暂时无法读取","Unable to load entity relationships")}</p><button type="button" onClick={()=>setAttempt(v=>v+1)}>{t("重试","Retry")}</button></div>
          :loading?<div className="lr-atlas-state" role="status">{t("正在读取邻近关系…","Loading nearby relationships…")}</div>
          :<div className="lr-atlas-state" role="status">{selected?t("暂无可公开的邻近关系","No public neighbors yet"):t("从右侧搜索或选择一个实体开始探索","Search or select an entity to begin")}</div>}
        <div className="lr-atlas-caption">{t("按需展开实体的全部已公开关系，保留探索过的节点与连线。","Explore all published links of a node; previously discovered relations remain visible.")}</div>
        {time&&<div className="lr-atlas-caption">{t("正在按选定时点读取有界历史；切换时点会重新开始探索。","Reading a bounded historical view at the selected time; changing the cutoff restarts the exploration.")}</div>}
      </div>
      <aside className="lr-atlas-sidebar">
        <label className="lr-knowledge-search"><IconSearch size={17}/><span className="sr-only">{t("搜索实体","Search entities")}</span>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("搜索实体名称…","Search entity names…")}/></label>
        {selected&&!query&&center&&<div className="lr-atlas-entity"><span className="lr-eyebrow">{t("当前中心实体","FOCUS ENTITY")}</span><h3>{center.name}</h3>
          <p>{relations.length} {t("条可公开关系","public relations")}</p>
          {center.key!==initialKey&&<Link to={`/knowledge/entity/${encodeURIComponent(center.key)}`} className="lr-inline-link">{t("打开实体档案","Open entity profile")} ↗</Link>}
        </div>}
        <div className="lr-atlas-list-heading">{query||!selected?t("选择实体","CHOOSE AN ENTITY"):t("沿关系继续探索","FOLLOW CONNECTIONS")}</div>
        <div className="lr-atlas-list">
          {query||!selected?centers.map(n=><button className="lr-atlas-node-row" type="button" key={n.key} onClick={()=>focus(n.key)}><strong>{n.name}</strong><span>↗</span></button>)
          :adjacentPairs.map(pair=>{const other=pair.a===selected?pair.b:pair.a;return <div className={`lr-atlas-connection ${pair.key===activePairKey?"is-active":""}`} key={pair.key}>
            <button type="button" aria-pressed={pair.key===activePairKey} onClick={()=>focus(other,pair.key)}><strong>{names.get(other)??other}</strong><span>{pair.links.length} {t("条事实","facts")}</span></button>
            <button type="button" onClick={()=>openPair(pair.key)}>{t("查看事实","Facts")} ↗</button>
          </div>;})}
        </div>
      </aside>
    </div>
    {activePair&&<section ref={detailPanel} className="lr-atlas-evidence" aria-label={t("实体之间的全部事实和来源","All facts and sources for this connection")}>
      <div className="lr-atlas-list-heading">
        {names.get(activePair.a)??activePair.a} ↔ {names.get(activePair.b)??activePair.b} · {activePair.links.length} {t("条关系记录","relation records")}
        <button type="button" onClick={()=>setActivePairKey(null)}>{t("关闭","Close")} ×</button>
      </div>
      {factsLoading?<p className="lr-atlas-hint" role="status">{t("正在读取全部事实与来源…","Loading all facts and sources…")}</p>
        :factsError?<p className="lr-atlas-hint" role="alert">{t("详情读取失败，请重新点击主连线","Unable to load facts; select the connection again")}</p>
        :pairFacts.length?<div className="grid gap-4" data-testid="atlas-pair-facts">{pairFacts.map(edge=><RelationEvidence key={edge.id} edge={edge}/>)}</div>
        :<p className="lr-atlas-hint">{t("暂无可展示的事实","No public facts available")}</p>}
    </section>}
  </section>;
}
