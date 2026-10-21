// The structured story route (EG-T17/T18): the panel's evidence link opens the same original
// source the route API serves, and the per-station jump lands the explorer on that moment.
import { test, expect } from "@playwright/test";
import { open, samples } from "./site.ts";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const { story } = await samples(base);

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
});

test("the route panel's evidence link and explorer jump match the route API", async ({ page }) => {
  test.skip(!story, "No published event is available");
  const route = await page.request.get(new URL(`/api/site/stories/${story}/route`, base).toString())
    .then((r) => (r.ok ? r.json() : null));
  test.skip(!route || route.status !== "ok" || route.stations.length === 0, "The seeded event has no station route");

  await open(page, "/story/" + encodeURIComponent(story!));
  const panel = page.getByRole("heading", { name: "Story route" });
  await expect(panel).toBeVisible();

  const first = route.stations[0];
  // 原文核查: the panel's evidence link is the same original URL the route API serves for station 1.
  const evidence = page.getByRole("link", { name: /Read original source/ }).first();
  await expect(evidence).toBeVisible();
  expect(new URL(await evidence.getAttribute("href").then((h) => h!)).href).toBe(new URL(first!.reports[0]!.url).href);

  // 端到端故事跳转: the station jump opens the standalone explorer at the station's recorded time.
  await page.getByRole("link", { name: "Replay this moment in the explorer" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/explore\\?story=${story}&clock=known&asOf=${encodeURIComponent(first!.timeRecorded)}`));
  await expect(page.getByRole("region", { name: /Event report playback|事件时间回放/ })).toBeVisible();
});
