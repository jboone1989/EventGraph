// The atlas interaction contract runs on every CI build without Graphiti or Neo4j.
// Mock only the client-side graph API: real React, Cytoscape, routing and evidence UI still run.
import { test, expect, type Page } from "@playwright/test";
import { open } from "./site.ts";

const alpha = { key: "e2e-alpha", name: "E2E Alpha", degree: 2 };
const beta = { key: "e2e-beta", name: "E2E Beta", degree: 3 };
const gamma = { key: "e2e-gamma", name: "E2E Gamma", degree: 1 };
const nodes = [alpha, beta, gamma];
const links = [
  { id: "e2e-fact-1", source: alpha.key, target: beta.key, predicate: "SUPPORTS", invalidAt: null },
  { id: "e2e-fact-2", source: beta.key, target: alpha.key, predicate: "PUBLISHES", invalidAt: null },
  { id: "e2e-fact-3", source: beta.key, target: gamma.key, predicate: "USES", invalidAt: null },
];
const entity = (node: typeof alpha) => ({ key: node.key, name: node.name, kind: "organization" });
const evidence = (id: string, source: string) => ({
  articleId: id,
  url: "https://example.com/e2e/" + id,
  source,
  quote: "Original published record",
  publishedAt: "2026-10-12T09:00:00.000Z",
});
const facts = [
  { id: links[0].id, subject: entity(alpha), object: entity(beta), predicate: "SUPPORTS",
    fact: "E2E Alpha supports E2E Beta.", validAt: "2026-10-12T09:00:00.000Z", invalidAt: null,
    evidence: [evidence("report-one", "Primary Lab")] },
  { id: links[1].id, subject: entity(beta), object: entity(alpha), predicate: "PUBLISHES",
    fact: "E2E Beta publishes an independent response.", validAt: "2026-10-13T09:00:00.000Z", invalidAt: null,
    evidence: [evidence("report-two", "Research Wire")] },
  { id: links[2].id, subject: entity(beta), object: entity(gamma), predicate: "USES",
    fact: "E2E Beta uses E2E Gamma.", validAt: "2026-10-14T09:00:00.000Z", invalidAt: null,
    evidence: [evidence("report-three", "Research Wire")] },
];

async function mockPublicGraph(page: Page, failFirstNeighborhood = false) {
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  let alphaAttempts = 0;
  await page.route(/\/api\/site\/knowledge\/centers(?:\?|$)/, async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q")?.trim().toLowerCase() ?? "";
    await route.fulfill({ json: { nodes: nodes.filter((n) => n.name.toLowerCase().includes(q)), status: "ok" } });
  });
  await page.route(/\/api\/site\/knowledge\/neighborhood\/[^/?]+/, async (route) => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) ?? "");
    if (key === alpha.key && failFirstNeighborhood && alphaAttempts++ === 0) {
      await route.fulfill({ status: 503, json: { status: "unavailable" } });
      return;
    }
    const related = key === alpha.key ? [alpha, beta] : key === beta.key ? [beta, gamma] : [gamma, beta];
    const selected = new Set(related.map((n) => n.key));
    await route.fulfill({ json: { nodes: related, links: links.filter((l) => selected.has(l.source) && selected.has(l.target)), truncated: false, status: "ok" } });
  });
  await page.route(/\/api\/site\/knowledge\/entities\/[^/?]+/, async (route) => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) ?? "");
    await route.fulfill({ json: { entity: entity(nodes.find((n) => n.key === key) ?? alpha),
      entities: 3, edges: facts.filter((f) => f.subject.key === key || f.object.key === key), status: "ok" } });
  });
}

async function focusAlpha(page: Page) {
  await open(page, "/knowledge");
  await page.locator(".lr-atlas-node-row").filter({ hasText: alpha.name }).click();
  await expect(page).toHaveURL(/\?entity=e2e-alpha$/);
  await expect(page.locator(".lr-atlas-canvas")).toHaveAttribute("aria-label", /2 entities, 2 relations/);
}

test("atlas groups directed facts, opens evidence and expands without losing the focus", async ({ page }) => {
  await mockPublicGraph(page);
  await focusAlpha(page);
  const connection = page.locator(".lr-atlas-connection");
  await expect(connection).toHaveCount(1); // two directed assertions, one visual pair
  await expect(connection).toContainText("2 facts");
  await connection.getByRole("button", { name: /Facts/ }).click();
  const factsPanel = page.getByRole("region", { name: "All facts and sources for this connection" });
  await expect(factsPanel.getByTestId("atlas-pair-facts").locator("article")).toHaveCount(2);
  await expect(factsPanel).toContainText("Primary Lab");
  await expect(factsPanel).toContainText("Research Wire");
  await expect(factsPanel.locator("a[data-analytics-event='source_open']")).toHaveCount(2);
  await page.getByRole("button", { name: "Expand view" }).click();
  await expect(page.locator(".lr-atlas")).toHaveClass(/is-expanded/);
  await expect(page.locator(".lr-atlas-canvas")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".lr-atlas")).not.toHaveClass(/is-expanded/);
  await expect(page).toHaveURL(/\?entity=e2e-alpha$/);
});

test("atlas traverses nearby entities, keeps explored links and supports previous and directory", async ({ page }) => {
  await mockPublicGraph(page);
  await focusAlpha(page);
  await page.locator(".lr-atlas-connection").getByRole("button", { name: /E2E Beta/ }).click();
  await expect(page).toHaveURL(/\?entity=e2e-beta$/);
  await expect(page.locator(".lr-atlas-canvas")).toHaveAttribute("aria-label", /3 entities, 3 relations/);
  await expect(page.locator(".lr-atlas-connection")).toHaveCount(2);
  await page.getByRole("button", { name: "Previous entity" }).click();
  await expect(page).toHaveURL(/\?entity=e2e-alpha$/);
  await expect(page.locator(".lr-atlas-canvas")).toHaveAttribute("aria-label", /3 entities, 3 relations/);
  await page.reload();
  await expect(page).toHaveURL(/\?entity=e2e-alpha$/);
  await expect(page.locator(".lr-atlas-canvas")).toHaveAttribute("aria-label", /2 entities, 2 relations/);
  await page.getByRole("button", { name: "Directory" }).click();
  await expect(page).toHaveURL(/\/knowledge$/);
  await expect(page.locator(".lr-atlas-node-row")).toHaveCount(3);
});

test("failed neighborhood request exposes retry and recovers without a full page reload", async ({ page }) => {
  await mockPublicGraph(page, true);
  await open(page, "/knowledge");
  await page.locator(".lr-atlas-node-row").filter({ hasText: alpha.name }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to load entity relationships");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".lr-atlas-canvas")).toHaveAttribute("aria-label", /2 entities, 2 relations/);
  await expect(page).toHaveURL(/\?entity=e2e-alpha$/);
});
