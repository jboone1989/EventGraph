// The home page's top: a pulse strip (the last 24 hours and the graph's size), the lead story beside its
// relations in the knowledge graph and one piece of evidence, the rest of the hot ranking, and a side
// column with exchange quotes, the latest daily and the ways in for agents. Events → relations → evidence.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { HotEntryView, ReportIndexEntry, SiteStats } from "@aihot/contracts/site";
import { IntentLink } from "../../components/ui/IntentLink";
import { IconArrowRight, IconArrowUpRight, IconCode, IconPlug, IconRss } from "../../components/icons";
import { KnowledgeCanvas, type KnowledgeGraph, type KnowledgeStats } from "../../components/KnowledgeNetwork";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { englishSourceName } from "../../lib/english";
import { trackAnalytics } from "../../lib/analytics.client";
import { Sparkline } from "../hot/Sparkline";
import { Delta } from "../hot/Delta";

const hasHan = (s: string) => /[㐀-鿿]/u.test(s);
const count = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString("en-US"));

/** The story's title for the reader's language: English mode never shows a Chinese headline as English. */
export function useEventTitle() {
  const lang = useUiLanguage();
  return (e: HotEntryView) => (lang === "en" ? (e.english?.title ?? e.englishTitle ?? `Event #${e.rank} · See source reports`) : e.story.title);
}

/** The story's page in the reader's language. */
export function useEventPath() {
  const lang = useUiLanguage();
  return (e: HotEntryView) => `${lang === "en" ? "/en" : ""}/story/${e.story.publicId}`;
}

export function PulseStrip({ site, graph }: { site: SiteStats | null; graph: KnowledgeStats }) {
  const t = useText();
  const live = graph.status !== "unavailable";
  const cells = [
    { group: t("过去 24 小时", "LAST 24H"), value: count(site?.day.collected), label: t("采集", "Collected") },
    { value: count(site?.day.selected), label: t("精选", "Selected"), accent: true },
    { group: t("知识图谱", "KNOWLEDGE GRAPH"), value: live ? count(graph.episodes) : "—", label: t("入图报道", "Reports in graph"), split: true },
    { value: live ? count(graph.entities) : "—", label: t("实体", "Entities") },
    { value: live ? count(graph.relations) : "—", label: t("关系", "Relations") },
  ];
  return (
    <section className="lr-pulse-strip" aria-label={t("运行与图谱规模", "Activity and graph size")}>
      {cells.map((c, i) => (
        <div key={i} className={c.split ? "is-split" : undefined}>
          <span className="lr-pulse-group">{c.group ?? ""}</span>
          <strong className={`numeral ${c.accent ? "text-accent" : ""}`}>{c.value}</strong>
          <small>{c.label}</small>
        </div>
      ))}
    </section>
  );
}

function Evidence({ graph }: { graph: KnowledgeGraph }) {
  const t = useText();
  const lang = useUiLanguage();
  const edge = graph.edges[0];
  if (!edge) return null;
  const name = (n: { name: string }) => (lang === "en" && hasHan(n.name) ? t("实体", "Entity") : n.name);
  const since = edge.validAt ? edge.validAt.slice(0, 10) : null;
  return (
    <Link to={`/knowledge/entity/${encodeURIComponent(edge.subject.key)}`} className="lr-proof">
      <span className="lr-proof-rel">
        {name(edge.subject)} <span className="lr-proof-pred">{lang === "en" && hasHan(edge.predicate) ? "RELATED TO" : edge.predicate.replaceAll("_", " ")}</span> {name(edge.object)}
      </span>
      <small>
        {since && <>{t("生效", "Valid from")} <span className="mono">{since}</span> · </>}
        {edge.evidence.length} {t("条来源", edge.evidence.length === 1 ? "source" : "sources")} · {t("提取的关系事实，非原文引述", "Extracted fact, not a verbatim quote")}
      </small>
    </Link>
  );
}

/**
 * No. 1 in the hot ranking beside the relations its reports put into the graph. Without a ranking the
 * left side introduces the site and the right side shows the latest relations in the graph.
 */
