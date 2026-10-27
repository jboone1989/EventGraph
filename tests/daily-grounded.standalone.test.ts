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

test("a number inside a larger or glued form is not a magnitude", () => {
  assert.equal(grounded("Stub 融资 400亿美元。", "Stub raised $1,040B."), false); // only 040B would match, and it no longer does
  assert.equal(grounded("Stub 出货 100万台。", "Stub 发布 X1M 手机。"), false); // a product name, not 1M
  assert.equal(grounded("Stub 种树 500棵。", "The tree is 5m tall."), false); // lowercase m, meters
  assert.equal(grounded("Stub 融资 10000万美元。", "Stub raised 100 M dollars."), false); // the M must be glued to its number
});

// 2026-10-27 dev: the BBC item wrote $80.7bn (lowercase) and the writer's correct 807亿 was discarded
// (receipt 19727, generator.written=false). The press's two-letter bn/mn glued to a number are
// unambiguous magnitudes; a bare lowercase b or m still is not (5m is metres).
test("the Chinese spelling of the corpus's lowercase bn/mn magnitude is grounded", () => {
  const corpus = "该公司上半年亏损超过 $80.7bn，收入为 $16.3bn。";
  assert.equal(grounded("该公司上半年亏损超过807亿美元，收入163亿美元。", corpus), true);
  assert.equal(grounded("该服务新增4500万用户。", "The service added 45mn users."), true);
});

test("a lowercase bn conversion with the wrong digits stays ungrounded", () => {
  assert.equal(grounded("该公司上半年亏损超过808亿美元。", "该公司上半年亏损超过 $80.7bn。"), false);
});

test("spaced or single-letter lowercase units are not magnitudes", () => {
  assert.equal(grounded("Stub 融资10000万欧元。", "Stub raised 100 mn euros."), false); // not glued
  assert.equal(grounded("Stub 预算5000万英镑。", "The budget is £5b."), false); // bare lowercase b
});

test("a real three-digit magnitude still converts", () => {
  assert.equal(grounded("Stub 拥有 25600万用户。", "Stub has 256M users."), true);
});

test("decimals convert exactly", () => {
  assert.equal(grounded("Stub 融资 15亿美元。", "Stub raised $1.5B."), true);
  assert.equal(grounded("Stub 融资 5亿美元。", "Stub raised $0.5B."), true);
  assert.equal(grounded("Stub 融资 250万用户。", "Stub has 2.5M users."), true);
});
