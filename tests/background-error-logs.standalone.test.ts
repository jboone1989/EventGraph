// A failed operational heartbeat must remain visible to the existing process log;
// the timer is not a delivery guarantee and must not hide a database outage.
import assert from "node:assert/strict";
import { test, mock } from "node:test";

test("initial and scheduled heartbeat failures log their role and original error", async () => {
  const failure = new Error("injected heartbeat database outage");
  const sql = Object.assign(() => Promise.reject(failure), { json: (value: unknown) => value });
  const sqlMock = mock.module(new URL("../packages/backend/src/db.ts", import.meta.url).href, {
    namedExports: { sql },
  });
  const oldError = console.error;
  const oldInterval = globalThis.setInterval;
  const logs: unknown[][] = [];
  let pulse: (() => void) | undefined;
  try {
    console.error = (...args: unknown[]) => { logs.push(args); };
    globalThis.setInterval = ((callback: () => void) => {
      pulse = callback;
      return { unref() {} } as NodeJS.Timeout;
    }) as typeof setInterval;
    const { startHeartbeat } = await import("../packages/backend/src/operations/heartbeat.ts");
    startHeartbeat("worker");
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.ok(pulse, "must retain the periodic heartbeat");
    pulse();
    await new Promise<void>(resolve => setImmediate(resolve));
    const heartbeatErrors = logs.filter((entry) => entry[0] === "heartbeat_write_failed");
    assert.equal(heartbeatErrors.length, 2);
    for (const entry of heartbeatErrors) {
      assert.equal(entry[0], "heartbeat_write_failed");
      assert.equal(entry[1], "worker");
      assert.equal(entry[2], failure);
    }
  } finally {
    globalThis.setInterval = oldInterval;
    console.error = oldError;
    sqlMock.restore();
  }
});
