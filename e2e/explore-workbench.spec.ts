// The standalone /explore workbench: a discoverable entry from the site shell, deep links that
// restore the shared time state, and honest answers when the event or the graph service is gone.
import {test, expect} from "@playwright/test";
import {open, samples, watch} from "./site.ts";
import {buildReplayFrames} from "../apps/web/app/features/story/replay.ts";

const seeded = await samples(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000");

test("the workbench is reachable from the sidebar and lists real events", async ({page}) => {
  test.skip(!seeded.story, "No public event available");
  const problems = watch(page);
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  await open(page, "/en/explore");
  await expect(page.getByRole("heading", {name: "Event explorer"})).toBeVisible();
  // The sidebar entry exists where the sidebar exists (desktop); the phone reaches the page
  // through the More screen and the knowledge page.
  const sidebar = page.getByRole("navigation", {name: "Main navigation"});
  if (await sidebar.isVisible()) await expect(sidebar.getByRole("link", {name: "Explorer"})).toHaveAttribute("href", "/explore");
  // The landing offers the site's real events, including the seeded one, not invented ones.
  await expect(page.locator(`a[href="/en/explore?story=${seeded.story}"]`).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test("a deep link restores the clock and the as-of cutoff", async ({page}) => {
  test.skip(!seeded.story, "No public event available");
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  const story = await (await page.request.get("/api/site/stories/" + seeded.story)).json();
  const frames = buildReplayFrames(story.timeline ?? [], "published");
  test.skip(frames.length < 2, "The seeded event has a single publication frame");
  const cutoff = frames[0]!.publishedAt;
  const graphRequests: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.includes("/api/site/knowledge/stories/")) graphRequests.push(req.url());
  });
  await open(page, `/en/explore?story=${seeded.story}&clock=valid&asOf=${encodeURIComponent(cutoff)}`);
  const valid = page.getByRole("button", {name: "Valid time"});
  await expect(valid).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => graphRequests.some((url) => url.includes("clock=valid") && url.includes(`asOf=${encodeURIComponent(cutoff)}`))).toBe(true);
  // Moving in time keeps the URL a shareable deep link.
  await valid.click();
  await page.getByRole("button", {name: "Recorded-time reconstruction"}).click();
  await expect.poll(() => page.url()).toContain("clock=known");
});

test("an unknown event id answers 404", async ({page}) => {
  const res = await page.goto("/explore?story=e2e-no-such-event");
  expect(res?.status()).toBe(404);
});

test("a late stale graph answer never replaces the newer time state", async ({page}) => {
  test.skip(!seeded.story, "No public event available");
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  const person = (key: string) => ({key, name: "E2E " + key, kind: "organization"});
  const evidence = (id: string) => ({articleId: id, url: "https://example.com/" + id,
    source: "Recorded Lab", quote: "Source record", publishedAt: "2026-10-19T08:00:00Z"});
  const edge = (id: string, a: string, b: string) => ({id, subject: person(a), object: person(b),
    predicate: "REPORTED", fact: `E2E ${a} reported E2E ${b}.`, validAt: null, invalidAt: null,
    evidence: [evidence(id)]});
  page.route(/\/api\/site\/knowledge\/stories\/[^?]+\?/, async (route) => {
    const clock = new URL(route.request().url()).searchParams.get("clock");
    if (clock === "known") await new Promise((r) => setTimeout(r, 1200)); // the first answer is slow
    const edges = clock === "known" ? [edge("p1", "Alpha", "Beta"), edge("p2", "Beta", "Gamma")] : [edge("p1", "Alpha", "Beta")];
    await route.fulfill({json: {entities: edges.length + 1, edges, temporalSupport: "bitemporal-v1", fidelity: "bounded"}});
  });
  const problems = watch(page);
  await open(page, `/en/explore?story=${seeded.story}`);
  const graphTab = page.getByRole("tab", {name: "Relations", exact: true});
  if (await graphTab.isVisible()) await graphTab.click();
  // The valid-time answer (fast) renders while the initial known-time answer is still in flight.
  await page.getByRole("button", {name: "Valid time"}).click();
  const canvas = page.locator(".lr-atlas-canvas");
  await expect(canvas).toHaveAttribute("data-rendered-nodes", "2");
  // When the stale answer finally lands, it must not repaint the older, larger graph.
  await page.waitForTimeout(1600);
  await expect(canvas).toHaveAttribute("data-rendered-nodes", "2");
  await expect(canvas).toHaveAttribute("aria-label", /2 entities/);
  expect(problems).toEqual([]);
});

