import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoryReportView } from "@aihot/contracts/site";
import { explorerTimeState } from "../app/features/story/explore-state.ts";

function report(id: string, publishedAt: string, discoveredAt?: string): StoryReportView {
  return { id, publishedAt, discoveredAt, source: { name: id, firstParty: false }, selected: false,
    title: id, summary: null };
}

const timeline = [
  report("first", "2026-10-01T10:00:00Z", "2026-10-01T12:00:00Z"),
  report("second", "2026-10-03T10:00:00Z", "2026-10-03T12:00:00Z"),
  report("third", "2026-10-05T10:00:00Z", "2026-10-05T12:00:00Z"),
];

test("without parameters the workbench opens at the latest known frame", () => {
  const state = explorerTimeState(new URLSearchParams(""), timeline);
  assert.equal(state.clock, "known");
  assert.equal(state.position, 2);
  assert.equal(state.asOf, "2026-10-05T12:00:00Z");
});

test("a valid-time deep link selects the last frame published by the as-of time", () => {
  const state = explorerTimeState(new URLSearchParams("clock=valid&asOf=2026-10-04T00:00:00Z"), timeline);
  assert.equal(state.clock, "valid");
  assert.equal(state.position, 1);
  assert.equal(state.asOf, "2026-10-03T10:00:00Z");
});

test("a known-time deep link selects by discovery timestamps", () => {
  const state = explorerTimeState(new URLSearchParams("clock=known&asOf=2026-10-02T00:00:00Z"), timeline);
  assert.equal(state.clock, "known");
  assert.equal(state.position, 0);
  assert.equal(state.asOf, "2026-10-01T12:00:00Z");
});

test("unknown clock values fall back to the known clock", () => {
  assert.equal(explorerTimeState(new URLSearchParams("clock=yesterday"), timeline).clock, "known");
});

test("a malformed or impossible as-of falls back without crashing", () => {
  const garbage = explorerTimeState(new URLSearchParams("asOf=not-a-date"), timeline);
  assert.equal(garbage.position, 2);
  const before = explorerTimeState(new URLSearchParams("asOf=2020-01-01T00:00:00Z"), timeline);
  assert.equal(before.position, 0);
  const after = explorerTimeState(new URLSearchParams("asOf=2030-01-01T00:00:00Z"), timeline);
  assert.equal(after.position, 2);
});

test("an event without playable frames yields no cutoff", () => {
  const state = explorerTimeState(new URLSearchParams("clock=valid&asOf=2026-10-04T00:00:00Z"), [report("bad", "nope")]);
  assert.equal(state.asOf, null);
  assert.equal(state.position, 0);
});
