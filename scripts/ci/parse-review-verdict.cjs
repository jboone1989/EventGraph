"use strict";

/**
 * Parse the single-message outcome of a model review.
 *
 * The old JSON verdict format was brittle with long LLM answers (PR #437).
 * Protocol (no JSON escaping required):
 *
 * VERDICT: PASS
 *
 * OR
 *
 * VERDICT: FAIL
 * FINDING: packages/path.ts:42 | Reproduction and smallest fix
 */
function parseReviewVerdict(executionFileContent, kind) {
  if (kind !== "code" && kind !== "spec") throw new Error("Unsupported review kind");
  const events = JSON.parse(executionFileContent);
  if (!Array.isArray(events)) throw new Error("Review execution log must be an array");
  const final = events.filter(e => e && e.type === "result").at(-1);
  if (!final || final.subtype !== "success" || final.is_error ||
      typeof final.result !== "string" || !final.result.trim()) {
    throw new Error("Review did not complete with a text verdict");
  }
  let raw = final.result.trim();
  // Accept a single fenced response but never execute or silently repair content.
  const fence = raw.match(/^\x60\x60\x60(?:text)?\r?\n([\s\S]*?)\r?\n\x60\x60\x60$/);
  if (fence) raw = fence[1].trim();
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length === 1 && lines[0] === "VERDICT: PASS") {
    return { summary: "Review passed; no verified blockers.", findings: [] };
  }
  if (lines[0] !== "VERDICT: FAIL" || lines.length < 2 || lines.length > 9) {
    throw new Error("Malformed review verdict; expected VERDICT: PASS or FAIL + FINDING lines");
  }
  const findings = lines.slice(1).map(line => {
    const match = /^FINDING: ([A-Za-z0-9_.\/-]+):(\d{1,7}) \| (.{10,800})$/.exec(line);
    if (!match) throw new Error("Malformed FINDING line");
    const [, file, number, issue] = match;
    if (file.startsWith("/") || file.includes("..") ||
        (kind === "spec" && !/^specs\/[^/]+\/(?:spec|plan|tasks)\.md$/.test(file))) {
      throw new Error("Invalid finding file");
    }
    const lineNumber = Number(number);
    if (!Number.isSafeInteger(lineNumber) || lineNumber <= 0) throw new Error("Invalid finding line number");
    return { file, line: lineNumber, issue };
  });
  return { summary: "Review found " + findings.length + " blocking issue(s).", findings };
}

module.exports = { parseReviewVerdict };
