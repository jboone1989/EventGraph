// scripts/ci/export-image-vm13.sh ships the published digest over the
// VM13→cn-dev SSH path, and deploy-vm13-preview.sh bootstraps the database
// tunnel to the same host. Both legs accept cn-dev only if the offered host
// key matches the pinned fingerprint (EVENTGRAPH_DEV_SSH_FINGERPRINT), the
// same secret the runner verifies on its own hops. These tests drive the real
// export script against stub docker/ssh/ssh-keyscan/sudo binaries, but the
// fingerprint check runs a REAL ssh-keygen, so a wrong host key exercises real
// fingerprint math rather than a stubbed assertion.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const repoRoot = new URL("../", import.meta.url).pathname;
const digest = "a".repeat(64);
const imageRef = `ghcr.io/jboone1989/eventgraph-app@sha256:${digest}`;
const releaseSha = "5".repeat(40);
const imageId = `sha256:${digest}`;
const tag = `eventgraph-dev:${digest}`;
const cnDevHost = "43.142.127.40";

const dockerStub = `#!/usr/bin/env node
// VM13-side docker stub: the digest is already local (no pull), carries the
// release revision label, and can be tagged and saved. Anything else fails.
const { appendFileSync } = require("fs");
const log = (line) => appendFileSync(process.env.STUB_CALLS, line + "\\n");
const args = process.argv.slice(2);
if (args[0] === "image" && args[1] === "inspect") {
  log("image inspect " + args.slice(2).join(" "));
  const fmt = args[2] === "--format" ? args[3] : "";
  if (fmt.includes("revision")) console.log(process.env.STUB_REVISION);
  else if (fmt.includes(".Id")) console.log(process.env.STUB_IMAGE_ID);
  process.exit(0);
}
if (args[0] === "tag") { log("tag " + args.join(" ")); process.exit(0); }
if (args[0] === "save") { log("save " + args.join(" ")); console.log("tar-bytes"); process.exit(0); }
log("UNEXPECTED " + args.join(" "));
process.exit(1);
`;

const sshStub = `#!/bin/sh
# cn-dev-side ssh stub: logs the options it was given and answers the three
# remote commands the export script issues. printf (not echo: dash's echo
# would expand the literal backslash-n inside the pairing command).
printf '%s\n' "$*" >> "$STUB_SSH_CALLS"
case "$*" in
  *"docker load"*) exit 0 ;;
  *"docker image inspect"*) echo "$STUB_IMAGE_ID" ;;
  *"eventgraph-last-delivered-image"*) exit 0 ;;
  *) echo "ssh stub: unexpected remote command: $*" >&2; exit 1 ;;
esac
`;

const keyscanStub = `#!/bin/sh
# Emulates ssh-keyscan by offering the per-test generated ed25519 host key.
[ -n "$STUB_KEYSCAN_FAIL" ] && exit 2
echo "$CN_DEV_HOST $(cat "$STUB_OFFERED_PUB")"
`;

const dirs: string[] = [];

// Generates a real ed25519 host key in the sandbox and returns its public line
// and fingerprint, so wrong-key tests fail through real fingerprint math.
function keygen(dir: string, name: string) {
  const file = path.join(dir, name);
  spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", file], { encoding: "utf8" });
  const pub = readFileSync(`${file}.pub`, "utf8").trim();
  const fingerprint = spawnSync("ssh-keygen", ["-lf", `${file}.pub`], { encoding: "utf8" })
    .stdout.trim().split(/\s+/)[1];
  return { pub, fingerprint };
}

interface Sandbox {
  dir: string;
  home: string;
  env: Record<string, string | undefined>;
}

// One sandbox = one VM13 home offering a generated host key; the pin defaults
// to that key's fingerprint, so callers opt into the failure modes.
function sandbox(opts: { pinOtherKey?: boolean; noPin?: boolean; failKeyscan?: boolean } = {}): Sandbox {
  const dir = mkdtempSync(path.join(tmpdir(), "export-image-"));
  dirs.push(dir);
  const offered = keygen(dir, "offered");
  const home = path.join(dir, "home");
  mkdirSync(path.join(home, ".ssh"), { recursive: true });
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "docker"), dockerStub);
  writeFileSync(path.join(bin, "ssh"), sshStub);
  writeFileSync(path.join(bin, "ssh-keyscan"), keyscanStub);
  writeFileSync(path.join(bin, "sudo"), `#!/bin/sh\n[ "$1" = "-n" ] && shift\nexec "$@"\n`);
  for (const f of ["docker", "ssh", "ssh-keyscan", "sudo"]) spawnSync("chmod", ["+x", path.join(bin, f)]);
  writeFileSync(path.join(dir, "ssh-calls.log"), "");
  writeFileSync(path.join(dir, "docker-calls.log"), "");
  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    HOME: home,
    CN_DEV_HOST: cnDevHost,
    STUB_CALLS: path.join(dir, "docker-calls.log"),
    STUB_SSH_CALLS: path.join(dir, "ssh-calls.log"),
    STUB_IMAGE_ID: imageId,
    STUB_REVISION: releaseSha,
    STUB_OFFERED_PUB: path.join(dir, "offered.pub"),
    EVENTGRAPH_IMAGE: imageRef,
    EVENTGRAPH_RELEASE_SHA: releaseSha,
    EVENTGRAPH_DEV_SSH_FINGERPRINT: undefined,
  };
  if (!opts.noPin) {
    env.EVENTGRAPH_DEV_SSH_FINGERPRINT = opts.pinOtherKey ? keygen(dir, "other").fingerprint : offered.fingerprint;
  }
  if (opts.failKeyscan) env.STUB_KEYSCAN_FAIL = "1";
  return { dir, home, env };
}

