import { test, expect } from "@playwright/test";
import { open, samples, expectNoOverflow } from "./site.ts";

const seeded = await samples(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000");

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test("impact evidence reuses the event time cutoff and renders four honest categories " + viewport.width, async ({ page }) => {
    test.skip(!seeded.story, "No public event available");
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
    await open(page, "/en/explore?story=" + seeded.story);
    if (viewport.width < 640) {
      const impactTab = page.getByRole("tab", { name: "Impact leads", exact: true });
      await expect(impactTab).toBeVisible();
      await impactTab.click();
      await expect(impactTab).toHaveAttribute("aria-selected", "true");
    }
    const workbench = page.locator('[data-testid="impact-evidence"]');
    await expect(workbench).toBeVisible();
    await expect(workbench.locator("[data-impact-area]")).toHaveCount(4);
    await expect(workbench).toContainText("not proof of a policy action");
    await expect(workbench).toContainText("bounded");
    const slider = page.getByRole("region", { name: "Event report playback" }).getByRole("slider");
    if (await slider.count()) {
      await slider.focus();
      await slider.press("Home");
      await expect(workbench).toBeVisible();
    }
    await expectNoOverflow(page);
  });
}
