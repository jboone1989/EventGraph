// scripts/ci/deploy-image.sh is the cn-dev worker-only CD: it must deploy only the
// worker, never contact the registry, and roll back to the last good local image.
// These tests drive the real script against a stub docker binary so the guards
// and the rollback path run exactly as they do on the host.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const repoRoot = new URL("../", import.meta.url).pathname;
const imageRef = `ghcr.io/jboone1989/eventgraph-app@sha256:${"a".repeat(64)}`;
const prevRef = `ghcr.io/jboone1989/eventgraph-app@sha256:${"b".repeat(64)}`;
// docker save|load cannot carry registry digest references, so delivery uses
// content-addressed local tags (eventgraph-dev:<image ID hex>).
const tag = `eventgraph-dev:${"a".repeat(64)}`;
const prevTag = `eventgraph-dev:${"b".repeat(64)}`;

const stub = `#!/usr/bin/env node
// Minimal docker stub for deploy-image.sh: images NEW/PREV/STALE, a running worker
// container, and a heartbeat whose outcome the test chooses. Every call is logged;
// any docker command outside the stubbed surface (pull, login, ...) exits 1.
const { appendFileSync, readFileSync, writeFileSync } = require("fs");
const state = JSON.parse(readFileSync(process.env.STUB_STATE, "utf8"));
const log = (line) => appendFileSync(process.env.STUB_CALLS, line + "\\n");
const args = process.argv.slice(2);
if (args[0] === "image" && args[1] === "inspect") {
  const ref = args[args.length - 1];
  const id = state.images[ref] ?? (Object.values(state.images).includes(ref) ? ref : null);
  if (!id) { log("image inspect MISS " + ref); process.exit(1); }
  log("image inspect " + ref);
  const fmt = args[2] === "--format" ? args[3] : "";
  if (fmt.includes("revision")) console.log(state.revisions[id]);
  else if (fmt.includes(".Id")) console.log(id);
  process.exit(0);
}
if (args[0] === "compose") {
  const cmd = ["config", "up", "run", "ps", "exec", "logs"].find((a) => args.includes(a));
  log("compose " + args.slice(2).join(" "));
  if (cmd === "config") {
    for (const f of args.filter((a) => a.endsWith(".yml"))) {
      try { log("OVERLAY[" + f + "] " + readFileSync(f, "utf8").split(String.fromCharCode(10)).join("|")); } catch {}
    }
    process.exit(0);
  }
  if (cmd === "run") process.exit(0); // setup: migrations + seed succeed
  if (cmd === "up") {
    if (args.includes("worker")) state.deployed = process.env.EVENTGRAPH_APP_IMAGE;
    writeFileSync(process.env.STUB_STATE, JSON.stringify(state));
    process.exit(0);
  }
  if (cmd === "ps") { console.log("cid-worker"); process.exit(0); }
  if (cmd === "exec") {
    if (args.includes("psql")) { console.log(state.heartbeat); process.exit(0); }
    process.exit(0); // reindex-public-pages via the worker
  }
  process.exit(0);
}
if (args[0] === "inspect") {
  if (args[2].includes("Running")) console.log("true");
  else console.log(state.deployed ? state.images[state.deployed] : "");
  log("inspect " + args.slice(1).join(" "));
  process.exit(0);
}
if (args[0] === "images") {
  for (const id of Object.values(state.images)) console.log(id.replace("sha256:", "").slice(0, 12) + " ghcr.io/jboone1989/eventgraph-app");
  process.exit(0);
}
if (args[0] === "rmi") { log("rmi " + args.join(" ")); process.exit(0); }
log("UNEXPECTED " + args.join(" "));
process.exit(1);
`;

