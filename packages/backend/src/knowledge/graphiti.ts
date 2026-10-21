import { sql } from "../db.ts";
import { graphitiRetryDelayMs } from "./ingest-backoff.ts";
import {supportsTemporalGraph} from "./temporal.ts";

type Article = {
  id: string; revision: number; title: string; url: string;
  excerpt: string | null; body_text: string | null;
  source_name: string; published_at: Date | null;
};
type Evidence = { articleId: string; url: string; source: string; quote: string; publishedAt: string | null };
type Edge = {
  id: string; subject: { key: string; name: string; kind: string };
  predicate: string; object: { key: string; name: string; kind: string };
  fact: string; validAt: string | null; invalidAt: string | null; evidence: Evidence[];
};
type Graph = { entities: number; edges: Edge[]; status?: string; temporalSupport?: string };
const emptyGraph = (status: string): Graph => ({ entities: 0, edges: [], status });

async function graphiti<T>(path: string, options?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  const origin = process.env.GRAPHITI_API_URL;
  if (!origin) throw new Error("Graphiti URL is not configured");
  const response = await fetch(origin.replace(/\/$/, "") + path, {
    method: options?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options?.timeoutMs ?? 8000),
  });
  if (!response.ok) throw new Error("Graphiti HTTP " + response.status);
  return await response.json() as T;
}

/** One new article revision per scheduled tick. Failed requests are NOT marked complete. */
export async function ingestGraphitiOnce() {
  if (process.env.GRAPHITI_INGEST_ENABLED !== "true" || process.env.MODEL_CALLS_ENABLED !== "true")
    return { status: "disabled" };
  const [article] = await sql<Article[]>`
    SELECT a.id, a.revision, a.title, a.url, a.excerpt, a.body_text,
           a.published_at, s.name AS source_name
    FROM articles a JOIN sources s ON s.id=a.source_id
    LEFT JOIN graphiti_ingestions g ON g.article_id=a.id AND g.revision=a.revision
    LEFT JOIN settings cooldown
      ON cooldown.key = 'graphiti.ingest.failure:' || a.id || ':r' || a.revision::text
    WHERE (cooldown.value IS NULL OR (cooldown.value->>'retryAfter')::timestamptz <= now())
      AND a.processing_state='analyzed' AND s.participation_mode='editorial'
      AND g.article_id IS NULL AND a.revision >= 1
      AND a.discovered_at > now() - interval '21 days'
      AND length(coalesce(a.body_text, a.excerpt, '')) >= 80
    ORDER BY (s.tier='T1') DESC, a.discovered_at DESC LIMIT 1`;
  if (!article) return { status: "no_candidate" };
  // Smaller bounded input lowers LLM extraction latency; preserve article identity and provenance.
  const text = [article.title, article.excerpt, article.body_text?.slice(0, 4500)]
    .filter(Boolean).join("\n").slice(0, 5400);
  const retryKey = `graphiti.ingest.failure:${article.id}:r${article.revision}`;
  try {
    const receipt = await graphiti<{ accepted: boolean; episode_id: string; duplicate: boolean }>("/episodes", {
      method: "POST", timeoutMs: 180000,
      body: {
        article_id: article.id, revision: article.revision, title: article.title,
        url: article.url, source: article.source_name, text,
        published_at: article.published_at?.toISOString() ?? null,
      },
    });
    if (!receipt.accepted || !receipt.episode_id) throw new Error("Graphiti did not accept episode");
    const [ingestion] = await sql<{ ingested_at: Date }[]>`
      INSERT INTO graphiti_ingestions(article_id,revision,episode_id)
      VALUES(${article.id},${article.revision},${receipt.episode_id})
      ON CONFLICT (article_id,revision) DO NOTHING
      RETURNING ingested_at`;
    await sql`DELETE FROM settings WHERE key = ${retryKey}`;
    return { status: "ingested", articleId: article.id, duplicate: receipt.duplicate, ingestedAt: ingestion?.ingested_at.toISOString() ?? null };
  } catch (error) {
    // An upstream timeout is not proof of failure: Graphiti may still finish after the client
    // disconnects. Cool down this identity rather than immediately paying to ingest it again.
    const [previous] = await sql<{ value: { failures?: number } }[]>`
      SELECT value FROM settings WHERE key = ${retryKey}`;
    const failures = Math.min(6, Number(previous?.value?.failures ?? 0) + 1);
    const retryAfter = new Date(Date.now() + graphitiRetryDelayMs(failures)).toISOString();
    const reason = String(error instanceof Error ? error.message : error).slice(0, 200);
    await sql`INSERT INTO settings (key, value, updated_by)
      VALUES (${retryKey}, ${sql.json({ failures, retryAfter, reason } as never)}, 'graphiti-ingest')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by, updated_at = now()`;
    throw error;
  }
}

