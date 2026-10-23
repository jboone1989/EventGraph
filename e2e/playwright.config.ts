// Browser checks of a running site: every public page in Chinese and English, on a desktop and a phone.
// The site is not started here; point E2E_BASE_URL at it (CI's built site, a dev deploy, production).
//   E2E_BASE_URL=http://127.0.0.1:3000 npx playwright test -c e2e
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  outputDir: "../.data/e2e/results",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // A failure is a finding about the site, not something to retry until it passes.
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "../.data/e2e/report", open: "never" }], ["json", { outputFile: "../.data/e2e/results.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1365, height: 860 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
