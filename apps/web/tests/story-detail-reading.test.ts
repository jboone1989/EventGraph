import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Keep Story as a concise reading page; the detailed workbench is under /explore.
const story = readFileSync(new URL("../app/routes/story.tsx", import.meta.url), "utf8");

test("Story begins with its overview, not the research workbench", () => {
  assert.match(story, /id=\{SECTIONS\.overview\}[^\n]*className="order-1"/);
  assert.doesNotMatch(story, /<EventExplorer\s/);
  assert.match(story, /\/explore\?story=\$\{encodeURIComponent\(story\.publicId\)\}/);
});

test("The full report list keeps internal and original-source links", () => {
  assert.match(story, /<TimelineRow key=\{r\.id\} r=\{r\} station=\{stationByReportId\.get\(r\.id\)\}/);
  assert.match(story, /<IntentLink viewTransition to=\{lang === "en"/);
  assert.match(story, /href=\{r\.originalUrl\}[^\n]*target="_blank"/);
  assert.doesNotMatch(story, /完整来源索引（截至目前）/);
  assert.doesNotMatch(story, /story\.officialReports\.slice\(/);
});

test("Route uncertainty remains accessible without a second expanded timeline", () => {
  assert.match(story, /station\?\.uncertainty\.singleSource/);
  assert.match(story, /station\?\.uncertainty\.occurredAtMissing/);
  assert.match(story, /station\?\.uncertainty\.revised/);
  assert.match(story, /<details className="order-3/);
});
