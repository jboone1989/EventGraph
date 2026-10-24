import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/knowledge-entity";
import { beijingDate } from "@aihot/contracts/time";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { localized, pageMeta, siteUrl } from "../lib/seo";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import { type KnowledgeEdge, type KnowledgeGraph } from "../components/KnowledgeNetwork";
import { KnowledgeAtlas } from "../components/KnowledgeAtlas";
import { IntentLink } from "../components/ui/IntentLink";
import { IconArrowLeft, IconArrowRight } from "../components/icons";
import { useText, useUiLanguage } from "../components/LanguageSwitch";
import { FollowControls } from "../components/FollowButton";

export const handle: Screen = { tab: "knowledge", name: "实体档案" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

interface EntityProfile extends KnowledgeGraph {
  entity: { key: string; name: string; kind: string; summary?: string | null } | null;
  reports?: Array<{ id: string; title: string; originalTitle: string | null; source: { name: string; firstParty: boolean }; publishedAt: string }>;
  stories?: Array<{ publicId: string; title: string; englishTitle: string | null; reportCount: number; latestAt: string }>;
}
const hasHan = (s: string) => /[㐀-鿿]/u.test(s);
const day = (iso: string | null) => (iso ? beijingDate(iso) : null);

export async function loader({ params, request }: Route.LoaderArgs) {
  // A temporary knowledge API failure must not turn an already indexed entity into a 200/noindex page.
  const profile = await loadOr404<EntityProfile>(`/api/site/knowledge/entities/${encodeURIComponent(params.key)}`, { signal: request.signal, timeoutMs: 4_000 });
  return cachedPage(120, { profile });
}

export function meta({ loaderData, params, location }: Route.MetaArgs) {
  const p = loaderData?.profile;
  const name = p?.entity?.name;
  const path = `/knowledge/entity/${encodeURIComponent(params.key)}`;
  // An entity with sourced relations is a page worth finding, unless its "name" is a raw source URL.
  // Source URLs can appear as Graphiti entity labels; preserve the useful page without indexing that label.
  if (!name || !p.edges.length || /^https?:\/\//i.test(name.trim()))
    return pageMeta({ title: `${name ?? "实体档案"} · 知识网络`, path, noindex: true });
  const current = p.edges.filter((e) => !e.invalidAt).length;
  const summary = p.entity?.summary ?? null;
  return localized(pageMeta({
    title: `${name} · 实体档案`,
    description: summary?.slice(0, 150) ?? `${name} 在知识图谱中的 ${p.edges.length} 条关系（当前有效 ${current} 条），以及相关事件和来源报道。`,
    path,
    jsonLd: [{ "@context": "https://schema.org", "@type": "Thing", name, url: `${siteUrl()}${path}` }],
  }), location.pathname, {
    title: `${name} · Entity profile`,
    description: summary && !hasHan(summary) ? summary.slice(0, 150) : `${name}: ${p.edges.length} relations in the knowledge graph (${current} current), with the related events and source reports.`,
    // An entity known only by a Chinese name has no English page worth indexing.
    noindex: hasHan(name),
  });
}

/** Relations in the order they took effect, newest first; undated ones last. */
function byValidity(edges: KnowledgeEdge[]) {
  return [...edges].sort((a, b) => (b.validAt ?? "").localeCompare(a.validAt ?? "") || a.id.localeCompare(b.id));
}

function RelationTimeline({ edges, self }: { edges: KnowledgeEdge[]; self: string }) {
  const t = useText();
  const lang = useUiLanguage();
  const name = (n: { key: string; name: string }) => (lang === "en" && hasHan(n.name) ? `Entity ${n.key.slice(0, 8)}` : n.name);
  return (
    <ol className="lr-relation-timeline">
      {byValidity(edges).slice(0, 40).map((e) => {
        const other = e.subject.key === self ? e.object : e.subject;
        return (
          <li key={e.id} className={e.invalidAt ? "is-ended" : undefined}>
            <time className="mono" dateTime={e.validAt ?? undefined}>{day(e.validAt) ?? t("时间未知", "Undated")}</time>
            <span className="lr-tl-line" aria-hidden="true" />
            <div className="min-w-0">
              <div className="lr-tl-rel">
                <span>{name(e.subject)}</span>
                <span className="lr-proof-pred">{lang === "en" && hasHan(e.predicate) ? "RELATED TO" : e.predicate.replaceAll("_", " ")}</span>
                <span>{name(e.object)}</span>
              </div>
              {(lang === "zh" || !hasHan(e.fact)) && <p>{e.fact}</p>}
              <div className="lr-tl-meta">
                {e.invalidAt
                  ? <span className="text-hot">{t("已失效", "Ended")} {day(e.invalidAt)}</span>
                  : <span className="text-ok">{t("当前有效", "Current")}</span>}
                <span>{e.evidence.length} {t("条来源", e.evidence.length === 1 ? "source" : "sources")}</span>
                <Link to={`/knowledge/entity/${encodeURIComponent(other.key)}`} className="lr-inline-link">{name(other)} <IconArrowRight size={13} /></Link>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function KnowledgeEntity() {
  const { profile: data } = useLoaderData<typeof loader>();
  const name = data.entity?.name;
  const t = useText();
  const lang = useUiLanguage();
  const displayName = lang === "en" && name && hasHan(name) ? "Entity " + data.entity?.key.slice(0, 8) : name;
  const summary = data.entity?.summary && (lang === "zh" || !hasHan(data.entity.summary)) ? data.entity.summary : null;
  const stories = data.stories ?? [];
  const reports = data.reports ?? [];
  const current = data.edges.filter((e) => !e.invalidAt).length;
  const metrics = [
    { code: "RELATIONS", value: data.edges.length, label: t("关系", "Relations") },
    { code: "CURRENT", value: current, label: t("当前有效", "Current") },
    { code: "EVENTS", value: stories.length, label: t("相关事件", "Events") },
    { code: "REPORTS", value: reports.length, label: t("来源报道", "Source reports") },
  ];
  return (
    <div className="lr-knowledge-page pb-12">
      <PhoneBar back={{ to: "/knowledge", label: t("知识网络", "Knowledge Graph") }} title={displayName ?? t("实体档案", "Entity Profile")} />
      <Link to="/knowledge" className="lr-inline-link hidden lg:inline-flex"><IconArrowLeft size={16} /> {t("返回知识网络", "Back to Knowledge Graph")}</Link>
      <header className="lr-knowledge-header mt-4">
        <div className="lr-eyebrow">ENTITY PROFILE / {t("实体档案", "KNOWLEDGE GRAPH")}</div>
        <h1 data-page-title className="lr-page-title mt-4">{displayName ?? t("尚未收录此实体", "Entity not found")}</h1>
        {data.entity && <div className="mt-4"><FollowControls kind="entity" id={data.entity.key} name={data.entity.name} /></div>}
        {summary ? (
          <p className="mt-3 max-w-[760px] text-[14.5px] leading-[1.85] text-ink-2">{summary}<span className="ml-2 text-[12px] text-ink-4">{t("· Graphiti 生成的实体摘要", "· Entity summary generated by Graphiti")}</span></p>
        ) : (
          <p className="mt-3 text-[14px] leading-[1.8] text-ink-3">{name ? t("这个实体在知识图谱里的关系、关系何时生效或失效，以及背后的事件和来源报道。", "This entity’s relations in the knowledge graph, when each took effect or ended, and the events and reports behind them.") : data.status === "unavailable" ? t("知识网络暂时无法访问。", "Knowledge graph temporarily unavailable.") : t("此节点没有可公开展示的关系，或已合并到其他实体。", "This entity has no public relationships or has been merged.")}</p>
        )}
        {name && (
          <div className="lr-metric-strip is-four">
            {metrics.map((m) => <div key={m.code}><div className="lr-eyebrow">{m.code}</div><strong>{m.value.toLocaleString("en-US")}</strong><span>{m.label}</span></div>)}
          </div>
        )}
      </header>
      {name && (
        <>
          <div className="mt-7"><KnowledgeAtlas key={data.entity!.key} initialKey={data.entity!.key} /></div>
          <div className="lr-entity-grid mt-8">
            <section aria-labelledby="entity-timeline">
              <div className="lr-section-head"><h2 id="entity-timeline">{t("关系变化", "Relation timeline")}</h2><small className="mono text-[11px] text-ink-4">{t("按生效时间", "BY VALID-FROM DATE")}</small></div>
              <RelationTimeline edges={data.edges} self={data.entity!.key} />
              <p className="mt-3 text-[12px] leading-[1.7] text-ink-4">{t("关系是 Graphiti 从报道中提取的事实陈述，不是原文引述；失效时间表示后来的报道显示这条关系已不成立。", "Relations are facts Graphiti extracted from reports, not verbatim quotes. An end date means later reporting showed the relation no longer holds.")}</p>
            </section>
            <div className="grid content-start gap-6">
              {stories.length > 0 && (
                <section aria-labelledby="entity-events" className="lr-side-card">
                  <h3 id="entity-events">{t("相关事件", "Events")} <small className="mono">{stories.length}</small></h3>
                  <ul className="lr-entity-list">
                    {stories.map((s) => (
                      <li key={s.publicId}>
                        <IntentLink viewTransition to={`/story/${s.publicId}`}>
                          <b>{lang === "en" ? (s.englishTitle ?? "Event · see source reports") : s.title}</b>
                          <span>{s.reportCount} {t("篇相关报道", s.reportCount === 1 ? "cited report" : "cited reports")} · {day(s.latestAt)}</span>
                        </IntentLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {reports.length > 0 && (
                <section aria-labelledby="entity-reports" className="lr-side-card">
                  <h3 id="entity-reports">{t("来源报道", "Source reports")} <small className="mono">{reports.length}</small></h3>
                  <ul className="lr-entity-list">
                    {reports.map((r) => {
                      const source = lang === "en" && hasHan(r.source.name) ? "Publisher" : r.source.name;
                      const title = lang === "en" ? (r.originalTitle && !hasHan(r.originalTitle) ? r.originalTitle : !hasHan(r.title) ? r.title : `Original report from ${source}`) : r.title;
                      return (
                        <li key={r.id}>
                          <IntentLink viewTransition to={lang === "en" ? `/en/items/${r.id}` : `/items/${r.id}`}>
                            <b>{title}</b>
                            <span>{source}{r.source.firstParty ? t(" · 一手", " · first-party") : ""} · {day(r.publishedAt)}</span>
                          </IntentLink>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
