import assert from "node:assert/strict";
import { test } from "node:test";
import { discussionTermFor } from "../app/lib/discussions.ts";

const id = "4b6afb0b-f347-4289-81dd-e3ed2e92ffd8";
test("story editions and grouped news pages share one stable discussion term", () => {
  const term = discussionTermFor(id);
  assert.equal(term, "eventgraph:story:" + id);
  assert.equal(discussionTermFor(id.toUpperCase()), term);
});
test("ungrouped or invalid stories never create orphan discussions", () => {
  for (const v of [null, "", "../../other-page", "not-a-uuid"]) assert.equal(discussionTermFor(v), null);
});
