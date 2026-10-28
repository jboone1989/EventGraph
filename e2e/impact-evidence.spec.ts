import { test, expect } from "@playwright/test";
import { open, samples, expectNoOverflow } from "./site.ts";

const seeded = await samples(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000");

// Impact-tracing P1 (specs/event-impact-tracing-p1 §5/§7): the workbench's typed fact stations,
// station/lead evidence drawers, zero cross-layer edges, and route-only rendering when the
// knowledge graph is unavailable — in both editions and both widths, drawers included.
for (const edition of [{ lang: "en", path: "/en/explore?story=", impactTab: "Impact leads" },
  { lang: "zh", path: "/explore?story=", impactTab: "影响线索" }] as const) {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    test(`impact workbench renders stations, drawers and no cross-layer edges ${edition.lang} ${viewport.width}`, async ({ page }) => {
      test.skip(!seeded.story, "No public event available");
      await page.setViewportSize(viewport);
      if (edition.lang === "en") await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
      await open(page, edition.path + seeded.story);
      if (viewport.width < 640) {
        const impactTab = page.getByRole("tab", { name: edition.impactTab, exact: true });
        await expect(impactTab).toBeVisible();
        await impactTab.click();
        await expect(impactTab).toHaveAttribute("aria-selected", "true");
      }
      const workbench = page.locator('[data-testid="impact-evidence"]');
      await expect(workbench).toBeVisible();
      await expect(workbench.locator("[data-impact-area]")).toHaveCount(4);
      if (edition.lang === "en") {
        await expect(workbench).toContainText("not proof of a policy action");
        await expect(workbench).toContainText("cannot verify company exposure");
        await expect(workbench).toContainText("bounded");
      } else {
        await expect(workbench).toContainText("当前数据无法核实企业暴露或供应依赖");
      }

      // The typed fact-station list: layer badge, honest empty state, expandable source drawer.
      const stations = page.locator('[data-testid="impact-stations"]');
      await expect(stations).toBeVisible();
      const rows = stations.locator("[data-station-count] > li");
      const empty = edition.lang === "en" ? "No displayable fact station at this cutoff" : "没有可显示的事实站";
      if ((await rows.count()) === 0) await expect(stations).toContainText(empty);
      else {
        // Seeded story: exactly one station, unclassified (no dictionary hits).
        await expect(rows).toHaveCount(1);
        await expect(stations.locator("[data-layer]")).toContainText(
          edition.lang === "en" ? "Unclassified" : "未分类");
        const drawer = stations.locator("details").first();
        await drawer.locator("summary").click();
        await expect(drawer).toBeVisible();
        // The first version stays visible evidence (AC-2): revision null reads as the original.
        await expect(drawer).toContainText(edition.lang === "en" ? "Original / first version" : "原版 / Original");
        await expect(drawer).toContainText(edition.lang === "en" ? "Report-time only" : "仅报道时间");
        await expect(drawer).toContainText(edition.lang === "en" ? "Fact station" : "事实站");
        await expect(drawer.locator('a[data-analytics-event="source_open"]').first()).toHaveAttribute("href", /^https?:\/\//);
        await expect(drawer.getByRole("link", { name: edition.lang === "en" ? "Report page" : "本站报道页" }).first()).toHaveAttribute("href", /\/items\//);
        await drawer.locator("summary").click(); // closing must not overflow either
      }
      // AC-3: no arrows, connectors or graphs inside the station list — layers are reading groups.
      await expect(stations.locator("svg")).toHaveCount(0);
      await expect(stations).not.toContainText("→");
      await expect(stations).toContainText(edition.lang === "en" ? "No causal arrows" : "不画因果连线");

      const slider = page.getByRole("region", { name: /Event report playback|事件时间回放/ }).getByRole("slider");
      if (await slider.count()) {
        await slider.focus();
        await slider.press("Home");
        await expect(workbench).toBeVisible();
        await expect(stations).toBeVisible();
      }
      await expectNoOverflow(page);
    });
  }
}

// AC-2/N3: the seed links two reports published an hour apart to one station.
// The drawer must project only the source records visible at the selected cutoff.
test("station drawer source links follow the valid-time slider without future leakage", async ({ page }) => {
  test.skip(!seeded.story, "No public event available");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  await open(page, "/en/explore?story=" + seeded.story);
  await page.getByRole("button", { name: "Valid time", exact: true }).click();
  const slider = page.getByRole("region", { name: /Event report playback|事件时间回放/ }).getByRole("slider");
  const stations = page.locator('[data-testid="impact-stations"]');
  await slider.focus();
  await slider.press("Home");
  const drawer = stations.locator("details").first();
  await expect(drawer).toBeVisible();
  await drawer.locator("summary").click();
  await expect(drawer.locator('a[data-analytics-event="source_open"]')).toHaveCount(1);
  await slider.press("End");
  await expect(drawer.locator('a[data-analytics-event="source_open"]')).toHaveCount(2);
  await expectNoOverflow(page);
});

// AC-8: the impact workbench is route-only; a dead knowledge graph degrades without taking it down.
test("impact evidence renders without the knowledge graph", async ({ page }) => {
  test.skip(!seeded.story, "No public event available");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/site/knowledge/**", (route) => route.abort());
  await open(page, "/en/explore?story=" + seeded.story);
  const impactTab = page.getByRole("tab", { name: "Impact leads", exact: true });
  await impactTab.click();
  await expect(page.locator('[data-testid="impact-evidence"]')).toBeVisible();
  await expect(page.locator('[data-testid="impact-stations"]')).toBeVisible();
  // On a phone the graph panel itself is hidden behind the active tab; the honest fallback is still attached.
  await expect(page.getByText("Historical graph unavailable; no present-day graph substituted.")).toBeAttached();
  await expectNoOverflow(page);
});
