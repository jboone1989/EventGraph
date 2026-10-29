// The knowledge graph: the map draws when the graph has data, and an entity page lists its relations.
import { test, expect } from "@playwright/test";
import { open, samples } from "./site.ts";
import { publicGraphHasData, readSiteJSON, requireGraph, requireSeededRelation, seeded } from "./data.ts";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const stats = await readSiteJSON(base, "/api/site/knowledge/stats");
const { entity } = await samples(base);

test("the knowledge page opens on any graph state", async ({ page }) => {
  await open(page, "/knowledge");
});

test("the knowledge map draws the graph", async ({ page }) => {
  const overview = await readSiteJSON(base, "/api/site/knowledge/overview", seeded());
  const network = await readSiteJSON(base, "/api/site/knowledge/network", seeded());
  test.skip(!seeded() && !publicGraphHasData(stats, overview, network),
    `no publicly cited graph at this site (status ${stats?.status ?? "unknown"})`);
  requireGraph(stats, overview, network);
  if (seeded()) requireSeededRelation(overview, network, "e2e-python-feature", "e2e-python-3130");
  expect(overview.edges.every((edge: any) => edge.evidence?.length > 0)).toBe(true);
  await open(page, `/knowledge?entity=${encodeURIComponent(entity!)}`);
  const canvas = page.locator(".lr-atlas-canvas");
  await expect(canvas.locator("canvas").first()).toBeVisible();
  await expect(canvas).toHaveAttribute("data-rendered-nodes", /^[1-9]\d*$/);
  await expect(canvas).toHaveAttribute("data-rendered-pairs", /^[1-9]\d*$/);
});

test("an entity page lists relations that link on", async ({ page }) => {
  test.skip(!seeded() && !entity, "the graph has no relation to open");
  expect(entity, "a publicly evidenced entity is required").toBeTruthy();
  const profile = await readSiteJSON(base, `/api/site/knowledge/entities/${encodeURIComponent(entity!)}`, seeded());
  test.skip(!seeded() && (!profile?.edges?.length || !profile?.reports?.length),
    "the entity has no currently public cited relations");
  expect(profile.edges.length, "entity must have public relations").toBeGreaterThan(0);
  expect(profile.reports.length, "entity must have public source reports").toBeGreaterThan(0);
  await open(page, `/knowledge/entity/${encodeURIComponent(entity!)}`);
  expect(await page.locator('main a[href^="/knowledge"], main a[href^="/en/knowledge"]').count()).toBeGreaterThan(0);
});
