import assert from "node:assert/strict";
import { test } from "node:test";
import { groupingOverview, GROUPING_WARN_AFTER_MS } from "@aihot/backend/operations/grouping";

test("grouping admin backlog returns all selected news rather than silently trimming after 30", () => {
  const now = new Date("2026-11-06T13:00:00Z");
  const items = Array.from({ length: 113 }, (_, i) => ({
    articleId: `selected-${i + 1}`,
    title: `News ${i + 1}`,
    since: new Date(now.getTime() - GROUPING_WARN_AFTER_MS - 1000),
    failed: false,
    recovery: "automatic" as const,
    receiptId: null,
    error: null,
  }));
  const view = groupingOverview(items, now.getTime());
  assert.equal(view.waiting, 113);
  assert.equal(view.needsAttention, 113);
  assert.equal(view.items.length, view.waiting);
  assert.equal(view.items.at(-1)?.articleId, "selected-113");
});
