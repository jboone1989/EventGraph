// scripts/ci/export-image-vm13.sh ships the published digest over the
// VM13→cn-dev SSH path, and deploy-vm13-preview.sh bootstraps the database
// tunnel to the same host (specs/008-dev-cd-vm13-api: the tunnel uses the
// pre-existing, pre-authorized host key). Both legs accept cn-dev only if one
// of the offered host keys (sshd offers ed25519 and ECDSA) matches the pinned
// fingerprint (EVENTGRAPH_DEV_SSH_FINGERPRINT) — the same secret the runner
// verifies on its own hops, where appleboy's client negotiates ECDSA (the
// pinned VM13 key in check.yml is ECDSA). Delivery itself pushes into a
// registry on cn-dev's loopback (docker save ships every layer every time and
// repeatedly missed the 20-minute deadline across the cross-border link), so
// these tests also pin down the bootstrap, the blob-resumable push retry, the
// verified pull/record contract deploy-image.sh depends on, and teardown of
// the ephemeral registry volume after a verified delivery. They drive the real export script against stub
// docker/ssh/ssh-keyscan/sudo binaries, but the fingerprint check runs a REAL
// ssh-keygen, so a wrong host key exercises real fingerprint math rather than
// a stubbed assertion.
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
const registryRepo = "127.0.0.1:5000/eventgraph-dev";
const registryTag = `${registryRepo}:${releaseSha}`;
const cnDevHost = "43.142.127.40";

const dockerStub = `#!/usr/bin/env node
// VM13-side docker stub: the digest is already local (no pull), carries the
// release revision label, and can be tagged, pushed and saved. The registry
// bootstrap image is only local when STUB_REGISTRY_LOCAL says so; push fails
// the first STUB_PUSH_FAILURES attempts to exercise blob-resumable retries,
// and STUB_HANG_FIRST_PUSH wedges the first attempt (blobs committed, the
// manifest never sent) to exercise the watchdog that must kill it.
const { spawnSync } = require("child_process");
const { appendFileSync, readFileSync, existsSync, writeFileSync } = require("fs");
const log = (line) => appendFileSync(process.env.STUB_CALLS, line + "\\n");
const args = process.argv.slice(2);
if (args[0] === "image" && args[1] === "inspect") {
  if (args[2] === "registry:2" && !process.env.STUB_REGISTRY_LOCAL) process.exit(1);
  log("image inspect " + args.slice(2).join(" "));
  const fmt = args[2] === "--format" ? args[3] : "";
  if (fmt.includes("revision")) console.log(process.env.STUB_REVISION);
  else if (fmt.includes(".Id")) console.log(process.env.STUB_IMAGE_ID);
  process.exit(0);
}
if (args[0] === "pull") {
  if (args[1] !== "registry:2" && !args[1].startsWith("mirror.gcr.io/")) {
    log("UNEXPECTED pull " + args.join(" "));
    process.exit(1);
  }
  log("pull " + args.join(" "));
  process.exit(0);
}
if (args[0] === "tag") { log("tag " + args.join(" ")); process.exit(0); }
if (args[0] === "push") {
  const counter = process.env.STUB_PUSH_COUNTER;
  let failures = 0;
  if (existsSync(counter)) failures = Number(readFileSync(counter, "utf8")) || 0;
  writeFileSync(counter, String(failures + 1));
  log("push " + args.join(" ") + " attempt " + (failures + 1));
  if (failures === 0 && process.env.STUB_DROP_TUNNEL_ON_FIRST_PUSH) {
    try { process.kill(Number(readFileSync(process.env.STUB_TUNNEL_PID_FILE, "utf8")), "SIGTERM"); } catch {}
  }
  if (failures === 0 && process.env.STUB_HANG_FIRST_PUSH) spawnSync("sleep", ["30"]);
  process.exit(failures < Number(process.env.STUB_PUSH_FAILURES || 0) ? 1 : 0);
}
if (args[0] === "save") { log("save " + args.join(" ")); console.log("tar-bytes"); process.exit(0); }
log("UNEXPECTED " + args.join(" "));
process.exit(1);
`;

