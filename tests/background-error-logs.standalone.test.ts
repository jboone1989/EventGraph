// Inject a failing SQL client without changing production code or CI's default Node flags.
// A subprocess isolates the experimental module mock to this one regression case.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("initial and scheduled heartbeat write failures are logged with their role", async () => {
  const script = `
    import { mock } from "node:test";
    const failure = new Error("injected heartbeat database outage");
    const sql = Object.assign(() => Promise.reject(failure), { json: value => value });
    mock.module(new URL("./packages/backend/src/db.ts", import.meta.url).href, {
      namedExports: { sql },
    });
    const logged = [];
    const previousError = console.error;
    const previousInterval = globalThis.setInterval;
    let pulse;
    try {
      console.error = (...args) => {
        if (args[0] === "heartbeat_write_failed") logged.push([
          args[0], args[1], args[2] === failure
        ]);
      };
      globalThis.setInterval = callback => {
        pulse = callback;
        return { unref() {} };
      };
      const { startHeartbeat } = await import("./packages/backend/src/operations/heartbeat.ts");
      startHeartbeat("worker");
      await new Promise(resolve => setImmediate(resolve));
      if (!pulse) throw new Error("periodic heartbeat never scheduled");
      pulse();
      await new Promise(resolve => setImmediate(resolve));
    } finally {
      console.error = previousError;
      globalThis.setInterval = previousInterval;
    }
    console.log(JSON.stringify(logged));
  `;
  const { stdout } = await exec(process.execPath, [
    "--experimental-test-module-mocks", "--input-type=module", "-e", script,
  ], { cwd: new URL("../", import.meta.url), timeout: 20_000 });
  assert.deepEqual(JSON.parse(stdout.trim()), [
    ["heartbeat_write_failed", "worker", true],
    ["heartbeat_write_failed", "worker", true],
  ]);
});
