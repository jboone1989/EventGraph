// The development ingress died on every client abort mid-response: pipeline() throws
// synchronously (ERR_STREAM_UNABLE_TO_PIPE) when the client socket is already destroyed,
// so one departing reader killed the whole public entrance (RestartCount=11 on cn-dev).
// Reproduce both abort timings against the real script as a child process.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { after, test } from "node:test";

const upstream = createServer((req, res) => {
  if (req.url === "/late-head") {
    // Headers arrive only after the client has already gone.
    setTimeout(() => {
      if (!res.destroyed) { res.writeHead(200, { "content-type": "text/plain" }); res.end("late"); }
    }, 150);
    return;
  }
  if (req.url === "/chunked") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.write("first");
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("ok");
});
await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
const upstreamPort = (upstream.address() as { port: number }).port;

const ingressPort = 18000 + Math.floor(Math.random() * 1000);
const ingress = spawn(process.execPath, ["deploy/dev-ingress.mjs"], {
  env: { ...process.env, DEV_INGRESS_PORT: String(ingressPort), DEV_INGRESS_UPSTREAM_HOST: "127.0.0.1", DEV_INGRESS_UPSTREAM_PORT: String(upstreamPort) },
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
ingress.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
const exited: Promise<never> = new Promise((_, reject) => ingress.on("exit", (code) => reject(new Error(`ingress exited with ${code}: ${stderr.slice(-400)}`))));
await new Promise<void>((r) => ingress.stdout.on("data", (d: Buffer) => { if (String(d).includes("development ingress ready")) r(); }));

const plain = () => new Promise<{ status: number; body: string }>((resolve, reject) => {
  const req = request({ host: "127.0.0.1", port: ingressPort, path: "/ok" }, (res) => {
    let body = "";
    res.on("data", (c) => { body += c; });
    res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
  });
  req.on("error", reject);
  req.end();
});

// Abort the client socket: onFirstChunk after the first body byte, afterMs when headers never come.
const abortClient = (path: string, mode: { onFirstChunk: true } | { afterMs: number }) => new Promise<void>((resolve) => {
  const req = request({ host: "127.0.0.1", port: ingressPort, path });
  req.on("error", () => resolve());
  const timer = Number.isInteger((mode as { afterMs?: number }).afterMs)
    ? setTimeout(() => { req.destroy(); resolve(); }, (mode as { afterMs: number }).afterMs)
    : null;
  req.on("response", (res) => {
    res.on("data", () => {
      if (timer) return;
      req.destroy();
      resolve();
    });
    res.on("error", () => {});
  });
  req.end();
});

after(async () => {
  ingress.kill();
  upstream.close();
});

test("a client abort after headers keeps the ingress alive and serving", async () => {
  await Promise.race([
    (async () => {
      await abortClient("/chunked", { onFirstChunk: true });
      await new Promise((r) => setTimeout(r, 500));
      assert.equal((await plain()).body, "ok");
    })(),
    exited,
  ]);
  assert.equal(ingress.exitCode, null, "ingress must survive the abort");
});

test("a client abort before upstream headers keeps the ingress alive and serving", async () => {
  await Promise.race([
    (async () => {
      await abortClient("/late-head", { afterMs: 50 });
      await new Promise((r) => setTimeout(r, 500));
      assert.equal((await plain()).body, "ok");
    })(),
    exited,
  ]);
  assert.equal(ingress.exitCode, null, "ingress must survive the abort");
});