const sshStub = `#!/bin/sh
# cn-dev-side ssh stub: logs the options it was given and answers the remote
# commands the export script issues. printf (not echo: dash's echo would
# expand the literal backslash-n inside the pairing command). The bootstrap
# registry-image probe answers "absent" unless STUB_REGISTRY_PRESENT is set.
printf '%s\n' "$*" >> "$STUB_SSH_CALLS"
case "$*" in
  *"eventgraph-dev:seed"*) exit 0 ;;
  *"-N"*"-L"*) printf '%s\\n' "$$" > "$STUB_TUNNEL_PID_FILE"; exec sleep 30 >/dev/null 2>&1 ;;
  *"registry:2 >"*) [ -n "$STUB_REGISTRY_PRESENT" ] && exit 0; exit 1 ;;
  *"gzip -dc | docker load"*) exit 0 ;;
  *"docker run -d --name eventgraph-dev-registry"*) exit 0 ;;
  *"curl --connect-timeout 3 --max-time 5 -fsS -o /dev/null http://127.0.0.1:5000/v2/"*) exit 0 ;;
  *"docker pull"*) exit 0 ;;
  *"docker image inspect"*) echo "\${STUB_REMOTE_IMAGE_ID:-$STUB_IMAGE_ID}" ;;
  *"eventgraph-last-delivered-image"*) exit 0 ;;
  *"docker rmi 127.0.0.1:5000/eventgraph-dev:"*) exit 0 ;;
  *"docker rm -f eventgraph-dev-registry"*"docker volume rm eventgraph-dev-registry"*) exit 0 ;;
  *) echo "ssh stub: unexpected remote command: $*" >&2; exit 1 ;;
esac
`;

const curlStub = `#!/bin/sh
case "$*" in *"http://127.0.0.1:5000/v2/"*) ;; *) exit 1 ;; esac
# Both readiness probes must be bounded: a stalled curl must not consume the
# whole push budget before the docker push watchdog is even started.
case " $* " in *" --connect-timeout 3 "*) ;; *) echo "missing connect timeout" >&2; exit 9 ;; esac
case " $* " in *" --max-time 5 "*) ;; *) echo "missing total timeout" >&2; exit 9 ;; esac
n="$(cat "$STUB_CURL_COUNTER")"
n=$((n + 1))
printf '%s\\n' "$n" > "$STUB_CURL_COUNTER"
[ "$n" -gt "$STUB_TUNNEL_READY_FAILS" ] || exit 7
exit 0
`;

const dateStub = `#!/bin/sh
if [ "$1" = "+%s" ] && [ -f "$STUB_FAKE_NOW" ]; then
  cat "$STUB_FAKE_NOW"
else
  /bin/date "$@"
fi
`;

const timeoutStub = `#!/bin/sh
# timeout(1) stub: passthrough unless STUB_EXPIRE_FAST is set, in which case
# the wrapped command is killed almost immediately (the watchdog firing)
# instead of waiting out the real multi-minute budget.
while [ "$#" -gt 0 ]; do
  case "$1" in
    -k) shift 2 ;;
    -*) shift ;;
    *) break ;;
  esac
done
dur="$1"; shift
printf '%s %s\\n' "$dur" "$*" >> "$STUB_TIMEOUT_CALLS"
if [ -n "$STUB_EXPIRE_FAST" ]; then
  "$@" & child=$!
  sleep 0.3
  if kill "$child" 2>/dev/null; then
    wait "$child" 2>/dev/null
    if [ -n "$STUB_ADVANCE_CLOCK_ON_EXPIRE" ]; then
      now="$(cat "$STUB_FAKE_NOW")"
      printf '%s\\n' "$((now + dur))" > "$STUB_FAKE_NOW"
    fi
    exit 124
  fi
  wait "$child"
  exit $?
fi
exec "$@"
`;

