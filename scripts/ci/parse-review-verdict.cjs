"use strict";

/**
 * Only consume Claude Code Action's structured_output produced by --json-schema.
 * The model's free-form final text is not a CI protocol.
 */
function parseStructuredReviewVerdict(output, kind) {
  if (kind !== "code" && kind !== "spec") throw new Error("Unsupported review kind");
  if (typeof output !== "string" || !output.trim())
    throw new Error("Missing structured_output; model/provider may not support --json-schema");
  let verdict;
  try { verdict = JSON.parse(output); }
  catch { throw new Error("Invalid structured_output JSON; review not approved"); }
  if (!verdict || Array.isArray(verdict) || typeof verdict !== "object" ||
      !["PASS", "FAIL"].includes(verdict.status) ||
      !Array.isArray(verdict.findings) ||
      Object.keys(verdict).some(key => !["status", "findings"].includes(key))) {
    throw new Error("Review output violates schema");
  }
  if ((verdict.status === "PASS" && verdict.findings.length !== 0) ||
      (verdict.status === "FAIL" && (verdict.findings.length < 1 || verdict.findings.length > 8))) {
    throw new Error("Review status contradicts findings");
  }
  const findings = verdict.findings.map(f => {
    if (!f || typeof f !== "object" || Array.isArray(f) ||
        Object.keys(f).some(key => !["file", "line", "issue"].includes(key)) ||
        typeof f.file !== "string" ||
        !/^[A-Za-z0-9_.\/-]+$/.test(f.file) ||
        f.file.startsWith("/") || f.file.includes("..") ||
        !Number.isSafeInteger(f.line) || f.line <= 0 ||
        typeof f.issue !== "string" || f.issue.trim().length < 10 || f.issue.length > 1200 ||
        (kind === "spec" && !/^specs\/[^/]+\/(?:spec|plan|tasks)\.md$/.test(f.file))) {
      throw new Error("Review finding violates schema or file scope");
    }
    return { file: f.file, line: f.line, issue: f.issue.trim() };
  });
  return { summary: verdict.status === "PASS"
    ? "Review passed; no verified blockers."
    : "Review found " + findings.length + " blocking issue(s).", findings };
}

module.exports = { parseStructuredReviewVerdict };