export function LeadStory({ entry, storyGraph, overview }: { entry: HotEntryView | null; storyGraph: KnowledgeGraph; overview: KnowledgeGraph }) {
  const t = useText();
  const lang = useUiLanguage();
  const title = useEventTitle();
  const eventPath = useEventPath();
  const own = storyGraph.edges.length > 0;
  const graph = own ? storyGraph : overview;
  const voices = (entry?.sourceNames ?? []).map(n => englishSourceName(n)).filter((n) => n !== "Untranslated source").slice(0, 3);
  return (
    <section className="lr-lead" aria-labelledby="lead-title">
      <div className="lr-lead-story">
        <div className="lr-layers"><b>{t("事件", "EVENT")}</b><i>→</i>{t("关系", "RELATIONS")}<i>→</i>{t("证据", "EVIDENCE")}</div>
        {entry ? (
          <>
            <div className="lr-lead-top">
              <span className="lr-lead-rank numeral" aria-label={t("热度第 1", "Ranked first by heat")}>1</span>
              {entry.badges.includes("surge") && <span className="lr-badge is-hot">{t("爆", "SURGE")}</span>}
              {entry.badges.includes("rising") && <span className="lr-badge is-rising">{t("发酵中", "RISING")}</span>}
              {entry.badges.includes("new") && <span className="lr-badge is-new">{t("新", "NEW")}</span>}
              <Delta trend={entry.trend} pct={entry.trendPct} className="lr-lead-delta" />
            </div>
            <h1 id="lead-title" className="lr-lead-title">
              <IntentLink viewTransition to={eventPath(entry)}>{title(entry)}</IntentLink>
            </h1>
            {lang === "zh" ? entry.summary && <p className="lr-lead-sum">{entry.summary}</p> : entry.english && <p className="lr-lead-sum">{entry.english.summary}</p>}
            {lang === "en" && voices.length > 0 && (
              <p className="lr-lead-voices">Reported by <b>{voices.join(", ")}</b>{entry.sourceCount > voices.length ? ` and ${entry.sourceCount - voices.length} more` : ""}</p>
            )}
            <div className="lr-lead-data">
              <div>
                <strong className="numeral">{Math.round(entry.heat)}</strong>
                <small>{t("热度指数", "Heat index")}</small>
              </div>
              <Sparkline values={entry.spark} className="lr-lead-spark text-heat-3!" />
            </div>
            <div className="lr-lead-facts">
              <span><b className="mono">{entry.sourceCount}</b> {t("个来源", entry.sourceCount === 1 ? "source" : "sources")}</span>
              <span><b className="mono">{entry.participantCount}</b> {t("位参与者", "participants")}</span>
              {own && <span><b className="mono">{storyGraph.edges.length}</b> {t("条图谱关系", "graph relations")}</span>}
              <IntentLink viewTransition to={eventPath(entry)} className="lr-lead-more">{t("打开事件", "Open event")} <IconArrowRight size={14} /></IntentLink>
            </div>
          </>
        ) : (
          <>
            <h1 id="lead-title" className="lr-lead-title is-slogan">{t("看见事件。", "Follow events.")}<br /><em>{t("连接事实。", "Connect the facts.")}</em></h1>
            <p className="lr-lead-sum">{t("我们把公开报道组织成事件，再把其中有依据的实体关系沉淀为持续更新的知识网络。", "We organize reporting into evolving events and keep evidence-backed relationships in a living knowledge graph.")}</p>
            <div className="mt-2 flex flex-wrap gap-2.5">
              <Link to="/knowledge" className="lr-button-primary" onClick={()=>trackAnalytics("graph_node_select")}>{t("探索知识网络", "Explore the graph")} <IconArrowUpRight size={16} /></Link>
              <Link to="/hot" className="lr-button-quiet">{t("浏览事件", "Browse events")} <IconArrowRight size={16} /></Link>
            </div>
          </>
        )}
      </div>
      <div className="lr-lead-graph">
        <div className="lr-night-head">
          <span>{own ? t("这个事件在图谱里", "THIS EVENT IN THE GRAPH") : t("图谱最新关系", "LATEST IN THE GRAPH")}</span>
          <Link to="/knowledge" className="hover:text-night-ink">GRAPHITI ↗</Link>
        </div>
        <KnowledgeCanvas edges={graph.edges} compact />
        <Evidence graph={graph} />
      </div>
    </section>
  );
}

