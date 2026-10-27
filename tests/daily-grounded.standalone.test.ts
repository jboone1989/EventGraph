// grounded(): the overview guard accepts the Chinese spelling of a magnitude the items write Latin
// (104B → 1040亿, 1M → 100万) and nothing else. The case is real: on 2026-10-26 the dev writer returned
// a completed overview whose only ungrounded-looking figures were 104B→1040亿 and 1M token→100万词元,
// and the whole overview was discarded (receipt 14131, generator.written=false).
import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { grounded } from "@aihot/backend/reports/compose";

const CORPUS = "Moonshot 发布 Kimi K3.1 Pro，采用 2.8T 总参数、104B 激活参数的 MoE 架构，支持 1M token 上下文。";

test("the Chinese spelling of the corpus's own Latin magnitude is grounded", () => {
  const overview = "Moonshot 发布 Kimi K3.1 Pro，采用 2.8万亿总参数、1040亿激活参数的混合专家架构，支持 100万词元上下文。";
  assert.equal(grounded(overview, CORPUS), true);
});

test("a different magnitude is still ungrounded", () => {
  const overview = "Moonshot 发布 Kimi K3.1 Pro，采用 2.8万亿总参数、940亿激活参数的混合专家架构。";
  assert.equal(grounded(overview, CORPUS), false);
});

test("an unrelated figure stays ungrounded", () => {
  assert.equal(grounded("Moonshot 发布 Kimi K3.1 Pro，融资 845 亿美元。", CORPUS), false);
});

test("a unit the corpus never wrote is not whitelisted", () => {
  // 500MB is megabytes: the M is not a magnitude, so 5000万 (or 50000) must stay ungrounded.
  assert.equal(grounded("Stub 披露 5000万条记录。", "Stub 存储达到 500MB。"), false);
});

test("decimals convert exactly", () => {
  assert.equal(grounded("Stub 融资 15亿美元。", "Stub raised $1.5B."), true);
  assert.equal(grounded("Stub 融资 5亿美元。", "Stub raised $0.5B."), true);
  assert.equal(grounded("Stub 融资 250万用户。", "Stub has 2.5M users."), true);
});