test("the story page links into the standalone workbench with its event", async ({page}) => {
  test.skip(!seeded.story, "No public event available");
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  await open(page, "/en/story/" + seeded.story);
  const entry = page.getByRole("link", {name: /Open in the standalone explorer/}).first();
  await expect(entry).toBeVisible();
  expect(await entry.getAttribute("href")).toContain(`/en/explore?story=${seeded.story}`);
  await entry.click();
  await expect(page).toHaveURL(new RegExp(`/en/explore\\?story=${seeded.story}`));
  await expect(page.getByRole("region", {name: "Event Explorer"})).toBeVisible();
});

test("the workbench itself does not link back to itself as the standalone explorer", async ({page}) => {
  test.skip(!seeded.story, "No public event available");
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  await open(page, `/en/explore?story=${seeded.story}`);
  await expect(page.getByRole("region", {name: "Event Explorer"})).toBeVisible();
  await expect(page.getByRole("link", {name: /Open in the standalone explorer/})).toHaveCount(0);
});

test("a deep link before the earliest frame says earlier material cannot be restored", async ({page}) => {
  test.skip(!seeded.story, "No public event available");
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  const story = await (await page.request.get("/api/site/stories/" + seeded.story)).json();
  const frames = buildReplayFrames(story.timeline ?? [], "known");
  test.skip(frames.length < 1, "No playable frames");
  const early = new Date(Date.parse(frames[0]!.publishedAt) - 86_400_000).toISOString();
  await open(page, `/en/explore?story=${seeded.story}&clock=known&asOf=${encodeURIComponent(early)}`);
  await expect(page.getByText("Earlier material cannot be restored")).toBeVisible();
});

test("the workbench degrades clearly when the graph service is offline", async ({page}) => {
  test.skip(!seeded.story, "No public event available");
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  await page.route(/\/api\/site\/knowledge\/stories\/[^?]+\?/, (route) =>
    route.fulfill({status: 503, json: {status: "unavailable"}}));
  await open(page, `/en/explore?story=${seeded.story}`);
  const graphTab = page.getByRole("tab", {name: "Relations", exact: true});
  if (await graphTab.isVisible()) await graphTab.click();
  await expect(page.getByText("Historical graph unavailable; no present-day graph substituted.")).toBeVisible();
});