/** Ranks 2–5 of the hot ranking: serif rank, title with its sources, the day's curve and the heat. */
export function Trending({ entries }: { entries: HotEntryView[] }) {
  const t = useText();
  const title = useEventTitle();
  const eventPath = useEventPath();
  if (!entries.length) return null;
  return (
    <section className="lr-trending" aria-labelledby="trending-title">
      <div className="lr-section-head">
        <h2 id="trending-title"><span className="lr-live-dot" aria-hidden="true" />{t("正在升温", "Trending events")}</h2>
        <Link to="/hot" className="lr-inline-link">{t("完整榜单", "Full ranking")} <IconArrowRight size={14} /></Link>
      </div>
      <ol className="lr-trend-list">
        {entries.map((e) => (
          <li key={e.story.publicId}>
            <IntentLink viewTransition to={eventPath(e)} className="lr-trend-row">
              <span className="lr-trend-rank numeral">{e.rank}</span>
              <span className="lr-trend-text">
                <b>{title(e)}</b>
                <span>{e.sourceCount} {t("个来源", "sources")} · {e.participantCount} {t("位参与者", "participants")}</span>
              </span>
              <Sparkline values={e.spark} className="lr-trend-spark text-heat-2!" />
              <span className="lr-trend-heat"><strong className="numeral">{Math.round(e.heat)}</strong><small>{t("热度", "heat")}</small></span>
            </IntentLink>
          </li>
        ))}
      </ol>
    </section>
  );
}

const ASSETS = ["BTC", "ETH", "SOL", "XRP", "BNB"] as const;
interface Spot { asset: string; observations: Array<{ exchange: string; priceUsdt: number; change24hPercent: number }> }

/** Exchange quotes read after the page loads (/api/market/spot), so a slow exchange never holds up the page. */
export function MarketCard() {
  const t = useText();
  const [rows, setRows] = useState<Spot[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(ASSETS.map((a) => fetch(`/api/market/spot?asset=${a}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]) }).then((r) => (r.ok ? (r.json() as Promise<Spot>) : null)).catch(() => null)))
      .then((all) => setRows(all.filter((r): r is Spot => !!r && Array.isArray(r.observations) && r.observations.length > 0)))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const price = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 4 });
  return (
    <section className="lr-side-card" aria-labelledby="market-title">
      <h3 id="market-title">{t("行情", "Markets")} <small className="mono">USDT · 24H</small></h3>
      {rows === null ? (
        <div className="grid gap-2">{ASSETS.map((a) => <div key={a} className="skeleton h-7" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-4">{t("行情暂时不可用。", "Quotes are unavailable right now.")}</p>
      ) : (
        <ul className="lr-market">
          {rows.map((r) => {
            const q = r.observations[0]!;
            const up = q.change24hPercent >= 0;
            return (
              <li key={r.asset}>
                <b className="mono">{r.asset}</b>
                <span className="numeral">{price(q.priceUsdt)}</span>
                <span className={`mono ${up ? "text-ok" : "text-down"}`}>{up ? "+" : ""}{q.change24hPercent.toFixed(2)}%</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="lr-side-foot">{t("Binance / OKX 现货快照，和新闻分开，不构成投资建议。", "Binance / OKX spot snapshot, kept apart from the news. Not investment advice.")}</p>
    </section>
  );
}

export function DailyCard({ latest }: { latest: ReportIndexEntry | null }) {
  const t = useText();
  const lang = useUiLanguage();
  if (!latest) return null;
  return (
    <Link to="/daily" className="lr-daily-card">
      <span className="lr-daily-top"><span>{t("日报", "DAILY BRIEF")}</span><span>{latest.key}</span></span>
      <span className="lr-daily-no numeral">No.{latest.issueNumber}<small>{t("期", "issue")}</small></span>
      <strong>{lang === "zh" && latest.title ? latest.title : t("今天的要闻", "Today’s brief")}</strong>
      <span className="lr-daily-foot"><span><b>{latest.count}</b> {t("条", "stories")}</span><span>{t("阅读日报", "Read the brief")} →</span></span>
    </Link>
  );
}

export function AgentCard() {
  const t = useText();
  const rows = [
    { icon: IconPlug, name: "MCP", text: t("Claude、Cursor 等客户端直接调用", "Tools for Claude, Cursor and other clients"), to: "/agent?tab=mcp" },
    { icon: IconRss, name: "RSS", text: t("精选、分类与日报订阅", "Selected, category and daily feeds"), to: "/agent?tab=rss" },
    { icon: IconCode, name: "API", text: t("匿名只读 REST 接口", "Anonymous read-only REST"), to: "/agent?tab=api" },
  ];
  return (
    <section className="lr-side-card" aria-labelledby="agent-title">
      <h3 id="agent-title">{t("Agent 接入", "For agents")} <Link to="/agent" className="lr-inline-link">{t("全部", "All")}</Link></h3>
      <ul className="lr-outs">
        {rows.map((r) => (
          <li key={r.name}>
            <Link to={r.to}><b className="mono"><r.icon size={14} /> {r.name}</b><span>{r.text}</span></Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
