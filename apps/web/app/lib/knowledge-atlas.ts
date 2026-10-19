export interface AtlasNode { key: string; name: string; degree: number }
export interface AtlasLink { id: string; source: string; target: string; predicate: string; invalidAt: string | null }
export interface AtlasNetwork { nodes: AtlasNode[]; links: AtlasLink[]; truncated: boolean; status?: string }

/** Undirected exploration keeps the original directed facts; no inferred edges are added. */
export function neighborhood(network: AtlasNetwork, key: string | null, hops: number): AtlasNetwork {
  if (!key || hops === 0) return network;
  const keys = new Set([key]);
  for (let i = 0; i < hops; i++) {
    const next = new Set(keys);
    for (const link of network.links) {
      if (keys.has(link.source)) next.add(link.target);
      if (keys.has(link.target)) next.add(link.source);
    }
    for (const k of next) keys.add(k);
  }
  return { ...network, nodes: network.nodes.filter(n => keys.has(n.key)), links: network.links.filter(l => keys.has(l.source) && keys.has(l.target)) };
}

export function findEntities(nodes: AtlasNode[], query: string) {
  const q = query.trim().toLocaleLowerCase();
  return nodes.filter(n => !q || n.name.toLocaleLowerCase().includes(q))
    .sort((a, b) => b.degree - a.degree || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

/** Repeated focused queries grow one factual graph; selection never discards known edges. */
export function mergeAtlasNetworks(previous: AtlasNetwork, incoming: AtlasNetwork): AtlasNetwork {
  const nodes = new Map(previous.nodes.map(n => [n.key, n]));
  for (const node of incoming.nodes) nodes.set(node.key, node);
  const links = new Map(previous.links.map(l => [l.id, l]));
  for (const link of incoming.links) links.set(link.id, link);
  return { nodes: [...nodes.values()], links: [...links.values()], truncated: false, status: incoming.status };
}

/** A visual connection is one unordered entity pair, never one row per fact. */
export interface AtlasPair { key: string; a: string; b: string; links: AtlasLink[] }
export function atlasPairKey(a: string, b: string): string {
  const [first, second] = a < b ? [a, b] : [b, a];
  return `pair:${first}:${second}`;
}
export function groupAtlasPairs(links: AtlasLink[]): AtlasPair[] {
  const result = new Map<string, AtlasPair>();
  for (const link of links) {
    const key = atlasPairKey(link.source, link.target);
    let pair = result.get(key);
    if (!pair) {
      const [a, b] = link.source < link.target ? [link.source, link.target] : [link.target, link.source];
      pair = { key, a, b, links: [] };
      result.set(key, pair);
    }
    pair.links.push(link);
  }
  return [...result.values()];
}

/** Combine only literally identical directed facts, preserving every source. */
export function uniqueAtlasFacts<T extends {
  subject: {key: string}; object: {key: string}; predicate: string;
  fact: string; invalidAt?: string | null;
  evidence: Array<{articleId: string; url: string}>;
}>(edges: T[]): T[] {
  const facts = new Map<string, T>();
  for (const edge of edges) {
    const key = [edge.subject.key, edge.object.key, edge.predicate,
      edge.fact.trim().replace(/\s+/g, " ").toLocaleLowerCase(), edge.invalidAt ?? ""].join("\u001f");
    const existing = facts.get(key);
    if (!existing) { facts.set(key, {...edge, evidence: [...edge.evidence]}); continue; }
    const seen = new Set(existing.evidence.map(e => e.articleId + "|" + e.url));
    for (const source of edge.evidence) {
      const id = source.articleId + "|" + source.url;
      if (!seen.has(id)) { existing.evidence.push(source); seen.add(id); }
    }
  }
  return [...facts.values()];
}

// Convert the Graphiti story's *already time-filtered* facts to the existing
// Cytoscape atlas format. This adapter never fetches today's neighborhood.
export function temporalAtlasNetwork(edges: readonly {
  id: string; subject: {key:string;name:string}; object: {key:string;name:string};
  predicate: string; invalidAt: string | null;
}[]): AtlasNetwork {
  const map = new Map<string, AtlasNode>();
  const links: AtlasLink[] = [];
  for (const edge of edges) {
    if (!edge.subject.key || !edge.object.key) continue;
    for (const entity of [edge.subject, edge.object]) {
      const old = map.get(entity.key);
      map.set(entity.key, {key:entity.key,name:entity.name,degree:(old?.degree??0)+1});
    }
    links.push({id:edge.id,source:edge.subject.key,target:edge.object.key,
      predicate:edge.predicate,invalidAt:edge.invalidAt});
  }
  return {nodes:[...map.values()].sort((a,b)=>b.degree-a.degree||a.key.localeCompare(b.key)),
    links, truncated:false};
}