const dirs: string[] = [];
function sandbox(heartbeat: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "deploy-image-"));
  dirs.push(dir);
  // The release SHA must resolve inside a git repo: a local bare origin holding
  // docker-compose.dev-db.yml at that commit, exactly like the cn-dev checkout.
  const origin = path.join(dir, "origin.git");
  spawnSync("git", ["init", "--bare", "-q", origin]);
  const work = path.join(dir, "origin-work");
  mkdirSync(work);
  spawnSync("git", ["-C", work, "init", "-q", "-b", "develop"]);
  writeFileSync(path.join(work, "docker-compose.dev-db.yml"), "services: { db: {} }\n");
  spawnSync("git", ["-C", work, "add", "."]);
  spawnSync("git", ["-C", work, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x"]);
  const releaseSha = spawnSync("git", ["-C", work, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  spawnSync("git", ["-C", work, "remote", "add", "origin", origin]);
  spawnSync("git", ["-C", work, "push", "-q", "origin", "develop"]);
  // EVENTGRAPH_DIR mirrors the cn-dev deployment directory.
  const deployed = path.join(dir, "deploy");
  mkdirSync(deployed);
  spawnSync("git", ["-C", deployed, "init", "-q"]);
  spawnSync("git", ["-C", deployed, "remote", "add", "origin", origin]);
  writeFileSync(path.join(deployed, ".env"), "X=1\n");
  writeFileSync(path.join(deployed, "docker-compose.yml"), "services: {}\n");
  writeFileSync(path.join(deployed, ".eventgraph-last-good-image"), `${prevTag}\n`);
  const state = {
    images: { [tag]: `sha256:${"a".repeat(64)}`, [prevTag]: `sha256:${"b".repeat(64)}`, "id-stale": "id-stale" },
    revisions: { [`sha256:${"a".repeat(64)}`]: releaseSha, [`sha256:${"b".repeat(64)}`]: "0".repeat(40), "id-stale": "1".repeat(40) },
    heartbeat,
    deployed: prevRef,
    releaseSha,
  };
  writeFileSync(path.join(dir, "state.json"), JSON.stringify(state));
  writeFileSync(path.join(dir, "calls.log"), "");
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "docker"), stub);
  writeFileSync(path.join(bin, "sleep"), "#!/bin/sh\nexit 0\n"); // the heartbeat poll must not take 3 minutes
  for (const f of ["docker", "sleep"]) spawnSync("chmod", ["+x", path.join(bin, f)]);
  return { dir, deployed };
}

function run(dir: string, deployed: string) {
  const env = {
    ...process.env,
    PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
    STUB_STATE: path.join(dir, "state.json"),
    STUB_CALLS: path.join(dir, "calls.log"),
    EVENTGRAPH_IMAGE: imageRef,
    EVENTGRAPH_IMAGE_TAG: tag,
    EVENTGRAPH_RELEASE_SHA: JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8")).releaseSha,
    EVENTGRAPH_DIR: deployed,
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
  return spawnSync("sh", [path.join(repoRoot, "scripts/ci/deploy-image.sh")], { env, encoding: "utf8" });
}

const callsOf = (dir: string) => readFileSync(path.join(dir, "calls.log"), "utf8");

after(async () => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

test("a healthy release recreates only the worker, verifies the heartbeat and never touches the registry", () => {
  const { dir, deployed } = sandbox("t");
  const res = run(dir, deployed);
  assert.equal(res.status, 0, res.stderr);
  const calls = callsOf(dir);
  assert.ok(!calls.includes("UNEXPECTED"), "only stubbed docker commands may run (no pull/login)");
  assert.equal((calls.match(/up -d --no-deps --no-build --pull never worker/g) ?? []).length, 1);
  assert.ok(!/up -d --no-deps --no-build --pull never (api|web)/.test(calls), "no Web/API on cn-dev");
  assert.ok(calls.includes("rmi id-stale"), "superseded digests are pruned");
  assert.ok(!calls.includes(`rmi ${"a".repeat(12)}`) && !calls.includes(`rmi ${"b".repeat(12)}`), "the deployed and rollback images must survive pruning");
  const overlay = calls.match(/OVERLAY\[\S+\.ci-image\.\S+\] ([^\n]*)/)?.[1] ?? "";
  assert.ok(overlay.includes("worker:") && !overlay.includes("api:") && !overlay.includes("web:"));
  assert.equal(readFileSync(path.join(deployed, ".eventgraph-last-good-image"), "utf8"), `${tag}\n`);
});

test("a tag that was never delivered to cn-dev aborts before anything changes", () => {
  const { dir, deployed } = sandbox("t");
  const state = JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));
  delete state.images[tag];
  writeFileSync(path.join(dir, "state.json"), JSON.stringify(state));
  const res = run(dir, deployed);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /not loaded on cn-dev/);
  assert.ok(!callsOf(dir).includes("compose"), "no service may change");
});

test("a worker whose heartbeat never turns fresh rolls back to the previous image", () => {
  const { dir, deployed } = sandbox("");
  const res = run(dir, deployed);
  assert.notEqual(res.status, 0);
  const state = JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));
  assert.equal(state.deployed, prevTag, "rollback must restore the previous image");
  assert.ok(!existsSync(path.join(deployed, ".eventgraph-last-good-image.tmp")));
  assert.equal(readFileSync(path.join(deployed, ".eventgraph-last-good-image"), "utf8"), `${prevTag}\n`);
});
