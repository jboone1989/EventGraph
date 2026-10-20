import { useMemo, useState } from "react";
import { Link } from "react-router";
import { KnowledgeAtlasCanvas } from "../../components/KnowledgeAtlasCanvas";
import { RelationEvidence, type KnowledgeGraph } from "../../components/KnowledgeNetwork";
import { useText } from "../../components/LanguageSwitch";
import { groupAtlasPairs, neighborhood, temporalAtlasNetwork } from "../../lib/knowledge-atlas";

/** A time-scoped view of the SAME Cytoscape atlas canvas used by the knowledge
 * page. Fact details come only from the selected as-of response, never today's
 * unscoped entity or neighborhood endpoints.
 */
export function TemporalKnowledgeAtlas({graph}:{graph:KnowledgeGraph}) {
  const t = useText();
  const network = useMemo(()=>temporalAtlasNetwork(graph.edges),[graph.edges]);
  const [selected, setSelected] = useState<string|null>(null);
  const [pairKey,setPairKey] = useState<string|null>(null);
  const focus = selected && network.nodes.some(n=>n.key===selected)
    ? selected : network.nodes[0]?.key ?? null;
  const visible = useMemo(()=>neighborhood(network,focus,1),[network,focus]);
  const pairs = useMemo(()=>groupAtlasPairs(visible.links),[visible.links]);
  const active = pairs.find(p=>p.key===pairKey);
  const facts = active ? graph.edges.filter(edge=>active.links.some(link=>link.id===edge.id)) : [];
  const names = new Map(network.nodes.map(node=>[node.key,node.name]));
  if (!network.links.length) return <div role="status" className="rounded-panel border border-line-soft p-5 text-sm text-ink-4">
    <p>{t("这个事件在当前时点没有可公开核查的关系。不会用全局当前图谱替代事件证据。","No public relations are linked to this event at the selected time. The current global graph is not substituted for event evidence.")}</p>
    <Link to="/knowledge" className="mt-3 inline-block font-medium text-accent hover:underline">
      {t("另行探索全局知识网络 ↗","Explore the global knowledge network separately ↗")}
    </Link>
  </div>;
  return <section className="lr-atlas" aria-label={t("历史聚焦知识图谱","Historical focused knowledge atlas")}>
    <div className="lr-atlas-toolbar">
      <strong>KNOWLEDGE ATLAS</strong>
      <span className="lr-atlas-count">{t(
        `当前聚焦 ${visible.nodes.length} 个实体，${visible.links.length} 条关系`,
        `${visible.nodes.length} focused entities, ${visible.links.length} relations`)}</span>
    </div>
    <div className="lr-atlas-body">
      <div className="lr-atlas-main">
        <KnowledgeAtlasCanvas network={visible} selectedKey={focus} homeKey={network.nodes[0]?.key}
          activePairKey={active?.key??null}
          onNode={key=>{setSelected(key);setPairKey(null);}}
          onPair={key=>setPairKey(key)}/>
      </div>
      <aside className="lr-atlas-sidebar">
        <div className="lr-atlas-list-heading">{t("从当前实体继续探索","Explore focused connections")}</div>
        <div className="lr-atlas-list">
          {pairs.filter(p=>p.a===focus||p.b===focus).map(pair=><div key={pair.key} className="lr-atlas-connection">
            <button type="button" onClick={()=>{setSelected(pair.a===focus?pair.b:pair.a);setPairKey(null);}}>
              <strong>{names.get(pair.a===focus?pair.b:pair.a)}</strong>
              <span>{pair.links.length} {t("条关系","facts")}</span>
            </button>
            <button type="button" onClick={()=>setPairKey(pair.key)}>{t("查看证据","Evidence")} ↗</button>
          </div>)}
        </div>
      </aside>
    </div>
    {active && <section className="lr-atlas-evidence" aria-label={t("此时的关系证据","Relations and evidence at this time")}>
      <div className="lr-atlas-list-heading">
        {names.get(active.a)} ↔ {names.get(active.b)}
        <button type="button" onClick={()=>setPairKey(null)}>{t("关闭","Close")} ×</button>
      </div>
      <div className="grid gap-4" data-testid="temporal-pair-evidence">
        {facts.map(edge=><RelationEvidence key={edge.id} edge={edge}/>)}
      </div>
    </section>}
    <p className="lr-atlas-caption" data-testid="atlas-coverage-note">{t(
      "每次最多显示 60 条关系，文章来源数量也有上限；这不是完整历史快照。",
      "At most 60 relations per query; article coverage is also limited. This is not a complete historical snapshot.")}</p>
    <p className="lr-atlas-caption">{t("只展示当前时点返回的事实与来源，不会自动加载今天的实体档案。",
      "Only facts and sources returned for this time are shown; no present-day entity facts are fetched.")}</p>
  </section>;
}
