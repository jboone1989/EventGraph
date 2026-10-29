// Shared fail-closed reads for seeded CI; external sites may legitimately have no samples.
import assert from "node:assert/strict";

export const seeded = () => process.env.E2E_SEEDED === "1";

export async function readSiteJSON(base: string, path: string, required = seeded()) {
  try {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(20_000) });
    assert.ok(response.ok, `${path}: HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (required) throw new Error(`${path}: required E2E API read failed (${error instanceof Error ? error.message : String(error)})`, { cause: error });
    return null;
  }
}

export function requireSamples(samples: Record<string, unknown>, required = seeded()) {
  if (!required) return;
  const endpoints: Record<string, string> = {
    item: "/api/site/timeline", story: "/api/site/hot", daily: "/api/site/reports/daily/latest-page",
    topic: "/api/site/topics", entity: "/api/site/knowledge/overview",
  };
  for (const [key, path] of Object.entries(endpoints)) {
    assert.ok(typeof samples[key] === "string" && samples[key], `${path}: missing required ${key} sample`);
  }
}

export function requireGraph(stats: any, overview: any, network: any) {
  for (const [path, data] of [["stats", stats], ["overview", overview], ["network", network]] as const) {
    assert.ok(data && !["disabled", "unavailable"].includes(data.status), `/api/site/knowledge/${path}: graph unavailable`);
  }
  assert.ok(stats.entities > 0 && stats.relations > 0, "/api/site/knowledge/stats: empty graph");
  assert.ok(overview.edges?.length > 0, "/api/site/knowledge/overview: no public relations");
  assert.ok(network.nodes?.length > 0 && network.links?.length > 0, "/api/site/knowledge/network: no public graph");
}