const keyscanStub = `#!/bin/sh
# Emulates ssh-keyscan: offers the per-test generated ed25519 and ECDSA host
# keys, the two algorithms the real sshd offers and the script scans for.
[ -n "$STUB_KEYSCAN_FAIL" ] && exit 2
echo "$CN_DEV_HOST $(cat "$STUB_OFFERED_PUB")"
echo "$CN_DEV_HOST $(cat "$STUB_OFFERED_ECDSA_PUB")"
`;

const dirs: string[] = [];

// Generates a real host key in the sandbox and returns its public line and
// fingerprint, so wrong-key tests fail through real fingerprint math.
function keygen(dir: string, name: string, type: "ed25519" | "ecdsa" = "ed25519") {
  const file = path.join(dir, name);
  spawnSync("ssh-keygen", ["-q", "-t", type, "-N", "", "-f", file], { encoding: "utf8" });
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

// One sandbox = one VM13 home offering a generated ed25519 and ECDSA host key;
// the pin defaults to the ed25519 key's fingerprint, so callers opt into the
// other modes (pinEcdsa reproduces the 2026-10-27 CD failure: the secret pins
// the ECDSA key while the script only scanned ed25519).
function sandbox(
  opts: { pinOtherKey?: boolean; pinEcdsa?: boolean; noPin?: boolean; failKeyscan?: boolean; registryPresent?: boolean; pushFailures?: number; remoteImageId?: string; tunnelReadyFails?: number; dropTunnelOnFirstPush?: boolean; hangFirstPush?: boolean } = {},
): Sandbox {
  const dir = mkdtempSync(path.join(tmpdir(), "export-image-"));
  dirs.push(dir);
  const offered = keygen(dir, "offered");
  const offeredEcdsa = keygen(dir, "offered-ecdsa", "ecdsa");
  const home = path.join(dir, "home");
  mkdirSync(path.join(home, ".ssh"), { recursive: true });
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "docker"), dockerStub);
  writeFileSync(path.join(bin, "ssh"), sshStub);
  writeFileSync(path.join(bin, "ssh-keyscan"), keyscanStub);
  writeFileSync(path.join(bin, "curl"), curlStub);
  writeFileSync(path.join(bin, "timeout"), timeoutStub);
  writeFileSync(path.join(bin, "date"), dateStub);
  writeFileSync(path.join(bin, "sudo"), `#!/bin/sh\n[ "$1" = "-n" ] && shift\nexec "$@"\n`);
  for (const f of ["docker", "ssh", "ssh-keyscan", "sudo", "curl", "timeout", "date"]) spawnSync("chmod", ["+x", path.join(bin, f)]);
  writeFileSync(path.join(dir, "ssh-calls.log"), "");
  writeFileSync(path.join(dir, "docker-calls.log"), "");
  writeFileSync(path.join(dir, "timeout-calls.log"), "");
  writeFileSync(path.join(dir, "push-counter"), "0");
  writeFileSync(path.join(dir, "curl-counter"), "0");
  writeFileSync(path.join(dir, "fake-now"), String(Math.floor(Date.now() / 1000)));
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
    STUB_OFFERED_ECDSA_PUB: path.join(dir, "offered-ecdsa.pub"),
    STUB_PUSH_COUNTER: path.join(dir, "push-counter"),
    STUB_CURL_COUNTER: path.join(dir, "curl-counter"),
    STUB_TIMEOUT_CALLS: path.join(dir, "timeout-calls.log"),
    STUB_FAKE_NOW: path.join(dir, "fake-now"),
    STUB_TUNNEL_PID_FILE: path.join(dir, "tunnel.pid"),
    STUB_TUNNEL_READY_FAILS: "0",
    EVENTGRAPH_IMAGE: imageRef,
    EVENTGRAPH_RELEASE_SHA: releaseSha,
    EVENTGRAPH_DEV_SSH_FINGERPRINT: undefined,
  };
  if (opts.registryPresent) env.STUB_REGISTRY_PRESENT = "1";
  if (opts.pushFailures) env.STUB_PUSH_FAILURES = String(opts.pushFailures);
  if (opts.tunnelReadyFails) env.STUB_TUNNEL_READY_FAILS = String(opts.tunnelReadyFails);
  if (opts.dropTunnelOnFirstPush) env.STUB_DROP_TUNNEL_ON_FIRST_PUSH = "1";
  if (opts.hangFirstPush) {
    env.STUB_HANG_FIRST_PUSH = "1";
    env.STUB_EXPIRE_FAST = "1";
    env.STUB_ADVANCE_CLOCK_ON_EXPIRE = "1";
  }
  if (opts.remoteImageId) env.STUB_REMOTE_IMAGE_ID = opts.remoteImageId;
  if (!opts.noPin) {
    env.EVENTGRAPH_DEV_SSH_FINGERPRINT = opts.pinEcdsa
      ? offeredEcdsa.fingerprint
      : opts.pinOtherKey
        ? keygen(dir, "other").fingerprint
        : offered.fingerprint;
  }
  if (opts.failKeyscan) env.STUB_KEYSCAN_FAIL = "1";
  return { dir, home, env };
}

