#!/usr/bin/env node
// An implementation PR must point at an immutable spec already on its base branch.
// A spec authored alongside its implementation is a proposal, not a pre-approved contract.
import { execFileSync } from "node:child_process";

const base = process.env.SPEC_BASE_SHA || "";
const head = process.env.SPEC_HEAD_SHA || "";
const body = process.env.SPEC_PR_BODY || "";
const hash = /^[0-9a-f]{40}$/;
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });

function fail(message) {
  console.error("::error::Spec gate: " + message);
  process.exit(1);
}
if (!hash.test(base) || !hash.test(head)) fail("Missing or invalid PR base/head SHA.");
const ancestor = git("merge-base", base, head).trim();
const files = git("diff", "--name-only", "-z", ancestor, head).split("\0").filter(Boolean);
if (files.length === 0) fail("No changed files found; cannot validate PR scope.");

// Governance, specification and documentation changes do not implement product behavior.
const governance = /^(?:docs\/|specs\/|\.github\/|\.specify\/|\.agents\/|\.claude\/|scripts\/ci\/)/;
const rootDocs = /^(?:AGENTS|CLAUDE|README|CONTRIBUTING)\.md$/;
const implementation = files.filter(file => !governance.test(file) && !rootDocs.test(file) && !file.endsWith(".md"));
if (implementation.length === 0) {
  console.log("Spec gate PASS: documentation/governance-only PR.");
  process.exit(0);
}
const match = body.match(/^Spec:\s*(specs\/[a-zA-Z0-9_./-]+\/spec\.md)@([0-9a-f]{40})\s*$/mi);
if (!match) fail("Implementation PR must contain 'Spec: specs/<feature>/spec.md@<40-char-approved-commit>' in its description.");
const [, path, specSha] = match;
if (path.includes("..") || path.includes("//")) fail("Invalid spec path.");
try {
  execFileSync("git", ["merge-base", "--is-ancestor", specSha, base], { stdio: "ignore" });
} catch {
  fail("Spec commit must exist on PR base history BEFORE implementation.");
}
let approved, baseline;
try {
  approved = git("show", `${specSha}:${path}`);
  baseline = git("show", `${base}:${path}`);
} catch {
  fail("Spec must exist at its pinned commit and already on the base branch.");
}
if (!approved.trim() || approved !== baseline) fail("Spec changed since pinned approval SHA; finalize a new spec revision first.");
console.log(`Spec gate PASS: ${implementation.length} implementation files; ${path}@${specSha.slice(0, 12)} was already on base.`);