/** AIHot is the authority for story membership, Graphiti for knowledge relations. */
export type GraphTime = { asOf: Date; clock: "known" | "valid" };

/** Graphiti keys episodes by ingested revision. When a revised article's newest revision has not
 * been ingested yet, asking for the current revision matches no episode and silently drops the
 * relations the graph holds; ask for the newest revision the graph actually holds instead. */
export async function ingestedRevision(id: string, revision: number): Promise<number> {
  const [row] = await sql<{ revision: number }[]>`
    SELECT coalesce(
      (SELECT g.revision FROM graphiti_ingestions g WHERE g.article_id=${id} AND g.revision=${revision}),
      (SELECT max(g.revision) FROM graphiti_ingestions g WHERE g.article_id=${id}),
      ${revision}) AS revision`;
  return row!.revision;
}

export async function graphForStory(publicId: string, time?: GraphTime): Promise<Graph> {
  if (!process.env.GRAPHITI_API_URL) return emptyGraph("disabled");
  const articles = await sql<{ id: string; revision: number }[]>`
    SELECT DISTINCT a.id,
      coalesce(
        (SELECT g.revision FROM graphiti_ingestions g WHERE g.article_id=a.id AND g.revision=a.revision),
        (SELECT max(g.revision) FROM graphiti_ingestions g WHERE g.article_id=a.id),
        a.revision) AS revision
    FROM articles a
    JOIN fact_articles fa ON fa.article_id=a.id
    JOIN facts f ON f.id=fa.fact_id
    JOIN stories st ON st.id=f.story_id
    WHERE st.public_id=${publicId}::uuid
      AND (${time?.asOf ?? null}::timestamptz IS NULL OR
        (${time?.clock === "known"} AND a.discovered_at <= ${time?.asOf ?? null}) OR
        (${time?.clock === "valid"} AND coalesce(a.published_at, a.discovered_at) <= ${time?.asOf ?? null}))
    ORDER BY a.id LIMIT 100`;
  if (!articles.length) return emptyGraph("empty");
  try {
    const result = await graphiti<Graph>("/relations/by-articles", {
      method: "POST", body: { articles: articles.map(a => a.id + ":r" + a.revision), limit: 60,
        ...(time ? { as_of: time.asOf.toISOString(), clock: time.clock } : {}) },
    });
    // Older Graphiti deployments ignore unknown POST fields. Never mistake their
    // current snapshot for a historical result while the knowledge service is rolling out.
    return supportsTemporalGraph(result, time) ? result : emptyGraph("unavailable");
  } catch (error) {
    console.error("graphiti_story_lookup_failed", error);
    return emptyGraph("unavailable");
  }
}

/** The relations Graphiti extracted from one article revision. */
export async function graphForArticle(id: string, revision: number): Promise<Graph> {
  if (!process.env.GRAPHITI_API_URL) return emptyGraph("disabled");
  try {
    const held = await ingestedRevision(id, revision);
    return await graphiti<Graph>("/relations/by-articles", { method: "POST", body: { articles: [id + ":r" + held], limit: 20 }, timeoutMs: 4000 });
  } catch (error) {
    console.error("graphiti_article_lookup_failed", error);
    return emptyGraph("unavailable");
  }
}