const run = (env: Record<string, string | undefined>) =>
  spawnSync("sh", [path.join(repoRoot, "scripts/ci/export-image-vm13.sh")], { env, encoding: "utf8" });

const content = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const pinnedFile = (home: string) => path.join(home, ".ssh/known_hosts.cndev");

after(async () => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

test("a cn-dev host key that does not match the pinned fingerprint is refused before any bytes move", () => {
  const { dir, home, env } = sandbox({ pinOtherKey: true });
  const res = run(env);
  assert.notEqual(res.status, 0, "a mismatched host key must abort delivery");
  assert.match(res.stderr, /pinned fingerprint/);
  assert.equal(content(path.join(dir, "docker-calls.log")), "", "no docker command may run");
  assert.equal(content(path.join(dir, "ssh-calls.log")), "", "no ssh connection may be attempted");
  assert.ok(!existsSync(path.join(home, ".ssh/known_hosts.cndev")), "no key may be trusted");
  assert.ok(!existsSync(`${pinnedFile(home)}.scan`));
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
  assert.ok(!existsSync(pinnedFile(home)));
});

test("cold registry: bootstraps the registry image once, pushes, and records the verified pairing", () => {
  const { dir, home, env } = sandbox();
  const offeredPub = readFileSync(path.join(dir, "offered.pub"), "utf8").trim();
  const res = run(env);
  assert.equal(res.status, 0, res.stderr);
  const dockerCalls = content(path.join(dir, "docker-calls.log"));
  assert.ok(!dockerCalls.includes("UNEXPECTED"), dockerCalls);
  assert.ok(!dockerCalls.includes(`pull ${imageRef}`), "VM13 must not re-pull a local digest");
  // The registry image is fetched (Hub first) and shipped via the one-shot stream.
  assert.ok(dockerCalls.includes("pull registry:2"), "the registry image must be fetched on VM13");
  assert.ok(dockerCalls.includes("save registry:2"), "a missing registry image must be shipped by stream");
  // The app itself is delivered only through the registry: tag + push, no save.
  assert.ok(dockerCalls.includes(`tag ${imageId} ${registryTag}`), dockerCalls);
  assert.ok(dockerCalls.includes(`push --quiet ${registryTag}`), dockerCalls);
  assert.ok(!dockerCalls.includes(`save ${tag}`), "the app image must no longer be shipped by docker save");
  const pinnedFile_ = pinnedFile(home);
  assert.equal(readFileSync(pinnedFile_, "utf8"), `${cnDevHost} ${offeredPub}\n`, "only the verified key is trusted");
  assert.ok(!existsSync(`${pinnedFile_}.scan`));
  const sshCalls = content(path.join(dir, "ssh-calls.log")).trim().split("\n");
  // 11 hops: registry probe, bootstrap load, container ensure, /v2/ wait, seed,
  // tunnel, remote pull, remote id, pairing write, transport-tag cleanup,
  // registry+volume teardown.
  assert.equal(sshCalls.length, 11, `probe, load, ensure, wait, seed, tunnel, pull, id, record, tag-cleanup, cleanup — got: ${sshCalls.join(" || ")}`);
  assert.ok(sshCalls.some((c) => c.includes("curl --connect-timeout 3 --max-time 5 -fsS -o /dev/null http://127.0.0.1:5000/v2/")),
    "cn-dev registry readiness must have a connection and total timeout before image transfer");
  for (const call of sshCalls) {
    assert.ok(call.includes(`UserKnownHostsFile=${pinnedFile_}`), `ssh must pin the verified host key: ${call}`);
    assert.ok(call.includes("HostKeyAlgorithms=ssh-ed25519"), `ssh must negotiate the verified algorithm: ${call}`);
    assert.ok(call.includes("ConnectTimeout=15"), `SSH handshake must not outlive the image push watchdog: ${call}`);
    assert.ok(!call.includes(".ssh/known_hosts "), "the shared known_hosts must not be used");
  }
  assert.ok(sshCalls.some((c) => c.includes("docker run -d --name eventgraph-dev-registry") && c.includes("-p 127.0.0.1:5000:5000") && c.includes("-v eventgraph-dev-registry:/var/lib/registry")), "the registry must be loopback-only with a persistent volume");
  assert.ok(sshCalls.some((c) => c.includes("eventgraph-dev:seed") && c.includes("eventgraph-last-delivered-image")), "the registry is seeded from cn-dev's own local images over loopback");
  assert.ok(sshCalls.some((c) => c.includes("-N") && c.includes(`-L 127.0.0.1:5000:127.0.0.1:5000`)), "the push must go through a loopback SSH tunnel");
  assert.ok(sshCalls.some((c) => c.includes(`docker pull '${registryTag}'`)), "cn-dev must pull from its own loopback registry");
  assert.ok(sshCalls.some((c) => c.includes("eventgraph-last-delivered-image") && c.includes(tag) && c.includes(imageRef)), "the pairing file must bind the delivered tag to the release digest");
  assert.ok(sshCalls.some((c) => c.includes(`docker rmi '${registryTag}'`) && c.includes(`docker rmi '${registryRepo}:seed'`)),
    "transport-only release and seed tags must be removed so stale image IDs stay reclaimable");
  assert.ok(sshCalls.some((c) => c.includes("docker rm -f eventgraph-dev-registry") && c.includes("docker volume rm eventgraph-dev-registry")),
    "a verified delivery must remove the transport registry and its volume");
});

test("retry/warm registry: no bootstrap stream, only the incremental push", () => {
  const { dir, env } = sandbox({ registryPresent: true });
  const res = run(env);
  assert.equal(res.status, 0, res.stderr);
  const dockerCalls = content(path.join(dir, "docker-calls.log"));
  assert.ok(!dockerCalls.includes("save registry:2"), "an already-present registry image must not be re-shipped");
  assert.ok(!dockerCalls.includes("pull registry:2"), "an already-present registry image must not be re-fetched");
  assert.ok(dockerCalls.includes(`push --quiet ${registryTag}`));
  const sshCalls = content(path.join(dir, "ssh-calls.log"));
  assert.ok(!sshCalls.includes("gzip -dc | docker load"), "no stream load may happen");
  assert.ok(sshCalls.includes("docker rm -f eventgraph-dev-registry") && sshCalls.includes("docker volume rm eventgraph-dev-registry"),
    "successful retry still removes transport scratch state");
});

test("a slow SSH tunnel must become ready before any image push", () => {
  const { dir, env } = sandbox({ registryPresent: true, tunnelReadyFails: 2 });
  const res = run(env);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(Number(content(path.join(dir, "curl-counter"))) >= 3, "the tunnel readiness endpoint must be polled");
  assert.ok(content(path.join(dir, "docker-calls.log")).includes(`push --quiet ${registryTag}`));
});

test("a push that fails twice succeeds on the third attempt (blobs already uploaded are skipped)", () => {
  const { dir, env } = sandbox({ registryPresent: true, pushFailures: 2 });
  const res = run(env);
  assert.equal(res.status, 0, res.stderr);
  const pushes = content(path.join(dir, "docker-calls.log")).split("\n").filter((l) => l.startsWith("push "));
  assert.equal(pushes.length, 3, `exactly three push attempts — got: ${pushes.join(" || ")}`);
  assert.match(content(path.join(dir, "ssh-calls.log")), /docker pull/, "the verified pull still happens");
});

test("a wedged push is killed by the watchdog budget and the retry completes the delivery", () => {
  // 2026-10-28 12:33Z run: every blob was committed, the manifest was never
  // sent, tunnel and session stayed healthy, and appleboy's command_timeout
  // killed the whole script. The per-attempt watchdog must return control to
  // the resumable loop instead.
  const { dir, env } = sandbox({ registryPresent: true, hangFirstPush: true });
  const res = run(env);
  assert.equal(res.status, 0, res.stderr);
  const pushes = content(path.join(dir, "docker-calls.log")).split("\n").filter((l) => l.startsWith("push "));
  assert.equal(pushes.length, 2, `the wedged first attempt must be retried — got: ${pushes.join(" || ")}`);
  const timeouts = content(path.join(dir, "timeout-calls.log")).trim().split("\n").filter(Boolean);
  assert.ok(timeouts.length >= 2, `every attempt must be watchdog-bounded — got: ${timeouts.join(" || ")}`);
  // Advance the fake clock by the actual watchdog duration on expiry.
  // The first attempt must leave time for a retry after its simulated stall.
  assert.equal(Number(timeouts[0]!.split(" ")[0]), 14 * 60, "first attempt must reserve 2m for retry");
  assert.ok(Number(timeouts[1]!.split(" ")[0]) > 0 && Number(timeouts[1]!.split(" ")[0]) <= 2 * 60,
    "second attempt must use the remaining shared budget after the real timeout");
  for (const t of timeouts) {
    const dur = Number(t.split(" ")[0]);
    assert.ok(dur > 0 && dur <= 16 * 60, `the budget must fit appleboy's 20m command_timeout: ${t}`);
    assert.ok(t.includes("push") && t.includes("--quiet"), `the watchdog must wrap the quiet push: ${t}`);
  }
  assert.match(content(path.join(dir, "ssh-calls.log")), /docker pull/, "the verified pull still happens");
});

test("a tunnel that dies during a push is replaced before the retry", () => {
  const { dir, env } = sandbox({ registryPresent: true, pushFailures: 1, dropTunnelOnFirstPush: true });
  const res = run(env);
  assert.equal(res.status, 0, res.stderr);
  const pushes = content(path.join(dir, "docker-calls.log")).split("\n").filter((l) => l.startsWith("push "));
  assert.equal(pushes.length, 2, "the failed first push must be retried");
  const tunnels = content(path.join(dir, "ssh-calls.log")).split("\n").filter((l) => l.includes("-N") && l.includes("-L"));
  assert.equal(tunnels.length, 2, `a dead tunnel must be re-established before the retry — got: ${tunnels.join(" || ")}`);
});

test("a push that never succeeds fails the delivery without touching cn-dev's images", () => {
  const { dir, env } = sandbox({ registryPresent: true, pushFailures: 3 });
  const res = run(env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Pushing .* failed/);
  const sshCalls = content(path.join(dir, "ssh-calls.log"));
  assert.ok(!sshCalls.includes("docker pull"), "no remote pull may happen after a failed push");
  assert.ok(!sshCalls.includes("eventgraph-last-delivered-image.tmp"), "the pairing file must not be written");
});

test("a remote image that is not the published one fails the delivery", () => {
  const { dir, env } = sandbox({ registryPresent: true, remoteImageId: `sha256:${"b".repeat(64)}` });
  const res = run(env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /did not end up with the published image/);
  assert.ok(!content(path.join(dir, "ssh-calls.log")).includes("eventgraph-last-delivered-image.tmp"));
});

test("the pinned host key is written to a dedicated known_hosts and every ssh hop uses it", () => {
  const { dir, home, env } = sandbox({ registryPresent: true });
  const offeredPub = readFileSync(path.join(dir, "offered.pub"), "utf8").trim();
  const res = run(env);
  assert.equal(res.status, 0, res.stderr);
  const dockerCalls = content(path.join(dir, "docker-calls.log"));
  assert.ok(!dockerCalls.includes("UNEXPECTED") && !dockerCalls.includes(`pull ${imageRef}`), "VM13 must not re-pull a local digest");
  assert.ok(dockerCalls.includes(`tag ${imageId} ${registryTag}`));
  const pinned = readFileSync(pinnedFile(home), "utf8");
  assert.equal(pinned, `${cnDevHost} ${offeredPub}\n`, "only the verified key is trusted");
  const sshCalls = content(path.join(dir, "ssh-calls.log")).trim().split("\n");
  for (const call of sshCalls) {
    assert.ok(call.includes(`UserKnownHostsFile=${pinnedFile(home)}`), `ssh must pin the verified host key: ${call}`);
  }
});

test("a pin for the ECDSA key (the 2026-10-27 CD failure) authorizes delivery and pins that algorithm", () => {
  const { dir, home, env } = sandbox({ pinEcdsa: true, registryPresent: true });
  const ecdsaPub = readFileSync(path.join(dir, "offered-ecdsa.pub"), "utf8").trim();
  const res = run(env);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(readFileSync(pinnedFile(home), "utf8"), `${cnDevHost} ${ecdsaPub}\n`, "the verified ECDSA key, and only it, is trusted");
  const sshCalls = content(path.join(dir, "ssh-calls.log")).trim().split("\n");
  assert.ok(sshCalls.length >= 1);
  for (const call of sshCalls) {
    assert.ok(call.includes("HostKeyAlgorithms=ecdsa-sha2-nistp256"), `ssh must negotiate the pinned algorithm: ${call}`);
  }
});

test("deploy-vm13-preview.sh wires the same pinning for the database tunnel", () => {
  const vm13 = readFileSync(path.join(repoRoot, "scripts/ci/deploy-vm13-preview.sh"), "utf8");
  const exportScript = readFileSync(path.join(repoRoot, "scripts/ci/export-image-vm13.sh"), "utf8");
  // appleboy/ssh-action executes script_path files standalone on the host, so
  // both scripts must inline the same verification instead of sourcing a sibling.
  for (const script of [vm13, exportScript]) {
    assert.ok(!script.includes('dirname "$0"'), "script_path scripts must stay self-contained");
    assert.ok(script.includes('cndev_scan="$(mktemp "${CNDEV_KNOWN_HOSTS}.XXXXXX")"'), "each parallel deploy must use a unique keyscan scratch file");
  }
  const blockOf = (script: string) => {
    const start = script.indexOf(': "${EVENTGRAPH_DEV_SSH_FINGERPRINT:?');
    const endMarker = 'cndev_algo="$(awk \'{print $2; exit}\' "$CNDEV_KNOWN_HOSTS")"';
    const end = script.indexOf(endMarker, start);
    assert.ok(start >= 0 && end >= 0, "the pinning block must exist");
    return script.slice(start, end + endMarker.length);
  };
  assert.equal(blockOf(vm13), blockOf(exportScript), "both legs must verify cn-dev identically");
  assert.ok(!vm13.includes("ssh_keyscan"), "the trust-on-first-keyscan bootstrap must be gone");
  assert.ok(vm13.includes("-o UserKnownHostsFile=/home/ubuntu/.ssh/known_hosts.cndev"), "the tunnel unit must pin the verified file");
  assert.ok(vm13.includes("-o HostKeyAlgorithms=$cndev_algo"), "the tunnel unit must negotiate the verified algorithm");
});
