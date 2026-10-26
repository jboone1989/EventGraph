import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

// Regression guard for the existing pair/batch judge's shared relation vocabulary.
// This intentionally does not claim that a language model will always classify correctly.
const definitions = readFileSync(new URL("../industry/prompts/group-definitions.md", import.meta.url), "utf8");
const batch = readFileSync(new URL("../industry/prompts/group-batch.md", import.meta.url), "utf8");
const pair = readFileSync(new URL("../industry/prompts/group-pair.md", import.meta.url), "utf8");

test("same announced cohort in several outlets is one occurrence, regardless of report date", () => {
  assert.match(definitions, /不同媒体复述同一份已公布名单或同一批提交/);
  assert.match(definitions, /报道日期、语言/);
  assert.match(definitions, /相同数字但指向不同公告或不同参与者/);
});

test("later additions change the story, not the identity of an earlier occurrence", () => {
  assert.match(definitions, /9 增至 16、再到 22/);
  assert.match(definitions, /SAME_STORY/);
  assert.match(definitions, /当事方随后公开回应/);
});

test("both real grouping decisions share definitions rather than independent heuristics", () => {
  assert.match(batch, /\{\{> group-definitions\}\}/);
  assert.match(pair, /\{\{> group-definitions\}\}/);
  assert.match(batch, /\{\{> group-method\}\}/);
  assert.match(pair, /\{\{> group-method\}\}/);
});
