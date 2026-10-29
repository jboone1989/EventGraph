import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { readSiteJSON, requireGraph, requireSamples } from "../e2e/data.ts";

for (const path of ["/api/site/timeline", "/api/site/hot", "/api/site/reports/daily/latest-page", "/api/site/topics", "/api/site/knowledge/overview"]) {
  for (const mode of ["500", "invalid JSON"]) test(`${path} rejects ${mode} in seeded reads`, async () => {
    const server = createServer((_, res) => { res.writeHead(mode === "500" ? 500 : 200); res.end("invalid"); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
      await assert.rejects(readSiteJSON(base, path, true), (error: Error) => error.message.startsWith(`${path}: required E2E API read failed`) && (mode !== "500" || error.message.includes("HTTP 500")));
      assert.equal(await readSiteJSON(base, path, false), null);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
}

test("unreachable API fails with the endpoint", async () => {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  await new Promise<void>(resolve => server.close(() => resolve()));
  await assert.rejects(readSiteJSON(base, "/api/site/knowledge/stats", true), /knowledge\/stats/);
});

test("every required sample is nonempty; optional deployments may be empty", () => {
  const complete = { item: "a", story: "b", daily: "c", topic: "d", entity: "e" };
  requireSamples(complete, true);
  for (const key of Object.keys(complete)) assert.throws(() => requireSamples({ ...complete, [key]: undefined }, true), new RegExp(`missing required ${key}`));
  requireSamples({}, false);
});

test("nonzero stats cannot hide unavailable or empty public graph responses", () => {
  const stats = { entities: 2, relations: 1 };
  const overview = { edges: [{ id: "edge" }] };
  const network = { nodes: [{ key: "entity" }], links: [{ id: "edge" }] };
  requireGraph(stats, overview, network);
  for (const status of ["disabled", "unavailable"]) {
    assert.throws(() => requireGraph({ ...stats, status }, overview, network), /stats/);
    assert.throws(() => requireGraph(stats, { ...overview, status }, network), /overview/);
    assert.throws(() => requireGraph(stats, overview, { ...network, status }), /network/);
  }
  assert.throws(() => requireGraph(stats, { edges: [] }, network), /overview/);
  assert.throws(() => requireGraph(stats, overview, { nodes: [], links: [] }), /network/);
});
