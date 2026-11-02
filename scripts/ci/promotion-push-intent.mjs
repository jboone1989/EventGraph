#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { isPromotionControlPath } from "./promotion-source-equivalence.mjs";

const SHA = /^[0-9a-f]{40}$/;
const PIN_PATH = ".github/production-image.env";

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function classifyPromotionPush(beforeSha, head = "HEAD", cwd = process.cwd()) {
  if (!SHA.test(beforeSha ?? "")) {
    throw new Error("push.before must be a 40-character lowercase commit SHA");
  }
  if (head !== "HEAD" && !SHA.test(head)) {
    throw new Error("HEAD must be HEAD or a 40-character lowercase commit SHA");
  }

  git(cwd, "cat-file", "-e", \`\${beforeSha}^{commit}\`);
  git(cwd, "cat-file", "-e", \`\${head}^{commit}\`);

  const changedPaths = git(cwd, "diff", "--no-renames", "--name-only", "-z", beforeSha, head, "--")
    .split("\0")
    .filter(Boolean);
  const pinChanged = changedPaths.includes(PIN_PATH);
  const releasePaths = changedPaths.filter(path => path === PIN_PATH || !isPromotionControlPath(path));

  return {
    releaseCandidate: releasePaths.length > 0,
    pinChanged,
    changedPaths,
    releasePaths,
  };
}

function main() {
  const [beforeSha, head = "HEAD"] = process.argv.slice(2);
  const result = classifyPromotionPush(beforeSha, head);
  console.log(\`release_candidate=\${result.releaseCandidate}\`);
  console.log(\`pin_changed=\${result.pinChanged}\`);
  if (result.releaseCandidate) {
    console.log(\`release_reason=\${result.pinChanged ? "production-pin-changed" : "runtime-source-changed"}\`);
  } else {
    console.log("release_reason=control-only-update");
    console.log("::notice::Control/governance-only main update; no production release requested.");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
