#!/usr/bin/env node
// Prints "docs_only=true|false" for a change range, reusing the exact
// documentation-only file rules of check-spec.mjs (keep the two in sync).
// Anything else — CI scripts, workflows, code, dependencies, industry data —
// forces the full pipeline. Fails closed: any error or empty diff is false.
import { execFileSync } from "node:child_process";

const base = process.env.SCOPE_BASE_SHA || "";
const head = process.env.SCOPE_HEAD_SHA || "";
const hash = /^[0-9a-f]{40}$/;
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });

function classify() {
  if (!hash.test(base) || !hash.test(head)) return false;
  const ancestor = git("merge-base", base, head).trim();
  if (!ancestor) return false;
  const files = git("diff", "--no-renames", "--name-only", "-z", ancestor, head).split("\0").filter(Boolean);
  if (files.length === 0) return false;
  // Same classification as check-spec.mjs's documentation-only fast path.
  const governance = /^(?:docs\/|specs\/|\.specify\/|\.agents\/|\.claude\/)/;
  const rootDocs = /^(?:AGENTS|CLAUDE|README|CONTRIBUTING)\.md$/;
  const prose = /\.(?:md|txt|rst|adoc)$/i;
  return files.every(file => rootDocs.test(file) || (governance.test(file) && prose.test(file)));
}

let docsOnly = false;
try {
  docsOnly = classify();
} catch (error) {
  console.error(`::warning::scope detection failed, running the full pipeline: ${error.message}`);
}
console.log(`docs_only=${docsOnly}`);
