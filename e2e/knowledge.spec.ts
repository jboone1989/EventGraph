// The knowledge graph: the map draws when the graph has data, and an entity page lists its relations.
import { test, expect } from "@playwright/test";
import { open, samples } from "./site.ts";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const stats = await fetch(`${base}/api/site/knowledge/stats`).then((r) => r.json()).catch(() => null) as { entities?: number; relations?: number; status?: string } | null;
const { entity } = await samples(base);

test("the knowledge page opens on any graph state", async ({ page }) => {
  await open(page, "/knowledge");
});

test("the knowledge map draws the graph", async ({ page }) => {
  test.skip(!stats?.entities, `the graph is empty here (status ${stats?.status ?? "unknown"})`);
  await open(page, "/knowledge");
  await expect(page.locator(".lr-graph-canvas svg").first()).toBeVisible();
});

test("an entity page lists relations that link on", async ({ page }) => {
  test.skip(!entity, "the graph has no relation to open");
  await open(page, `/knowledge/entity/${encodeURIComponent(entity!)}`);
  expect(await page.locator('main a[href^="/knowledge"], main a[href^="/en/knowledge"]').count()).toBeGreaterThan(0);
});

test("entity profile keeps the atlas context and returns to its home entity", async ({ page }) => {
  test.skip(!entity, "Graphiti has no published entity; atlas interactions are covered by deterministic mocks");
  // Wait for the real client-side neighborhood response; the initial empty state is not evidence
  // that the graph lacks connections.
  const neighborhood = page.waitForResponse((r) =>
    r.url().includes("/api/site/knowledge/neighborhood/" + encodeURIComponent(entity!)));
  await open(page, "/knowledge/entity/" + encodeURIComponent(entity!));
  const response = await neighborhood;
  const graph = await response.json().catch(() => null) as {
    links?: Array<{ source: string; target: string }>;
  } | null;
  const hasNeighbor = response.ok() && !!graph?.links?.some((link) =>
    (link.source === entity || link.target === entity) && link.source !== link.target);
  test.skip(!hasNeighbor, "This entity has no reachable published neighbor");
  const connection = page.locator(".lr-atlas-connection").first();
  await expect(connection).toBeVisible();
  const home = page.getByTestId("atlas-home");
  await expect(home).toBeVisible();
  await connection.getByRole("button").first().click();
  await expect.poll(() => new URL(page.url()).searchParams.get("entity")).not.toBe(entity);
  await home.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("entity")).toBe(entity);
  await expect(home).toBeVisible();
});