export async function graphForEntity(uuid: string, time?: GraphTime) {
  if (!process.env.GRAPHITI_API_URL) return { entity: null, edges: [], status: "disabled" };
  try {
    const query = time ? `?as_of=${encodeURIComponent(time.asOf.toISOString())}&clock=${time.clock}` : "";
    return await graphiti<{ entity: {key:string;name:string;kind:string;summary?:string|null}|null; edges:Edge[]; status?: string }>(
      "/entities/" + encodeURIComponent(uuid) + query);
  } catch (error) {
    console.error("graphiti_entity_lookup_failed", error);
    return { entity: null, edges: [], status: "unavailable" };
  }
}

export type GraphChanges = {
  added: Graph & { count: number };
  ended: Graph & { count: number };
  newEntities: { count: number; items: Array<{ key: string; name: string }> };
  status?: string;
};

/** What Graphiti recorded in a window: relations added and ended, entities first seen. */
export async function graphChanges(since: Date, until: Date): Promise<GraphChanges> {
  const empty = (status: string): GraphChanges => ({ added: { count: 0, entities: 0, edges: [] }, ended: { count: 0, entities: 0, edges: [] }, newEntities: { count: 0, items: [] }, status });
  if (!process.env.GRAPHITI_API_URL) return empty("disabled");
  try {
    return await graphiti<GraphChanges>(`/changes?since=${encodeURIComponent(since.toISOString())}&until=${encodeURIComponent(until.toISOString())}`);
  } catch (error) {
    console.error("graphiti_changes_failed", error);
    return empty("unavailable");
  }
}

export async function graphStats() {
  if (!process.env.GRAPHITI_API_URL) return { entities: 0, relations: 0, episodes: 0, status: "disabled" };
  try { return await graphiti<{ entities:number; relations:number; episodes:number }>("/stats"); }
  catch (error) {
    console.error("graphiti_stats_failed", error);
    return { entities: 0, relations: 0, episodes: 0, status: "unavailable" };
  }
}

/** Authenticated future Ferro retrieval, without LlamaIndex or public embedding abuse. */
export async function graphSearch(text: string, limit: number) {
  return await graphiti<{ sources: Record<string,{name:string;url:string|null;title:string}>; facts: unknown[] }>("/search", {
    method: "POST", body: { text, limit }, timeoutMs: 30000,
  });
}


export async function graphOverview(): Promise<Graph> {
  if (!process.env.GRAPHITI_API_URL) return emptyGraph("disabled");
  try { return await graphiti<Graph>("/overview"); }
  catch (error) {
    console.error("graphiti_overview_failed", error);
    return emptyGraph("unavailable");
  }
}

export type GraphNetwork = {
  nodes: Array<{ key: string; name: string; articleIds: string[] }>;
  links: Array<{ id: string; source: string; target: string; predicate: string; invalidAt: string | null; articleIds: string[] }>;
  truncated: boolean;
  status?: string;
};

export async function graphNetwork(): Promise<GraphNetwork> {
  const empty = (status: string): GraphNetwork => ({ nodes: [], links: [], truncated: false, status });
  if (!process.env.GRAPHITI_API_URL) return empty("disabled");
  try { return await graphiti<GraphNetwork>("/network"); }
  catch (error) { console.error("graphiti_network_failed", error); return empty("unavailable"); }
}

export async function graphRelation(key: string): Promise<Graph> {
  if (!process.env.GRAPHITI_API_URL) return emptyGraph("disabled");
  try { return await graphiti<Graph>("/relations/" + encodeURIComponent(key)); }
  catch (error) { console.error("graphiti_relation_failed", error); return emptyGraph("unavailable"); }
}

/** Lightweight entity candidates from Neo4j (not the full graph). */
export async function graphAtlasCenters(q: string, limit = 30) {
  if (!process.env.GRAPHITI_API_URL) return { nodes: [] as Array<{key:string;name:string;articleIds:string[]}>, status: "disabled" };
  try {
    return await graphiti<{nodes:Array<{key:string;name:string;articleIds:string[]}>;status?:string}>(
      "/atlas/centers?q=" + encodeURIComponent(q) + "&limit=" + limit, {timeoutMs: 5000});
  } catch (error) {
    console.error("graphiti_atlas_centers_failed", error);
    return {nodes: [], status: "unavailable"};
  }
}