// Entity mode: the same workbench time state drives a focused atlas of one entity's public
// relations (searched, not guessed), with one-hop growth, pair facts and predicate filters.
const entity = (key: string, name: string) => ({key, name, kind: "organization"});
const stubGraphiti = (page: import("@playwright/test").Page) => {
  page.route(/\/api\/site\/knowledge\/centers\?/, (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    const hit = ["Alpha", "Beta", "Gamma"].filter((n) => n.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
    return route.fulfill({json: {nodes: hit.map((n) => ({key: "e2e-" + n.toLowerCase(), name: n, degree: 3}))}});
  });
  page.route(/\/api\/site\/knowledge\/neighborhood\/[^/]+$/, (route) => route.fulfill({json: {
    entity: {key: "e2e-alpha", name: "Alpha", kind: "organization"},
    nodes: [entity("e2e-alpha", "Alpha"), entity("e2e-beta", "Beta"), entity("e2e-gamma", "Gamma")],
    links: [
      {id: "r-uses", source: "e2e-alpha", target: "e2e-beta", predicate: "USES", invalidAt: null},
      {id: "r-works", source: "e2e-gamma", target: "e2e-alpha", predicate: "WORKS_FOR", invalidAt: null},
    ],
  }}));
  page.route(/\/api\/site\/knowledge\/entities\/[^/]+$/, (route) => route.fulfill({json: {
    entity: {key: "e2e-alpha", name: "Alpha", kind: "organization"},
    edges: [{id: "r-uses", subject: entity("e2e-alpha", "Alpha"), object: entity("e2e-beta", "Beta"), predicate: "USES",
      fact: "Alpha uses Beta.", validAt: null, invalidAt: null,
      evidence: [{articleId: "a1", url: "https://example.com/a1", source: "Wire", quote: "q", publishedAt: "2026-10-01T00:00:00Z"}]}],
  }}));
};

test("an entity deep link opens the focused atlas inside the workbench", async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  stubGraphiti(page);
  const problems = watch(page);
  await open(page, "/en/explore?entity=e2e-alpha");
  await expect(page.getByRole("region", {name: "Entity relationship explorer"})).toBeVisible();
  const canvas = page.locator(".lr-atlas-canvas");
  await expect(canvas).toHaveAttribute("data-rendered-nodes", "3");
  // The focused canvas is one hop around the center, never the whole graph.
  await expect(canvas).toHaveAttribute("aria-label", /3 entities/);
  // Searching picks a center and stays inside the workbench.
  await page.getByRole("textbox", {name: "Search entities"}).fill("beta");
  await page.getByRole("button", {name: /Beta/}).first().click();
  await expect(page).toHaveURL(/\/en\/explore\?entity=e2e-beta/);
  await expect(canvas).toBeVisible();
  expect(problems).toEqual([]);
});

test("entity exploration honors the shared time state", async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  const scoped: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith("/api/site/knowledge/neighborhood/")) scoped.push(url.search);
  });
  stubGraphiti(page);
  const problems = watch(page);
  await open(page, "/en/explore?entity=e2e-alpha");
  await expect(page.locator(".lr-atlas-canvas")).toBeVisible();
  // A cutoff scopes the entity's relations, and the URL stays a shareable deep link.
  const cutoff = "2026-10-15T16:35";
  await page.getByLabel("As-of time").fill(cutoff);
  const expected = new Date(cutoff).toISOString();
  await expect.poll(() => scoped.some((s) => s.includes("clock=known") && s.includes("asOf=" + encodeURIComponent(expected)))).toBe(true);
  await expect(page).toHaveURL(/asOf=/);
  // The clock buttons are the same time semantics the story view uses: the same cutoff re-reads.
  await page.getByRole("button", {name: "Valid time"}).click();
  await expect.poll(() => scoped.some((s) => s.includes("clock=valid") && s.includes("asOf=" + encodeURIComponent(expected)))).toBe(true);
  await expect(page).toHaveURL(/clock=valid/);
  // Back to latest returns to the current, unscoped view (the clock choice is kept).
  await page.getByRole("button", {name: "Back to latest"}).click();
  await expect(page).toHaveURL(/entity=e2e-alpha/);
  await expect(page).not.toHaveURL(/asOf=/);
  expect(problems).toEqual([]);
});

test("predicate filters narrow the focused canvas", async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  stubGraphiti(page);
  const problems = watch(page);
  await open(page, "/en/explore?entity=e2e-alpha");
  const canvas = page.locator(".lr-atlas-canvas");
  await expect(canvas).toHaveAttribute("data-rendered-nodes", "3");
  const uses = page.getByRole("button", {name: /USES/});
  await expect(uses).toBeVisible();
  await uses.click();
  await expect(canvas).toHaveAttribute("data-rendered-nodes", "2");
  await expect(canvas).toHaveAttribute("aria-label", /1 relations/);
  await uses.click();
  await expect(canvas).toHaveAttribute("data-rendered-nodes", "3");
  expect(problems).toEqual([]);
});
