import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoryReportView } from "@aihot/contracts/site";
import { buildReplayFrames } from "../app/features/story/replay.ts";

function report(id: string, publishedAt: string, firstParty = false, sourceName = id): StoryReportView {
  return { id, publishedAt, source: { name: sourceName, firstParty }, selected: false,
    title: id, summary: null };
}

test("replay sorts without mutating input and hides later reports until their step", () => {
  const input = [report("late", "2026-10-05T10:00:00Z"), report("early", "2026-10-04T10:00:00Z", true)];
  const frames = buildReplayFrames(input);
  assert.deepEqual(input.map((r) => r.id), ["late", "early"]);
  assert.deepEqual(frames.map((f) => f.reports.map((r) => r.id)), [["early"], ["late"]]);
  assert.deepEqual(frames.map((f) => [f.total, f.firstParty, f.sources]), [[1, 1, 1], [2, 1, 2]]);
  assert.ok(!JSON.stringify(frames[0]).includes("late"));
});

test("reports with the same publication timestamp become one complete step", () => {
  const frames = buildReplayFrames([
    report("b", "2026-10-04T10:00:00Z", true, "Official"),
    report("a", "2026-10-04T10:00:00.000Z", false, "Press"),
    report("c", "2026-10-05T10:00:00Z", false, "Press"),
  ]);
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[0]?.reports.map((r) => r.id), ["a", "b"]);
  assert.deepEqual(frames.map((f) => [f.total, f.firstParty, f.sources]), [[2, 1, 2], [3, 1, 2]]);
});

test("invalid and empty dates are ignored", () => {
  assert.deepEqual(buildReplayFrames([report("bad", "not-a-date")]), []);
  assert.deepEqual(buildReplayFrames([]), []);
});
