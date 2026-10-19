// An entity's public profile: its Graphiti relations, plus the public reports those relations cite and the
// events (stories) those reports belong to. Graphiti owns the relations; this database owns what is
// public, so a cited report that was withdrawn, held back or never published is left out here.
import { sql } from "../db.ts";
import { graphChanges, graphForEntity, graphForStory, graphOverview, graphNetwork, graphRelation, graphAtlasCenters, type GraphChanges, type GraphTime } from "../knowledge/graphiti.ts";
export { graphStats, graphSearch } from "../knowledge/graphiti.ts";
import { cached, cachedByKey } from "../lib/cache.ts";
import { publicSourceName } from "./rules.ts";
import { storyReportCondition } from "./scope.ts";

export interface EntityReport {
  id: string;
  title: string;
  originalTitle: string | null;
  source: { name: string; firstParty: boolean };
  publishedAt: string;
}
export interface EntityStory {
  publicId: string;
  title: string;
  /** A cited report's English original title, for English reading. */
  englishTitle: string | null;
  /** Of this entity's cited reports, how many belong to the story. */
  reportCount: number;
  latestAt: string;
}

const hasHan = (s: string) => /[㐀-鿿]/u.test(s);

/** The cited reports that are public now, newest first, each with the live story it belongs to (if any). */
export async function citedReports(articleIds: string[], now = new Date(), time?: GraphTime) {
  if (articleIds.length === 0) return { reports: [] as EntityReport[], stories: [] as EntityStory[] };
  const rows = await sql<{
    id: string; title: string; original_title: string | null; at: Date; source_name: string; first_party: boolean;
    story_public_id: string | null; story_title: string | null;
  }[]>`
    SELECT DISTINCT ON (p.article_id) p.article_id AS id, p.title, p.original_title,
      coalesce(p.published_at, p.discovered_at) AS at, s.name AS source_name, (s.tier = 'T1') AS first_party,
      st.public_id::text AS story_public_id, st.title AS story_title
    FROM publications p JOIN sources s ON s.id = p.source_id
    LEFT JOIN fact_articles fa ON fa.article_id = p.article_id
    LEFT JOIN facts f ON f.id = fa.fact_id
    LEFT JOIN stories st ON st.id = f.story_id AND st.merged_into IS NULL
    WHERE p.article_id = ANY(${articleIds}::text[]) AND ${storyReportCondition(now)}
      AND (${time?.asOf ?? null}::timestamptz IS NULL OR
        (${time?.clock === "known"} AND p.discovered_at <= ${time?.asOf ?? null}) OR
        (${time?.clock === "valid"} AND coalesce(p.published_at, p.discovered_at) <= ${time?.asOf ?? null}))
    ORDER BY p.article_id, (fa.role = 'primary') DESC NULLS LAST, (st.id IS NULL), f.id`;
  rows.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
  const reports: EntityReport[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    originalTitle: r.original_title,
    source: { name: publicSourceName(r.source_name), firstParty: r.first_party },
    publishedAt: r.at.toISOString(),
  }));
  const stories = new Map<string, EntityStory>();
  for (const r of rows) {
    if (!r.story_public_id || !r.story_title) continue;
    const story = stories.get(r.story_public_id);
    const english = r.original_title && !hasHan(r.original_title) ? r.original_title : null;
    if (story) {
      story.reportCount += 1;
      story.englishTitle ??= english;
    } else {
      stories.set(r.story_public_id, { publicId: r.story_public_id, title: r.story_title, englishTitle: english, reportCount: 1, latestAt: r.at.toISOString() });
    }
  }
  return { reports, stories: [...stories.values()] };
}

/** One entity's Graphiti relations, kept a minute: profiles, follows and feeds ask for the same entities. */
export const entityGraph = cachedByKey((key: string) => key, graphForEntity, { freshMs: 60_000, maxStaleMs: 60_000, maxKeys: 500 });

type Edge = GraphChanges["added"]["edges"][number];

/** The articles the relations cite, as evidence ids. */
export const citedArticleIds = (graph: { edges: Edge[] }) =>
  [...new Set(graph.edges.flatMap((e) => e.evidence.map((ev) => ev.articleId)).filter(Boolean))];

/** Relations with only the evidence among `publicIds`; a relation left with none is dropped. */
function withPublicEvidence(edges: Edge[], publicIds: Set<string>) {
  return edges
    .map((e) => ({ ...e, evidence: e.evidence.filter((ev) => publicIds.has(ev.articleId)) }))
    .filter((e) => e.evidence.length > 0);
}

/** The relations around one Graphiti entity, with the public reports and events behind them; the site and MCP share it.
 * A withdrawn or unreleased article cannot remain as an edge or as one of its visible citations. */
export async function entityProfile(key: string, now = new Date()) {
  const graph = await entityGraph(key);
  const { reports, stories } = await citedReports(citedArticleIds(graph), now);
  const edges = withPublicEvidence(graph.edges, new Set(reports.map((r) => r.id)));
  return { ...graph, edges, reports: reports.slice(0, 30), stories: stories.slice(0, 12) };
}

/** What changed in the graph during a daily issue's window, or null when there is no such issue. */
async function readDailyChanges(key: string, now: Date) {
  const [report] = await sql<{ window_start: Date; window_end: Date }[]>`
    SELECT window_start, window_end FROM reports WHERE kind = 'daily' AND key = ${key}`;
  if (!report) return null;
  const changes = await graphChanges(report.window_start, report.window_end);
  // Not kept: the next reader asks Graphiti again.
  if (changes.status === "unavailable") throw new Error("Graphiti unavailable");
  // Examples are shown only with a report that is public now; the counts are the graph's own.
  const { reports } = await citedReports(citedArticleIds({ edges: [...changes.added.edges, ...changes.ended.edges] }), now);
  const isPublic = new Set(reports.map((r) => r.id));
  const shown = (edges: Edge[]) => withPublicEvidence(edges, isPublic).slice(0, 8);
  return {
    key,
    windowStart: report.window_start.toISOString(),
    windowEnd: report.window_end.toISOString(),
    status: changes.status ?? "ok",
    added: { count: changes.added.count, edges: shown(changes.added.edges) },
    ended: { count: changes.ended.count, edges: shown(changes.ended.edges) },
    newEntities: changes.newEntities,
  };
}

