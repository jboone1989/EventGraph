import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { newsBodyDays, DEFAULT_NEWS_BODY_DAYS, MIN_NEWS_BODY_DAYS, MAX_NEWS_BODY_DAYS } from "@aihot/backend/operations/news-compaction";

test("ordinary news keeps full material only for a bounded 7–30 day period", () => {
  assert.equal(DEFAULT_NEWS_BODY_DAYS, 30);
  assert.equal(MIN_NEWS_BODY_DAYS, 7);
  assert.equal(MAX_NEWS_BODY_DAYS, 30);
  assert.equal(newsBodyDays(undefined), 30);
  assert.equal(newsBodyDays(""), 30);
  assert.equal(newsBodyDays("7"), 7);
  assert.equal(newsBodyDays("14"), 14);
  assert.equal(newsBodyDays("30"), 30);
  for (const invalid of ["0", "6", "31", "60", "1.5", "ten", "12 days"]) {
    assert.throws(() => newsBodyDays(invalid), /7 and 30/);
  }
});

test("daily compaction retains searchable identity, citations and selected research evidence", () => {
  const sql = [
    "../packages/backend/src/operations/news-compaction.ts",
    "../packages/backend/src/publication/compaction.ts",
  ].map(file => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
  const migration = readFileSync(new URL("../database/migrations/0086_article_compaction.sql", import.meta.url), "utf8");
  // Scope and preservation are expressed directly in the single DB query, not only in documentation.
  for (const clause of ["a.compacted_at IS NULL", "a.discovered_at <", "a.processing_state IN",
    "NOT p.selected", "NOT p.selection_candidate", "editorial_overrides",
    "selected_ledger", "story_digests", "FOR UPDATE OF a SKIP LOCKED"]) {
    assert.ok(sql.includes(clause), clause);
  }
  assert.ok(migration.includes("ADD COLUMN compacted_at"));
  assert.ok(sql.includes("body_text = NULL, body_html = NULL"));
  assert.ok(sql.includes("article_revisions SET body_text = NULL"));
  assert.ok(sql.includes("translations SET body_html = NULL, body_text = NULL"));
  assert.ok(sql.includes("pool_search SET body = ''"));
  assert.ok(!sql.includes("DELETE FROM articles"));
  assert.ok(!sql.includes("DELETE FROM publications"));
  assert.ok(!sql.includes("DELETE FROM facts"));
  assert.ok(sql.includes("p.channel = 'news'"));
  assert.ok(sql.includes("syndicate = false"));
  const material = readFileSync(new URL("../packages/backend/src/content/materials.ts", import.meta.url), "utf8");
  assert.match(material, /if \(existing!\.compacted_at\) return unchanged/);
});
