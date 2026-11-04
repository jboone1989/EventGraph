import assert from "node:assert/strict";
import { test } from "node:test";
import { discussionTermFor, itemDiscussionTermFor } from "../app/lib/discussions.ts";

const id = "4b6afb0b-f347-4289-81dd-e3ed2e92ffd8";
test("story language editions share one event-level discussion term", () => {
  const term = discussionTermFor(id);
  assert.equal(term, "eventgraph:story:" + id);
  assert.equal(discussionTermFor(id.toUpperCase()), term);
});
test("ungrouped or invalid stories never create orphan discussions", () => {
  for (const v of [null, "", "../../other-page", "not-a-uuid"]) assert.equal(discussionTermFor(v), null);
});

test("every public news item uses its own discussion, independent of its Story", () => {
  const a = "1b6afb0b-f347-4289-81dd-e3ed2e92ffd8";
  const b = "2b6afb0b-f347-4289-81dd-e3ed2e92ffd8";
  assert.equal(itemDiscussionTermFor(a), "eventgraph:item:" + a);
  assert.notEqual(itemDiscussionTermFor(a), itemDiscussionTermFor(b));
  assert.notEqual(itemDiscussionTermFor(a), discussionTermFor(id));
  assert.equal(itemDiscussionTermFor(a.toUpperCase()), itemDiscussionTermFor(a));
});
test("invalid item keys cannot create arbitrary discussion terms", () => {
  for (const v of [null, "", "../story", "id/with/slash", "bad id"]) assert.equal(itemDiscussionTermFor(v), null);
});
