import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { classifyPromotionPush } from "./promotion-push-intent.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function write(cwd, path, content) {
  const full = join(cwd, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "eventgraph-push-intent-"));
  git(cwd, "init", "-q");
  git(cwd, "config", "user.email", "ci@example.invalid");
  git(cwd, "config", "user.name", "CI");
  write(cwd, "apps/web/app.ts", "export const value = 1;\n");
  write(cwd, ".github/workflows/check.yml", "name: Check\n");
  write(cwd, ".github/production-image.env", "SOURCE_SHA=" + "a".repeat(40) + "\n");
  write(cwd, "scripts/ci/base.mjs", "export {};\n");
  write(cwd, "specs/base/spec.md", "# Base\n");
  write(cwd, "docs/ci-cd.md", "# CI/CD\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "base");
  return { cwd, before: git(cwd, "rev-parse", "HEAD") };
}

function commit(cwd, path, content, message = "change") {
  write(cwd, path, content);
  git(cwd, "add", path);
  git(cwd, "commit", "-qm", message);
  return git(cwd, "rev-parse", "HEAD");
}

function cleanup(f) {
  rmSync(f.cwd, { recursive: true, force: true });
}

test("control/governance-only push is not a production release", () => {
  const f = fixture();
  try {
    commit(f.cwd, ".github/workflows/check.yml", "name: Changed\n");
    commit(f.cwd, "scripts/ci/new-check.mjs", "export const changed = true;\n");
    commit(f.cwd, "specs/new/spec.md", "# New spec\n");
    const result = classifyPromotionPush(f.before, "HEAD", f.cwd);
    assert.equal(result.releaseCandidate, false);
    assert.equal(result.pinChanged, false);
    assert.deepEqual(result.releasePaths, []);
    assert.equal(result.changedPaths.length, 3);
  } finally {
    cleanup(f);
  }
});

test("production image pin changes always request a release", () => {
  const f = fixture();
  try {
    commit(f.cwd, ".github/production-image.env", "SOURCE_SHA=" + "b".repeat(40) + "\n");
    const result = classifyPromotionPush(f.before, "HEAD", f.cwd);
    assert.equal(result.releaseCandidate, true);
    assert.equal(result.pinChanged, true);
    assert.deepEqual(result.releasePaths, [".github/production-image.env"]);
  } finally {
    cleanup(f);
  }
});

test("representative runtime changes request a release", () => {
  for (const [path, content] of [
    ["apps/web/app.ts", "export const value = 2;\n"],
    ["packages/backend/index.ts", "export const backend = 2;\n"],
    ["Dockerfile", "FROM node:25\n"],
    ["package.json", JSON.stringify({ changed: true }) + "\n"],
    ["database/001.sql", "select 2;\n"],
    ["docker-compose.yml", ["services:", "  web: {}"].join("\n") + "\n"],
  ]) {
    const f = fixture();
    try {
      commit(f.cwd, path, content);
      const result = classifyPromotionPush(f.before, "HEAD", f.cwd);
      assert.equal(result.releaseCandidate, true, path);
      assert.equal(result.pinChanged, false, path);
      assert.deepEqual(result.releasePaths, [path], path);
    } finally {
      cleanup(f);
    }
  }
});

test("the full multi-commit push range is classified, not only its final commit", () => {
  const f = fixture();
  try {
    commit(f.cwd, "apps/web/app.ts", "export const value = 2;\n", "runtime change");
    commit(f.cwd, ".github/workflows/check.yml", "name: Control only\n", "control change");
    const result = classifyPromotionPush(f.before, "HEAD", f.cwd);
    assert.equal(result.releaseCandidate, true);
    assert.deepEqual(result.releasePaths, ["apps/web/app.ts"]);
  } finally {
    cleanup(f);
  }
});

test("a multi-commit control-only push remains a no-release update", () => {
  const f = fixture();
  try {
    commit(f.cwd, ".github/workflows/check.yml", "name: Changed\n");
    commit(f.cwd, "specs/new/spec.md", "# New\n");
    commit(f.cwd, "docs/ci-cd.md", "# Changed docs\n");
    const result = classifyPromotionPush(f.before, "HEAD", f.cwd);
    assert.equal(result.releaseCandidate, false);
    assert.equal(result.changedPaths.length, 3);
  } finally {
    cleanup(f);
  }
});

test("invalid or unavailable push.before and HEAD fail closed", () => {
  const f = fixture();
  try {
    assert.throws(() => classifyPromotionPush("HEAD", "HEAD", f.cwd), /push.before/);
    assert.throws(() => classifyPromotionPush("f".repeat(40), "HEAD", f.cwd));
    assert.throws(() => classifyPromotionPush(f.before, "not-a-commit", f.cwd), /HEAD must be/);
  } finally {
    cleanup(f);
  }
});
