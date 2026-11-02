#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const SHA = /^[0-9a-f]{40}$/;

export function isPromotionControlPath(path) {
  return path.startsWith(".github/") ||
    path.startsWith("scripts/ci/") ||
    path.startsWith("specs/") ||
    path === "scripts/deploy-prod.sh" ||
    path === "docs/ci-cd.md" ||
    path === "docs/production-deployment.md";
}

function diffPaths(before, after, cwd) {
  const git = (...args) => execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  git("cat-file", "-e", `${before}^{commit}`);
  git("cat-file", "-e", `${after}^{commit}`);
  return git("diff", "--no-renames", "--name-only", "-z", before, after, "--")
    .split("\0")
    .filter(Boolean);
}

export function runtimeDifferences(sourceSha, head = "HEAD", cwd = process.cwd()) {
  if (!SHA.test(sourceSha)) throw new Error("SOURCE_SHA must be a 40-character lowercase commit SHA");
  return diffPaths(sourceSha, head, cwd).filter(path => !isPromotionControlPath(path));
}

export function releaseInputDifferences(beforeSha, head = "HEAD", cwd = process.cwd()) {
  if (!SHA.test(beforeSha) || /^0+$/.test(beforeSha)) {
    throw new Error("BEFORE_SHA must identify an existing 40-character lowercase commit SHA");
  }
  // A forced or unrelated history is not a safe basis for declaring 'no release'.
  execFileSync("git", ["merge-base", "--is-ancestor", beforeSha, head], { cwd, stdio: "ignore" });
  return diffPaths(beforeSha, head, cwd)
    .filter(path => path === ".github/production-image.env" || !isPromotionControlPath(path));
}

function main() {
  if (process.argv[2] === "--classify-push") {
    const [beforeSha, head = "HEAD"] = process.argv.slice(3);
    console.log(releaseInputDifferences(beforeSha, head).length ? "true" : "false");
    return;
  }
  const [sourceSha, head = "HEAD"] = process.argv.slice(2);
  const differences = runtimeDifferences(sourceSha, head);
  if (differences.length) {
    console.error("::error::Pinned develop image is not runtime-equivalent to main.");
    for (const path of differences) console.error(`::error file=${path}::Runtime source differs from pinned SOURCE_SHA`);
    process.exitCode = 1;
    return;
  }
  console.log(`Promotion source equivalence PASS: ${sourceSha.slice(0, 12)} and ${head} differ only in reviewed control/governance paths.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
