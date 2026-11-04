// A newly configured Chinese publisher must not leak into the English edition.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { EN_SOURCE_NAMES, englishSourceName, localizedSourceName, hasHan } from "../app/lib/english.ts";

test("all configured Chinese publisher names have specific verified English labels", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../../industry/sources.json", import.meta.url), "utf8"));
  const sources = manifest.sources as Array<{ id: string; name: string }>;
  const chinese = sources.filter(s => hasHan(s.name));
  assert.ok(chinese.length >= 18, "test should cover the published Chinese-source inventory");
  for (const source of chinese) {
    const translation = englishSourceName(source.name);
    assert.equal(translation, EN_SOURCE_NAMES[source.name],
      source.id + " must have a known publisher-specific English label, not a generic Publisher");
    assert.ok(!hasHan(translation), source.id + " leaked Han text in the English label");
    assert.notEqual(translation, "Untranslated source");
    assert.equal(localizedSourceName(source.name, "zh"), source.name,
      "Chinese readers retain the original official source name");
  }
});

test("unknown sources use their actual source website rather than inventing an English identity", () => {
  assert.equal(englishSourceName("新机构 · 快讯", "https://www.example.org/report/7"), "example.org");
  assert.equal(englishSourceName("新机构 · 快讯", "javascript:alert(1)"), "Untranslated source");
  assert.equal(englishSourceName("新机构 · 快讯"), "Untranslated source");
  assert.equal(englishSourceName("BBC World"), "BBC World");
  assert.equal(localizedSourceName("中国新闻网 · 财经", "en"), "China News Service · Finance");
  assert.equal(localizedSourceName("PANews · 中文快讯", "en"), "PANews · News Flashes");
});
