import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/knowledge";
import type { ReportLatestPage } from "@aihot/contracts/site";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { localized, pageMeta } from "../lib/seo";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import { IconArrowRight, IconHistory } from "../components/icons";
import { type KnowledgeStats } from "../components/KnowledgeNetwork";
import { KnowledgeAtlas } from "../components/KnowledgeAtlas";
import { GraphChanges, type DailyGraphChanges } from "../features/report/GraphChanges";
import { SITE } from "@aihot/site";
import { useText, useUiLanguage } from "../components/LanguageSwitch";

export const handle: Screen = { tab: "knowledge", name: "知识网络" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();
export async function loader({ request }: Route.LoaderArgs) {
  const stats = await apiGet<KnowledgeStats>("/api/site/knowledge/stats", {signal: request.signal, timeoutMs: 4_000}).catch(()=>({episodes: 0, entities: 0, relations: 0, status: "unavailable"} as KnowledgeStats));
  // The latest daily's graph changes, rendered as text here (specs/003-content-assets FR-006): the
  // atlas is a canvas, so without this the page carries little for readers or crawlers.
  const latest = await apiGet<ReportLatestPage>("/api/site/reports/daily/latest-page", { signal: request.signal, timeoutMs: 3_000 }).catch(() => null);
  const changesKey = latest?.report?.key ?? null;
  const changes = changesKey
    ? await apiGet<DailyGraphChanges>(`/api/site/knowledge/daily/${changesKey}`, { signal: request.signal, timeoutMs: 3_000 }).catch(() => null)
    : null;
  return cachedPage(60, { stats, changes, changesKey });
}
export function meta({ location }: Route.MetaArgs) {
  return localized(pageMeta({ title: `知识网络 | ${SITE.name}`, description: "探索新闻背后的实体关系、历史变化与可追溯的原始来源。", path: "/knowledge" }), location.pathname, {
    title: "Knowledge graph",
    description: "Explore the entities and relations behind the news, how they changed over time, and the original sources that support them.",
  });
}

export default function KnowledgePage() {
  const { stats, changes, changesKey } = useLoaderData<typeof loader>();
  const t = useText();
  const lang = useUiLanguage();
  return (
    <div className="lr-knowledge-page pb-12">
      <PhoneBar title={t("知识网络","Knowledge Graph")} />
      <header className="lr-knowledge-header">
        <div className="lr-eyebrow">LIVING KNOWLEDGE / 01—03</div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 data-page-title className="lr-page-title">{t("让信息形成","Make knowledge")}<span>{t("联系。","connected.")}</span></h1>
            <p className="mt-3 max-w-[720px] text-[14px] leading-[1.9] text-ink-3">{t("事件是短期的，知识可以持续积累。从感兴趣的实体开始，沿着有证据支持的关系逐层探索公司、人物与技术。","News events evolve quickly. Start with an entity and explore its evidence-backed connections to companies, people, and technologies.")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to={lang === "en" ? "/en/explore" : "/explore"} className="lr-inline-link">{t("打开探索工作台","Open the explorer")} <IconArrowRight size={16}/></Link>
            <Link to="/hot" className="lr-inline-link">{t("查看新闻事件树","View event timeline")} <IconArrowRight size={16}/></Link>
          </div>
        </div>
        <div className="lr-metric-strip">
          {([{number:stats.episodes,label:t("入图报道","Reports"),code:"EPISODES"},{number:stats.entities,label:t("实体节点","Entities"),code:"ENTITIES"},{number:stats.relations,label:t("事实关系","Facts"),code:"RELATIONS"}] as const).map(m => (
            <div key={m.code}><div className="lr-eyebrow">{m.code}</div><strong>{stats.status === "unavailable" ? "—" : m.number.toLocaleString("en-US")}</strong><span>{m.label}</span></div>
          ))}
        </div>
      </header>
      <div className="mt-7 mb-4 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-[20px] font-semibold text-ink">{t("关系探索工作台", "Relationship Explorer")}</h2>
        <p className="text-[12px] text-ink-4">{t("上方为入库总量 · 下方只展示有公开报道支撑的实体与关系", "Totals above cover the stored graph · The atlas includes publicly sourced entities and relations")}</p>
      </div>
      <KnowledgeAtlas/>
      {changes && changesKey && (
        <div className="mt-8">
          <GraphChanges changes={changes} />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-4">
            <Link to={`/daily/${changesKey}`} className="text-accent hover:underline">{t("读当期日报", "Read that daily")}</Link>
            <Link to="/daily/archive" className="text-accent hover:underline">{t("往期日报", "Daily archive")}</Link>
            <span>{t("这一期的时间窗口由日报收刊时间决定。", "The window follows that daily issue's cutoff.")}</span>
          </div>
        </div>
      )}
      <div className="lr-research-note mt-7">
        <IconHistory size={19}/>
        <div><strong>{t("不是“出现同一篇报道”就画线。","Co-occurrence is not a relationship.")}</strong><p>{t("这里的连线代表模型从报道材料中提取的关系事实，并保留时间和原始出处。AI 提取可能出现错误，重要结论应点击来源核实。未发现关系的实体不会被强行连接。","Connections are extracted from source material and keep timestamps and provenance. AI can make mistakes: verify consequential claims against their original sources. Entities are not joined without evidence.")}</p></div>
      </div>
    </div>
  );
}
