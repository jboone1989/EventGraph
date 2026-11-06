import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseReviewVerdict } = require("./parse-review-verdict.cjs");
const wrapped = (result, opts = {}) => JSON.stringify([
  { type: "system", message: "init" },
  { type: "result", subtype: opts.subtype ?? "success", is_error: opts.isError ?? false, result }
]);

test("concise successful code and Spec reviews", () => {
  for (const kind of ["code", "spec"]) {
    const verdict = parseReviewVerdict(wrapped("VERDICT: PASS"), kind);
    assert.deepEqual(verdict.findings, []);
  }
});
test("review supports a single optional fenced response", () => {
  assert.equal(parseReviewVerdict(wrapped("```text\nVERDICT: PASS\n```"), "spec").findings.length, 0);
});
test("concrete blocking findings have file, line, issue", () => {
  const result = parseReviewVerdict(
    wrapped("VERDICT: FAIL\nFINDING: packages/backend/src/jobs/queue.ts:42 | Retry can publish the same item twice; make the ID unique."),
    "code"
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].file, "packages/backend/src/jobs/queue.ts");
  assert.equal(result.findings[0].line, 42);
  assert.match(result.findings[0].issue, /unique/);
  const spec = parseReviewVerdict(
    wrapped("VERDICT: FAIL\nFINDING: specs/example/spec.md:16 | Acceptance test lacks a concrete pass condition; specify the exact input."),
    "spec"
  );
  assert.equal(spec.findings[0].file, "specs/example/spec.md");
});
test("malformed or truncated model output fails closed", () => {
  for (const message of [
    '{"summary":"long review","findings":[{"file":"x"',
    "Review passed.",
    "VERDICT: FAIL",
    "VERDICT: FAIL\nFINDING: ../../etc/passwd:2 | Unsafe and invalid file path must be rejected.",
    "VERDICT: FAIL\nFINDING: specs/example/spec.md:0 | No valid source line zero must fail validation.",
    "VERDICT: PASS\nFINDING: x.ts:1 | Contradictory pass and finding must be rejected.",
  ]) assert.throws(() => parseReviewVerdict(wrapped(message), "code"));
  assert.throws(() => parseReviewVerdict(wrapped("VERDICT: FAIL\nFINDING: src/x.ts:1 | This is a valid issue description."), "spec"));
});
test("LLM completion must be an actual successful result event", () => {
  assert.throws(() => parseReviewVerdict(wrapped("VERDICT: PASS", { subtype: "error" }), "code"));
  assert.throws(() => parseReviewVerdict(wrapped("VERDICT: PASS", { isError: true }), "code"));
  assert.throws(() => parseReviewVerdict("{}","code"));
});
