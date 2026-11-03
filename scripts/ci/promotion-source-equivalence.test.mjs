import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { isPromotionControlPath, runtimeDifferences, releaseInputDifferences } from "./promotion-source-equivalence.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function write(cwd, path, content) {
  const full = join(cwd, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function fixture(changes) {
  const cwd = mkdtempSync(join(tmpdir(), "eventgraph-promote-"));
  git(cwd, "init", "-q");
  git(cwd, "config", "user.email", "ci@example.invalid");
  git(cwd, "config", "user.name", "CI");
  write(cwd, "apps/web/app.ts", "export const value = 1;\n");
  write(cwd, "packages/backend/index.ts", "export const backend = 1;\n");
  write(cwd, "Dockerfile", "FROM node:24\n");
  write(cwd, "package.json", "{}\n");
  write(cwd, "database/001.sql", "select 1;\n");
  write(cwd, "docker-compose.yml", "services: {}\n");
  write(cwd, ".github/workflows/check.yml", "name: Check\n");
  write(cwd, "scripts/ci/base.mjs", "export {};\n");
  write(cwd, "specs/base/spec.md", "# Base\n");
  write(cwd, "scripts/deploy-prod.sh", "#!/bin/sh\n");
  write(cwd, "docs/ci-cd.md", "# CI/CD\n");
  write(cwd, "docs/production-deployment.md", "# Production\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "base");
  const base = git(cwd, "rev-parse", "HEAD");
  for (const [path, content] of Object.entries(changes)) write(cwd, path, content);
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "candidate");
  return { cwd, base, head: git(cwd, "rev-parse", "HEAD") };
}

test("only explicitly reviewed control/governance paths are excluded", () => {
  for (const path of [
    ".github/workflows/check.yml",
    "scripts/ci/promotion-source-equivalence.mjs",
    "specs/014-main-promotion-runtime-equivalence/spec.md",
    "scripts/deploy-prod.sh",
    "docs/ci-cd.md",
    "docs/production-deployment.md",
  ]) assert.equal(isPromotionControlPath(path), true, path);

  for (const path of [
    "apps/web/app.ts",
    "packages/backend/index.ts",
    "Dockerfile",
    "package.json",
    "database/001.sql",
    "docker-compose.yml",
    "scripts/migrate.ts",
    "industry/sources.json",
    "README.md",
  ]) assert.equal(isPromotionControlPath(path), false, path);
});

test("git comparison accepts control-plane-only drift", () => {
  const f = fixture({
    ".github/workflows/check.yml": "name: Changed\n",
    "scripts/ci/new-check.mjs": "export const changed = true;\n",
    "specs/new/spec.md": "# New governance\n",
    "scripts/deploy-prod.sh": "#!/bin/sh\necho changed\n",
    "docs/ci-cd.md": "# Changed CI/CD\n",
    "docs/production-deployment.md": "# Changed production docs\n",
  });
  try {
    assert.deepEqual(runtimeDifferences(f.base, f.head, f.cwd), []);
  } finally {
    rmSync(f.cwd, { recursive: true, force: true });
  }
});

test("git comparison fails closed on representative runtime drift", () => {
  for (const [path, content] of Object.entries({
    "apps/web/app.ts": "export const value = 2;\n",
    "packages/backend/index.ts": "export const backend = 2;\n",
    "Dockerfile": "FROM node:25\n",
    "package.json": "{\"changed\":true}\n",
    "database/001.sql": "select 2;\n",
    "docker-compose.yml": "services:\n  web: {}\n",
  })) {
    const f = fixture({ [path]: content });
    try {
      assert.deepEqual(runtimeDifferences(f.base, f.head, f.cwd), [path]);
    } finally {
      rmSync(f.cwd, { recursive: true, force: true });
    }
  }
});

test("malformed source SHA is rejected before git comparison", () => {
  assert.throws(() => runtimeDifferences("HEAD"), /40-character lowercase commit SHA/);
});

test("main control-only push is not a production release", () => {
  const f = fixture({
    ".github/workflows/check.yml": "name: Reviewed control update\\n",
    "specs/new/spec.md": "# Approved control decision\\n",
    "scripts/ci/helper.mjs": "export const control = true;\\n",
  });
  try {
    assert.deepEqual(releaseInputDifferences(f.base, f.head, f.cwd), []);
  } finally {
    rmSync(f.cwd, { recursive: true, force: true });
  }
});

test("a production image pin change is a release even though it is under .github", () => {
  const f = fixture({
    ".github/production-image.env": "SOURCE_SHA=updated\\nIMAGE_REF=updated\\n",
  });
  try {
    assert.deepEqual(releaseInputDifferences(f.base, f.head, f.cwd), [".github/production-image.env"]);
  } finally {
    rmSync(f.cwd, { recursive: true, force: true });
  }
});

test("runtime changes remain release candidates for all previously guarded paths", () => {
  for (const path of ["apps/web/app.ts", "packages/backend/index.ts", "Dockerfile",
    "package.json", "database/001.sql", "docker-compose.yml", ".gitattributes"]) {
    const f = fixture({ [path]: "changed\\n" });
    try {
      assert.deepEqual(releaseInputDifferences(f.base, f.head, f.cwd), [path]);
    } finally {
      rmSync(f.cwd, { recursive: true, force: true });
    }
  }
});

test("push classification includes earlier commits even if the last commit is control-only", () => {
  const f = fixture({ "apps/web/app.ts": "export const value = 2;\\n" });
  try {
    write(f.cwd, "specs/base/spec.md", "# Updated governance\\n");
    git(f.cwd, "add", ".");
    git(f.cwd, "commit", "-qm", "control-only last commit");
    assert.deepEqual(releaseInputDifferences(f.base, "HEAD", f.cwd), ["apps/web/app.ts"]);
    assert.deepEqual(releaseInputDifferences(f.head, "HEAD", f.cwd), []);
  } finally {
    rmSync(f.cwd, { recursive: true, force: true });
  }
});

test("missing, all-zero and non-ancestor push commits fail closed", () => {
  const f = fixture({ "specs/base/spec.md": "# Different governance\\n" });
  try {
    for (const sha of ["", "0".repeat(40), "z".repeat(40), "a".repeat(40)]) {
      assert.throws(() => releaseInputDifferences(sha, f.head, f.cwd));
    }
    assert.throws(() => releaseInputDifferences(f.head, f.base, f.cwd));
  } finally {
    rmSync(f.cwd, { recursive: true, force: true });
  }
});

test("production --classify-push CLI emits exact release intent for runtime, pin and control changes", () => {
  const executable = fileURLToPath(new URL("./promotion-source-equivalence.mjs", import.meta.url));
  for (const [changes, expected] of [
    [{ "apps/web/app.ts": "export const value = 2;\\n" }, "true"],
    [{ ".github/production-image.env": "SOURCE_SHA=updated\\n" }, "true"],
    [{ ".github/workflows/check.yml": "name: Control-only\\n" }, "false"],
  ]) {
    const f = fixture(changes);
    try {
      const result = spawnSync(process.execPath,
        [executable, "--classify-push", f.base, f.head], { cwd: f.cwd, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), expected);
    } finally {
      rmSync(f.cwd, { recursive: true, force: true });
    }
  }
});
