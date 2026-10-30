import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
for (const name of ["eventgraph-dispatcher", "eventgraph-worker"]) {
  test(`${name} sends the exact GLM upstream base path to AWF`, () => {
    const lock = readFileSync(new URL(`../../.github/workflows/${name}.lock.yml`, import.meta.url), "utf8");
    const args = [...lock.matchAll(/--anthropic-api-base-path (.+) \\\r?\n/g)];
    assert.ok(args.length > 0, "compiled workflow must configure the upstream path");
    for (const [, argument] of args) {
      const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
      const actual = execFileSync(bash, ["-c", `printf '%s' ${argument}`], { encoding: "utf8" });
      assert.equal(actual, "/api/anthropic");
    }
  });
}