const dailyChanges = cachedByKey((key: string) => key, (key: string) => readDailyChanges(key, new Date()), { freshMs: 300_000, maxStaleMs: 600_000, maxKeys: 100 });

/** The graph's changes for a daily issue, rule-based from Graphiti's own records (no model call). */
export async function dailyGraphChanges(key: string, now?: Date) {
  return now ? readDailyChanges(key, now) : dailyChanges(key);
}

/** A public story's relations (site and MCP): Graphiti's, each with evidence that is public now. */
export async function publicStoryGraph(publicId: string, now = new Date(), time?: GraphTime) {
  const graph = await graphForStory(publicId, time);
  const { reports } = await citedReports(citedArticleIds(graph), now, time);
  return { ...graph, status: graph.status ?? "ok", edges: withPublicEvidence(graph.edges, new Set(reports.map((r) => r.id))) };
}

/** The overview sample (site home and /knowledge): Graphiti's latest relations, each with evidence that is public now. */
async function readPublicOverview(now = new Date()) {
  const graph = await graphOverview();
  const { reports } = await citedReports(citedArticleIds(graph), now);
  const edges = withPublicEvidence(graph.edges, new Set(reports.map((r) => r.id)));
  return { ...graph, entities: new Set(edges.flatMap((e) => [e.subject.key, e.object.key])).size, edges };
}

const overview = cached(() => readPublicOverview(), { freshMs: 60_000, maxStaleMs: 60_000 });

export async function publicGraphOverview(now?: Date) {
  return now ? readPublicOverview(now) : overview.get();
}

/** Public atlas: isolated nodes need a public mention; links need their own public evidence. */
async function readPublicNetwork(now = new Date()) {
  const graph = await graphNetwork();
  const ids = [...new Set([...graph.nodes, ...graph.links].flatMap(item => item.articleIds))];
  const { reports } = await citedReports(ids, now);
  const publicIds = new Set(reports.map(r => r.id));
  const allowed = (ids: string[]) => ids.some(id => publicIds.has(id));
  const linked = new Set<string>();
  const nodeIds = new Set(graph.nodes.map(n => n.key));
  const links = graph.links.filter(l => allowed(l.articleIds) && nodeIds.has(l.source) && nodeIds.has(l.target))
    .map(({ articleIds: _, ...link }) => { linked.add(link.source); linked.add(link.target); return link; });
  const degree = new Map<string, number>();
  for (const l of links) for (const key of new Set([l.source, l.target])) degree.set(key, (degree.get(key) ?? 0) + 1);
  const nodes = graph.nodes.filter(n => linked.has(n.key) || allowed(n.articleIds))
    .map(n => ({ key: n.key, name: n.name, degree: degree.get(n.key) ?? 0 }));
  return { nodes, links, truncated: graph.truncated, status: graph.status ?? "ok" };
}

const network = cached(() => readPublicNetwork(), { freshMs: 60_000, maxStaleMs: 60_000 });
export async function publicGraphNetwork(now?: Date) { return now ? readPublicNetwork(now) : network.get(); }

export async function publicGraphRelation(key: string, now = new Date()) {
  const graph = await graphRelation(key);
  const { reports } = await citedReports(citedArticleIds(graph), now);
  return { ...graph, edges: withPublicEvidence(graph.edges, new Set(reports.map(r => r.id))) };
}

/** Only publicly sourced neighbors are returned; no full-network serialization. */
export async function publicAtlasNeighborhood(key: string, now = new Date()) {
  const graph = await entityGraph(key);
  if (graph.status === "unavailable" || graph.status === "disabled")
    return {nodes: [], links: [], truncated: false, status: graph.status};
  if (!graph.entity) return {nodes: [], links: [], truncated: false, status: "not_found"};
  const {reports} = await citedReports(citedArticleIds(graph), now);
  const publicEdges = withPublicEvidence(graph.edges, new Set(reports.map(r => r.id)));
  const edges = publicEdges;
  const nodes = new Map<string, {key:string;name:string;degree:number}>();
  nodes.set(graph.entity.key, {key:graph.entity.key,name:graph.entity.name,degree:publicEdges.length});
  const links = edges.map(e => {
    for (const item of [e.subject, e.object])
      if (!nodes.has(item.key)) nodes.set(item.key, {key:item.key,name:item.name,degree:1});
    return {id:e.id,source:e.subject.key,target:e.object.key,predicate:e.predicate,invalidAt:e.invalidAt};
  });
  return {nodes:[...nodes.values()],links,truncated:false,status:graph.status??"ok"};
}

export async function publicAtlasCenters(q: string, now = new Date()) {
  const candidates = await graphAtlasCenters(q, 30);
  if (candidates.status === "unavailable" || candidates.status === "disabled")
    return {nodes: [], status: candidates.status};
  const ids = [...new Set(candidates.nodes.flatMap(n => n.articleIds))];
  const {reports} = await citedReports(ids, now);
  const allowed = new Set(reports.map(r => r.id));
  return {nodes:candidates.nodes.filter(n => n.articleIds.some(id => allowed.has(id)))
    .slice(0, 20).map(({key,name}) => ({key,name,degree:0})),status:"ok"};
}
