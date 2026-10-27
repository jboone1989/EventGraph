import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertSupportedConfig } from "../packages/backend/src/sources/config-keys.ts";

const { sources } = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8"));
const ids = ["rss-ustr-trade-policy", "rss-gcaptain-maritime", "rss-tass-english", "rss-yonhap-english"];
test("validated event-impact source pack is unique, future-gated and RSS-only", () => {
  assert.equal(new Set(sources.map((s: {id:string}) => s.id)).size, sources.length);
  for (const id of ids) {
    const row = sources.find((x: {id:string}) => x.id === id);
    assert.ok(row, id);
    assert.equal(row.kind, "rss", id);
    assert.doesNotThrow(() => assertSupportedConfig("rss", row.config), id);
    assert.equal(row.config.publishedAfter, "2026-10-01T00:00:00.000Z", id);
    assert.ok(row.config._aihot.initialBackfillLimit <= 2, id);
    assert.equal(row.site_fulltext, false, id);
    assert.equal(row.syndicate_fulltext, false, id);
  }
});
test("first-party policy and attributed viewpoint roles are distinct", () => {
  const ustr = sources.find((s: {id:string}) => s.id === ids[0]);
  const tass = sources.find((s: {id:string}) => s.id === ids[2]);
  assert.equal(ustr.tier, "T1");
  assert.equal(ustr.participation_mode, "editorial");
  assert.equal(tass.tier, "T2");
  assert.equal(tass.participation_mode, "hot_signal");
  assert.ok(tass.tags.includes("冲突当事方口径"));
});
test("T0 source chinanews world feed stays RSS summary-only", () => {
  const t0 = sources.find((s: {id:string}) => s.id === "rss-cn-chinanews-world");
  assert.ok(t0, "rss-cn-chinanews-world");
  assert.equal(t0.kind, "rss");
  assert.equal(t0.site_fulltext, false);
  assert.equal(t0.syndicate_fulltext, false);
});
