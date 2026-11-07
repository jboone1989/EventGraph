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
  if (files.length === 0) {
    // A genuinely empty diff is docs-only only for a verified history-sync
    // merge. Invalid / unrelated empty ranges still run the full pipeline.
    if (process.env.SCOPE_BASE_REF !== "develop" ||
        !/^sync\/main-history-[a-z0-9-]+$/.test(process.env.SCOPE_HEAD_REF || "") ||
        !process.env.SCOPE_REPOSITORY ||
        process.env.SCOPE_HEAD_REPO !== process.env.SCOPE_REPOSITORY) return false;
    const parents = git("rev-list", "--parents", "-n", "1", head).trim().split(/\s+/);
    if (head === base || parents.length !== 3 || parents[0] !== head) return false;
    let mainTip;
    try { mainTip = git("rev-parse", "refs/remotes/origin/main").trim(); }
    catch { mainTip = git("rev-parse", "refs/heads/main").trim(); }
    try {
      git("merge-base", "--is-ancestor", base, head);
      git("merge-base", "--is-ancestor", mainTip, head);
    } catch { return false; }
    const mainBase = git("merge-base", base, mainTip).trim();
    if (!mainBase || git("diff", "--name-only", mainBase, mainTip).trim()) return false;
    return git("rev-parse", `${head}^{tree}`).trim() === git("rev-parse", `${base}^{tree}`).trim();
  }
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
