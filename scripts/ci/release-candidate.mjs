#!/usr/bin/env node
// Prints "current=true|false": is SOURCE_SHA still the release to publish or
// deploy on a branch whose tip is HEAD_SHA? True when SOURCE_SHA is the tip,
// or when every change from SOURCE_SHA to the tip is documentation-only —
// reusing scripts/ci/scope-changes.mjs — so a docs-only push cannot suppress
// a pending code release (specs/010-ci-change-scope). Anything else — a later
// executable change, a tip that no longer descends from SOURCE_SHA, any
// error — is false: never ship a superseded release.
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = process.env.SOURCE_SHA || "";
const head = process.env.HEAD_SHA || "";
const sha = /^[0-9a-f]{40}$/;
const classifier = join(dirname(fileURLToPath(import.meta.url)), "scope-changes.mjs");

let current = false;
try {
  if (sha.test(source) && sha.test(head)) {
    if (source === head) {
      current = true;
    } else if (spawnSync("git", ["merge-base", "--is-ancestor", source, head]).status === 0) {
      const out = execFileSync(process.execPath, [classifier], {
        encoding: "utf8",
        env: { ...process.env, SCOPE_BASE_SHA: source, SCOPE_HEAD_SHA: head },
      });
      current = out.trim().split("\n").includes("docs_only=true");
    }
  }
} catch (error) {
  console.error(`::warning::release currency check failed, skipping the release: ${error.message}`);
}
console.log(`current=${current}`);
