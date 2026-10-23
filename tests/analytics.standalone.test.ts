import { test } from "node:test";
import assert from "node:assert/strict";
import { validAnalyticsEvent } from "../apps/api/src/routes/analytics.ts";

const event = () => ({
  name: "graph_node_select", pageType: "knowledge", language: "en",
  sessionId: "3fca01ee-e019-4f38-a543-056f1246824a",
});
test("analytics accepts only typed, anonymous, bounded events", () => {
  assert.deepEqual(validAnalyticsEvent(event()), {
    ...event(), contentId: null, durationMs: null, referrerHost: null,
  });
  assert.ok(validAnalyticsEvent({ ...event(), name: "rss_open", pageType: "other" }));
  assert.equal(validAnalyticsEvent({ ...event(), name: "login_password" }), null);
  assert.equal(validAnalyticsEvent({ ...event(), pageType: "/items/private?token=abc" }), null);
  assert.equal(validAnalyticsEvent({ ...event(), language: "fr" }), null);
  assert.equal(validAnalyticsEvent({ ...event(), sessionId: "user@example.com" }), null);
  assert.equal(validAnalyticsEvent({ ...event(), contentId: "../secret" }), null);
  assert.equal(validAnalyticsEvent({ ...event(), referrerHost: "example.com/path?key=secret" }), null);
  assert.equal(validAnalyticsEvent({ ...event(), durationMs: -1 }), null);
  assert.equal(validAnalyticsEvent({ ...event(), durationMs: 999999 }), null);
  assert.equal(validAnalyticsEvent(null), null);
});
test("event contract only stores allowed properties", () => {
  const input = { ...event(), email: "never@example.com", searchTerm: "private", url: "/test?secret" };
  const result = validAnalyticsEvent(input)!;
  assert.ok(result);
  assert.equal("email" in result, false);
  assert.equal("searchTerm" in result, false);
  assert.equal("url" in result, false);
});