const run = (env: Record<string, string | undefined>) =>
  spawnSync("sh", [path.join(repoRoot, "scripts/ci/export-image-vm13.sh")], { env, encoding: "utf8" });

const content = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

after(async () => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

test("a cn-dev host key that does not match the pinned fingerprint is refused before any bytes move", () => {
  const { dir, home, env } = sandbox({ pinOtherKey: true });
  const res = run(env);
  assert.notEqual(res.status, 0, "a mismatched host key must abort delivery");
  assert.match(res.stderr, /pinned fingerprint/);
  assert.equal(content(path.join(dir, "docker-calls.log")), "", "no docker command may run");
  assert.equal(content(path.join(dir, "ssh-calls.log")), "", "no ssh connection may be attempted");
  assert.ok(!existsSync(path.join(home, ".ssh/known_hosts.cndev")), "no key may be trusted");
  assert.ok(!existsSync(path.join(home, ".ssh/known_hosts.cndev.scan")));
});

test("a missing pinned fingerprint refuses delivery", () => {
  const { dir, env } = sandbox({ noPin: true });
  const res = run(env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /EVENTGRAPH_DEV_SSH_FINGERPRINT/);
  assert.equal(content(path.join(dir, "ssh-calls.log")), "");
});

test("an unreachable or empty keyscan refuses delivery", () => {
  const { dir, home, env } = sandbox({ failKeyscan: true });
  const res = run(env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /ssh-keyscan failed/);
  assert.equal(content(path.join(dir, "ssh-calls.log")), "");
  assert.ok(!existsSync(path.join(home, ".ssh/known_hosts.cndev")));
});

test("the pinned host key is written to a dedicated known_hosts and every ssh hop uses it", () => {
  const { dir, home, env } = sandbox();
  const offeredPub = readFileSync(path.join(dir, "offered.pub"), "utf8").trim();
  const res = run(env);
  assert.equal(res.status, 0, res.stderr);
  const dockerCalls = content(path.join(dir, "docker-calls.log"));
  assert.ok(!dockerCalls.includes("UNEXPECTED") && !dockerCalls.includes("pull"), "VM13 must not re-pull a local digest");
  assert.ok(dockerCalls.includes(`tag ${imageId} ${tag}`));
  const pinnedFile = path.join(home, ".ssh/known_hosts.cndev");
  assert.equal(readFileSync(pinnedFile, "utf8"), `${cnDevHost} ${offeredPub}\n`, "only the verified key is trusted");
  assert.ok(!existsSync(`${pinnedFile}.scan`));
  const sshCalls = content(path.join(dir, "ssh-calls.log")).trim().split("\n");
  assert.equal(sshCalls.length, 3, `load, remote id check, pairing write — got: ${sshCalls.join(" || ")}`);
  for (const call of sshCalls) {
    assert.ok(call.includes(`UserKnownHostsFile=${pinnedFile}`), `ssh must pin the verified host key: ${call}`);
    assert.ok(!call.includes(".ssh/known_hosts "), "the shared known_hosts must not be used");
  }
  assert.ok(sshCalls.some((c) => c.includes("docker load")));
  assert.ok(sshCalls.some((c) => c.includes("eventgraph-last-delivered-image") && c.includes(tag) && c.includes(imageRef)));
});

test("deploy-vm13-preview.sh wires the same pinning for the database tunnel", () => {
  const vm13 = readFileSync(path.join(repoRoot, "scripts/ci/deploy-vm13-preview.sh"), "utf8");
  const exportScript = readFileSync(path.join(repoRoot, "scripts/ci/export-image-vm13.sh"), "utf8");
  // appleboy/ssh-action executes script_path files standalone on the host, so
  // both scripts must inline the same verification instead of sourcing a sibling.
  for (const script of [vm13, exportScript]) {
    assert.ok(!script.includes('dirname "$0"'), "script_path scripts must stay self-contained");
  }
  const blockOf = (script: string) => {
    const start = script.indexOf(': "${EVENTGRAPH_DEV_SSH_FINGERPRINT:?');
    const endMarker = 'mv "$cndev_scan" "$CNDEV_KNOWN_HOSTS"';
    const end = script.indexOf(endMarker, start);
    assert.ok(start >= 0 && end >= 0, "the pinning block must exist");
    return script.slice(start, end + endMarker.length);
  };
  assert.equal(blockOf(vm13), blockOf(exportScript), "both legs must verify cn-dev identically");
  assert.ok(!vm13.includes("ssh_keyscan"), "the trust-on-first-keyscan bootstrap must be gone");
  assert.ok(vm13.includes("-o UserKnownHostsFile=%h/.ssh/known_hosts.cndev"), "the tunnel unit must pin the verified file");
});
