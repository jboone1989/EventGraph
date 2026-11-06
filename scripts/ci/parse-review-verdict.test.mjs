import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseStructuredReviewVerdict: parse } = require("./parse-review-verdict.cjs");
const output = (status, findings = []) => JSON.stringify({ status, findings });

test("accept exact structured PASS for both code and Spec", () => {
  for (const kind of ["code", "spec"]) {
    assert.deepEqual(parse(output("PASS"), kind).findings, []);
  }
});
test("accept structured actionable code and Spec blockers", () => {
  const findings = [{
    file: "packages/backend/src/jobs/queue.ts", line: 42,
    issue: "Retry can publish the same item twice; make the ID unique."
  }];
  assert.deepEqual(parse(output("FAIL", findings), "code").findings, findings);
  assert.equal(parse(output("FAIL", [{
    file: "specs/demo/spec.md", line: 9,
    issue: "An acceptance criterion needs an explicit test input."
  }]), "spec").findings.length, 1);
});
test("never approve missing, malformed, truncated or contradictory structured output", () => {
  for (const value of [
    "", undefined, "VERDICT: PASS", '{"status":"PASS",',
    output("FAIL"), output("PASS", [{ file: "a.ts", line: 1, issue: "This should not be a PASS finding." }]),
    JSON.stringify({status:"UNKNOWN",findings:[]}),
    JSON.stringify({status:"PASS",findings:[], extra:true}),
    JSON.stringify({status:"PASS",findings:"none"})
  ]) assert.throws(() => parse(value, "code"));
});
test("validate finding paths, line numbers, and scoped Spec files", () => {
  for (const finding of [
    {file:"../../.env",line:1,issue:"Untrusted path must not escape the repo."},
    {file:"x.ts",line:0,issue:"A finding cannot point to line zero."},
    {file:"x.ts",line:1,issue:"bad"},
    {file:"x.ts",line:"1",issue:"Finding lines must be integer numbers."},
  ]) assert.throws(() => parse(output("FAIL",[finding]),"code"));
  assert.throws(() => parse(output("FAIL", [{
    file:"src/x.ts",line:1,issue:"This code path cannot be a Spec finding."
  }]),"spec"));
});
