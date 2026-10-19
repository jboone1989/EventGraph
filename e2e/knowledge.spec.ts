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
  await open(page, "/knowledge/entity/" + encodeURIComponent(entity!));
  // A real deployment may have a named entity but no public neighbor. Do not treat that as a UI failure.
  await expect.poll(async () => (await page.locator(".lr-atlas-connection").count()) +
    (await page.locator(".lr-atlas-state").count())).toBeGreaterThan(0);
  const connection = page.locator(".lr-atlas-connection").first();
  test.skip(await connection.count() === 0, "This entity has no currently visible relation to traverse");
  const home = page.getByTestId("atlas-home");
  await expect(home).toBeVisible();
  await connection.getByRole("button").first().click();
  await expect.poll(() => new URL(page.url()).searchParams.get("entity")).not.toBe(entity);
  await home.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("entity")).toBe(entity);
  await expect(home).toBeVisible();
});
