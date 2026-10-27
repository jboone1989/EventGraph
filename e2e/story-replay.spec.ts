// Run the real event replay component against the existing published-story seed.
// The test database gives the two source reports separate publication hours.
import { test, expect } from "@playwright/test";
import { open, samples } from "./site.ts";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const { story } = await samples(base);

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
});

test("report playback steps forward/backward, accepts keyboard scrubbing and autoplays", async ({ page }) => {
  // Production/development checks can run inside CI too; only the seeded CI job is strict.
  const seeded = process.env.E2E_SEEDED === "1";
  if (!story && !seeded) test.skip(true, "No published event is available");
  expect(story, "The seeded E2E job must publish a test event").toBeTruthy();
  await open(page, "/en/explore?story=" + encodeURIComponent(story!));

  const replay = page.getByRole("region", { name: "Event report playback" });
  await expect(replay).toBeVisible();
  const slider = replay.getByRole("slider");
  const last = Number(await slider.getAttribute("max"));
  if (last < 1 && !seeded) test.skip(true, "The live event has only one publication stage");
  expect(last, "CI must create at least two distinct report timestamps").toBeGreaterThanOrEqual(1);
  // Explorer intentionally opens on the latest discovered stage. Rewind before
  // exercising the timeline's forward/backward and autoplay controls.
  await expect(slider).toHaveValue(String(last));
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  const firstDate = await replay.locator("time").first().getAttribute("dateTime");
  const firstCount = Number(await replay.locator("dl dd").first().innerText());
  const firstReports = await replay.locator("ul li").allTextContents();

  await replay.getByRole("button", { name: /Next/ }).click();
  await expect(slider).toHaveValue("1");
  const nextDate = await replay.locator("time").first().getAttribute("dateTime");
  expect(nextDate).not.toBe(firstDate);
  expect(Number(await replay.locator("dl dd").first().innerText())).toBeGreaterThan(firstCount);
  expect(await replay.locator("ul li").allTextContents()).not.toEqual(firstReports);

  await replay.getByRole("button", { name: /Previous/ }).click();
  await expect(slider).toHaveValue("0");
  await expect(replay.locator("time").first()).toHaveAttribute("dateTime", firstDate!);

  // The HTML range input is keyboard-operable on desktop and phones.
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveValue(String(last));
  await expect(replay.getByRole("button", { name: /Next/ })).toBeDisabled();
  await slider.press("Home");
  await expect(slider).toHaveValue("0");

  await replay.getByRole("button", { name: /Play/ }).click();
  await expect.poll(async () => Number(await slider.inputValue()), {
    message: "Autoplay advances to the next published report stage",
    timeout: 5_000,
  }).toBeGreaterThan(0);
});
