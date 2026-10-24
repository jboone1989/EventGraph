import assert from "node:assert/strict";
import { test } from "node:test";
import { atlasPairKey, findEntities, groupAtlasPairs, uniqueAtlasFacts, mergeAtlasNetworks, neighborhood, temporalAtlasNetwork, type AtlasNetwork } from "../apps/web/app/lib/knowledge-atlas.ts";

const network: AtlasNetwork = {
  nodes: Array.from({ length: 2300 }, (_, i) => ({ key: String(i), name: i === 2299 ? "远处的公司 Remote Corp" : `Entity ${i}`, degree: i === 0 ? 2 : 1 })),
  links: Array.from({ length: 2298 }, (_, i) => ({ id: `e${i}`, source: String(i), target: String(i + 1), predicate: "RELATED_TO", invalidAt: null })),
  truncated: false,
};

test("atlas searches all 2,300 entities, including an isolated entity outside the recent sample", () => {
  assert.deepEqual(findEntities(network.nodes, "remote CORP").map(n => n.key), ["2299"]);
  assert.equal(findEntities(network.nodes, "远处")[0]?.key, "2299");
  assert.equal(findEntities(network.nodes, "").length, 2300);
  assert.strictEqual(neighborhood(network, null, 0), network);
  assert.equal(neighborhood(network, "0", 0).links.length, 2298);
});

test("one and two hops follow either direction without inventing connections", () => {
  assert.deepEqual(neighborhood(network, "100", 1).nodes.map(n => n.key), ["99", "100", "101"]);
  assert.deepEqual(neighborhood(network, "100", 2).nodes.map(n => n.key), ["98", "99", "100", "101", "102"]);
  assert.equal(neighborhood(network, "100", 2).links.length, 4);
  assert.deepEqual(neighborhood(network, "2299", 2).nodes.map(n => n.key), ["2299"]);
  assert.equal(neighborhood(network, "2299", 2).links.length, 0);
});

test("OMI, MSCI and Strategy keep only source-backed direct edges across exploration", () => {
  const omi = { key: "omi", name: "Omi", degree: 1 };
  const msci = { key: "msci", name: "MSCI", degree: 2 };
  const strategy = { key: "strategy", name: "Strategy", degree: 1 };
  const link = (id: string, source: string, target: string) => ({ id, source, target, predicate: "RELATES_TO", invalidAt: null });
  const first = { nodes: [omi, msci], links: [link("a", "omi", "msci")], truncated: false };
  const next = { nodes: [msci, strategy], links: [link("b", "msci", "strategy")], truncated: false };
  const result = mergeAtlasNetworks(first, next);
  assert.deepEqual(result.nodes.map(n => n.key), ["omi", "msci", "strategy"]);
  assert.deepEqual(result.links.map(l => l.id), ["a", "b"]);
  assert.equal(result.links.some(l => new Set([l.source, l.target]).has("omi") && new Set([l.source, l.target]).has("strategy")), false);
  assert.deepEqual(mergeAtlasNetworks(result, first).links.map(l => l.id), ["a", "b"]);
});

test("exploration preserves hundreds of source-backed relations without trimming or duplicating", () => {
  const one: AtlasNetwork = { nodes: network.nodes.slice(0, 101), links: network.links.slice(0, 100), truncated: false };
  const two: AtlasNetwork = { nodes: network.nodes.slice(100, 221), links: network.links.slice(100, 220), truncated: false };
  const joined = mergeAtlasNetworks(one, two);
  assert.equal(joined.nodes.length, 221);
  assert.equal(joined.links.length, 220);
  assert.equal(mergeAtlasNetworks(joined, two).links.length, 220);
});

test("one visual edge represents both directions while keeping every original fact", () => {
  const links = [
    {id:"a",source:"MSCI",target:"Strategy",predicate:"IDENTIFIED_FOR_EXCLUSION",invalidAt:null},
    {id:"b",source:"Strategy",target:"MSCI",predicate:"OPPOSED",invalidAt:null},
    {id:"c",source:"MSCI",target:"Strategy",predicate:"IDENTIFIES_FOR_DELETION",invalidAt:null},
    {id:"d",source:"Omi",target:"MSCI",predicate:"TRACKS",invalidAt:null},
  ];
  const pairs = groupAtlasPairs(links);
  assert.equal(pairs.length, 2);
  const msci = pairs.find(p=>p.key===atlasPairKey("MSCI","Strategy"));
  assert.ok(msci);
  assert.deepEqual(msci.links.map(l=>l.id), ["a","b","c"]);
  assert.equal(atlasPairKey("Strategy","MSCI"),atlasPairKey("MSCI","Strategy"));
  assert.equal(pairs.find(p=>p.key===atlasPairKey("Omi","MSCI"))?.links.length,1);
  assert.deepEqual(groupAtlasPairs(mergeAtlasNetworks({nodes:[],links:links.slice(0,2),truncated:false},
    {nodes:[],links:links.slice(1),truncated:false}).links).find(p=>p.key===msci.key)?.links.map(l=>l.id),["a","b","c"]);
});

test("identical statements combine sources, distinct predicates and directions do not", () => {
  const base = {subject:{key:"Strategy"},object:{key:"MSCI"},predicate:"OPPOSED",fact:"Opposed the rule",
    invalidAt:null,evidence:[{articleId:"a",url:"https://a"}]};
  const result = uniqueAtlasFacts([
    {...base,id:"a"},
    {...base,id:"b",fact:"  Opposed   the rule ",evidence:[{articleId:"b",url:"https://b"}]},
    {...base,id:"c",object:{key:"Other"}},
    {...base,id:"d",predicate:"ACCEPTED"},
  ]);
  assert.equal(result.length,3);
  assert.deepEqual(result[0].evidence.map(e=>e.articleId),["a","b"]);
  assert.equal(result[1].object.key,"Other");
  assert.equal(result[2].predicate,"ACCEPTED");
});

test("time-scoped Graphiti facts adapt to Cytoscape without guessing relations",()=>{
  const edge=(id:string,subject:string,object:string)=>({
    id,subject:{key:subject,name:subject},object:{key:object,name:object},
    predicate:"SUPPORTED_BY",invalidAt:null,
  });
  const early=temporalAtlasNetwork([edge("known-at-t1","AI","Company")]);
  const later=temporalAtlasNetwork([edge("known-at-t1","AI","Company"),
    edge("known-at-t2","Company","Market")]);
  assert.deepEqual(early.links.map(l=>l.id),["known-at-t1"]);
  assert.deepEqual(early.nodes.map(n=>n.key).sort(),["AI","Company"]);
  assert.equal(groupAtlasPairs(early.links).length,1);
  assert.deepEqual(neighborhood(later,"Company",1).links.map(l=>l.id),["known-at-t1","known-at-t2"]);
  // Rewinding never merges the newer network into the past.
  assert.deepEqual(temporalAtlasNetwork([edge("known-at-t1","AI","Company")]).links.map(l=>l.id),["known-at-t1"]);
});
