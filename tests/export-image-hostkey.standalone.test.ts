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


// The replacement delivery path is a stable rsync archive, not a registry.
// These stubs model an interrupted byte transfer and a fresh invocation over
// the same staged file. No real Docker daemon, SSH host or production API used.
function rsyncSandbox(opts: { pinEcdsa?: boolean; badHash?: boolean; badId?: boolean; badRevision?: boolean; transferFailure?: boolean } = {}) {
  const sb = sandbox({ pinEcdsa: opts.pinEcdsa });
  const bin = path.join(sb.dir, "bin");
  sb.env.STUB_STAGE = path.join(sb.dir, "remote-current.tar");
  sb.env.STUB_RSYNC_CALLS = path.join(sb.dir, "rsync-calls.log");
  sb.env.STUB_BAD_HASH = opts.badHash ? "1" : "";
  sb.env.STUB_BAD_ID = opts.badId ? "1" : "";
  sb.env.STUB_BAD_REVISION = opts.badRevision ? "1" : "";
  sb.env.STUB_RSYNC_FAIL = opts.transferFailure ? "1" : "";
  writeFileSync(path.join(bin, "docker"), [
    "#!/bin/sh",
    "printf '%s\\n' \"$*\" >> \"$STUB_CALLS\"",
    "case \"$*\" in",
    "  'image inspect '* )",
    "    case \"$*\" in",
    "      *'.Id'* ) printf '%s\\n' \"$STUB_IMAGE_ID\" ;;",
    "      *'org.opencontainers.image.revision'* ) printf '%s\\n' \"$STUB_REVISION\" ;;",
    "    esac ;;",
    "  'save '* ) printf '%s\\n' 'fixture image archive contents - unchanged layers' ;;",
    "  * ) echo \"unexpected docker: $*\" >&2; exit 1 ;;",
    "esac",
    ""
  ].join("\n"));
  writeFileSync(path.join(bin, "ssh"), [
    "#!/bin/sh",
    "printf '%s\\n' \"$*\" >> \"$STUB_SSH_CALLS\"",
    "case \"$*\" in",
    "  *'sha256sum '* )",
    "    if [ \"$STUB_BAD_HASH\" = 1 ]; then printf '%064d\\n' 0;",
    "    else sha256sum \"$STUB_STAGE\" | cut -d ' ' -f1; fi ;;",
    "  *'docker load -i '* ) printf 'load\\n' >> \"$STUB_CALLS\" ;;",
    "  *'docker image inspect --format'*'.Id'* )",
    "    if [ \"$STUB_BAD_ID\" = 1 ]; then printf 'sha256:wrong\\n';",
    "    else printf '%s\\n' \"$STUB_IMAGE_ID\"; fi ;;",
    "  *'docker image inspect --format'*'org.opencontainers.image.revision'* )",
    "    if [ \"$STUB_BAD_REVISION\" = 1 ]; then printf 'wrong-release\\n';",
    "    else printf '%s\\n' \"$STUB_REVISION\"; fi ;;",
    "  * ) : ;;",
    "esac",
    ""
  ].join("\n"));
  writeFileSync(path.join(bin, "rsync"), [
    "#!/bin/sh",
    "printf '%s\\n' \"$*\" >> \"$STUB_RSYNC_CALLS\"",
    "second_last=''; last=''",
    "for arg in \"$@\"; do second_last=\"$last\"; last=\"$arg\"; done",
    "if [ \"$STUB_RSYNC_FAIL\" = 1 ]; then",
    "  head -c 12 \"$second_last\" > \"$STUB_STAGE\"; exit 23",
    "fi",
    "cp \"$second_last\" \"$STUB_STAGE\"",
    ""
  ].join("\n"));
  writeFileSync(path.join(bin, "timeout"), [
    "#!/bin/sh", "[ \"$1\" = -k ] || exit 20",
    "[ \"$3\" = 30m ] || exit 21",
    "shift 3", "exec \"$@\"", ""
  ].join("\n"));
  for (const f of ["docker", "ssh", "rsync", "timeout"]) {
    const c = spawnSync("chmod", ["+x", path.join(bin, f)], { encoding: "utf8" });
    assert.equal(c.status, 0, c.stderr);
  }
  return sb;
}

test("rsync transports a digest-verified archive, preserving the existing image tag pairing", () => {
  const sb = rsyncSandbox();
  const res = run(sb.env);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Verified image/);
  assert.match(content(path.join(sb.dir, "docker-calls.log")), /save sha256:/);
  const transfers = content(path.join(sb.dir, "rsync-calls.log"));
  assert.match(transfers, /--inplace/);
  assert.match(transfers, /--partial/);
  assert.match(transfers, /--no-whole-file/);
  assert.match(transfers, /--compress-choice=zstd/);
  assert.match(transfers, /StrictHostKeyChecking=yes/);
  assert.match(transfers, /HostKeyAlgorithms=ssh-ed25519/);
  const hops = content(path.join(sb.dir, "ssh-calls.log"));
  assert.match(hops, /sha256sum/);
  assert.match(hops, /docker load/);
  assert.match(hops, /eventgraph-last-delivered-image/);
  assert.match(hops, /docker volume rm eventgraph-dev-registry/);
  assert.equal(readFileSync(path.join(sb.dir, "remote-current.tar"), "utf8"),
    "fixture image archive contents - unchanged layers\n");
});

test("an interrupted transfer preserves partial bytes but cannot load or publish an image", () => {
  const sb = rsyncSandbox({ transferFailure: true });
  const fail = run(sb.env);
  assert.notEqual(fail.status, 0);
  assert.match(fail.stderr, /staged bytes retained/);
  assert.equal(readFileSync(sb.env.STUB_STAGE!, "utf8").length, 12);
  assert.doesNotMatch(content(path.join(sb.dir, "ssh-calls.log")), /docker load|eventgraph-last-delivered-image/);
  sb.env.STUB_RSYNC_FAIL = "";
  const resume = run(sb.env);
  assert.equal(resume.status, 0, resume.stderr);
  assert.match(content(path.join(sb.dir, "ssh-calls.log")), /eventgraph-last-delivered-image/);
});

test("archive checksum mismatch fails before docker load and release pairing", () => {
  const sb = rsyncSandbox({ badHash: true });
  const res = run(sb.env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /checksum mismatch/);
  assert.doesNotMatch(content(path.join(sb.dir, "ssh-calls.log")), /docker load|eventgraph-last-delivered-image/);
});

test("a wrong loaded image identity cannot become the active Worker tag", () => {
  const sb = rsyncSandbox({ badId: true });
  const res = run(sb.env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /does not match/);
  assert.doesNotMatch(content(path.join(sb.dir, "ssh-calls.log")), /eventgraph-last-delivered-image/);
});

test("a wrong loaded source revision cannot become the active Worker tag", () => {
  const sb = rsyncSandbox({ badRevision: true });
  const res = run(sb.env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /revision does not match/);
  assert.doesNotMatch(content(path.join(sb.dir, "ssh-calls.log")), /eventgraph-last-delivered-image/);
});

test("the ECDSA pinned host key is used by rsync as well as SSH", () => {
  const sb = rsyncSandbox({ pinEcdsa: true });
  const res = run(sb.env);
  assert.equal(res.status, 0, res.stderr);
  assert.match(content(path.join(sb.dir, "rsync-calls.log")), /HostKeyAlgorithms=ecdsa-sha2-nistp256/);
  assert.match(content(path.join(sb.dir, "ssh-calls.log")), /HostKeyAlgorithms=ecdsa-sha2-nistp256/);
});
