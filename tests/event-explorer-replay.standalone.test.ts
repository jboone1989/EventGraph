import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoryFactView } from "@aihot/contracts/site";
import { developmentsAt } from "../apps/web/app/features/story/replay.ts";

function fact(
  factId: string,
  firstReportAt: string,
  discoveredAt?: string,
): StoryFactView {
  return {
    factId,
    title: factId,
    firstReportAt,
    reportCount: 1,
    representative: {
      id: factId,
      title: factId,
      summary: null,
      source: { name: "Test source", firstParty: false },
      publishedAt: firstReportAt,
      ...(discoveredAt ? { discoveredAt } : {}),
      selected: false,
    },
  };
}

test("known-time progress only includes developments discovered by the cutoff", () => {
  const rows = [
    fact("early", "2026-10-19T08:00:00Z", "2026-10-19T09:00:00Z"),
    fact("late-discovery", "2026-10-19T07:00:00Z", "2026-10-19T11:00:00Z"),
    fact("unknown-discovery", "2026-10-19T07:30:00Z"),
  ];

  assert.deepEqual(
    developmentsAt(rows, "2026-10-19T10:00:00Z", "known").map(row => row.factId),
    ["early"],
  );
});

test("valid-time progress follows first-report time even if the system discovered it later", () => {
  const rows = [
    fact("known-early", "2026-10-19T08:00:00Z", "2026-10-19T09:00:00Z"),
    fact("reported-early-discovered-late", "2026-10-19T07:00:00Z", "2026-10-19T11:00:00Z"),
    fact("missing-discovery", "2026-10-19T09:30:00Z"),
    fact("reported-later", "2026-10-19T12:00:00Z", "2026-10-19T12:05:00Z"),
  ];

  assert.deepEqual(
    developmentsAt(rows, "2026-10-19T10:00:00Z", "valid").map(row => row.factId),
    ["reported-early-discovered-late", "known-early", "missing-discovery"],
  );
});

test("historical progress does not guess when the cutoff or its clock timestamp is invalid", () => {
  const rows = [fact("row", "2026-10-19T08:00:00Z", "2026-10-19T09:00:00Z")];

  assert.deepEqual(developmentsAt(rows, undefined, "known"), []);
  assert.deepEqual(developmentsAt(rows, "not-a-date", "valid"), []);
});
