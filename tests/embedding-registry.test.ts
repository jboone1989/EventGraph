// The registered-model route (EMBEDDING_MODEL=model:<id>): the connection's stored credential,
// address and vendor budget carry the request; a plain model name never routes through the registry;
// a vector of the wrong size is refused with its receipt failed; and stored vectors of other models
// are never rewritten by the switch.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { promisify } from "node:util";
import type { ConnectionInput, ModelInput } from "@aihot/contracts/providers";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { sha256 } from "@aihot/backend/lib/ids";
import {
  configurationFingerprint, configurationSnapshot, createConnection, createRegisteredModel, loadConnection, loadModel, updateRegisteredModel,
} from "@aihot/backend/providers/registry/connections";

const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = createRequire(new URL("../packages/backend/package.json", import.meta.url))("undici") as typeof import("undici");
const prior = { dispatcher: getGlobalDispatcher(), proxy: config.egressProxyUrl, private: config.allowPrivateNetworkFetch };
const network = new MockAgent();
network.disableNetConnect();
setGlobalDispatcher(network);
// The mocked host resolves nowhere; the guard only needs to let it through.
config.egressProxyUrl = null;
config.allowPrivateNetworkFetch = true;
process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const T = `registry-${tag()}`;
const KEY = "registry-stored-key";
let answer: unknown;
const hits: Array<{ authorization: string; body: { model: string; input: string[]; stream?: unknown } }> = [];
network.get("https://zhipu.invalid").intercept({ path: "/v4/embeddings", method: "POST" }).reply((req) => {
  const headers = (req.headers ?? {}) as Record<string, string>;
  hits.push({ authorization: String(headers.authorization ?? ""), body: JSON.parse(String(req.body)) });
  return { statusCode: 200, data: answer as object };
});
after(async () => {
  setGlobalDispatcher(prior.dispatcher);
  config.egressProxyUrl = prior.proxy;
  config.allowPrivateNetworkFetch = prior.private;
  await network.close();
  await closeDb();
});

const connectionInput = (extra: Partial<ConnectionInput> = {}): ConnectionInput => ({
  name: "Zhipu test", vendor: "zhipu", protocol: "openai-compatible", baseUrl: "https://zhipu.invalid/v4",
  timeoutMs: 60000, enabled: true, credential: { action: "replace", value: KEY }, ...extra,
});
const modelInput = (providerId: string, routeEnabled = false): ModelInput => ({
  providerId, modelId: `${T}-embedding`, adapter: "embedding", endpointOverride: null, timeoutOverrideMs: null,
  capabilities: ["embedding"], requestDefaults: {}, probeSpec: { capability: "embedding", body: { input: ["sample"] }, response: "embedding" },
  stream: false, complexity: "medium", documentationUrl: null, notes: null, enabled: true, routeEnabled,
});
async function certify(id: string) {
  const m = await loadModel(id), c = await loadConnection(m.provider_id);
  await sql`INSERT INTO registered_model_checks(model_id, capability, config_fingerprint, config_snapshot, status, verified_at)
    VALUES (${id}::uuid, 'embedding', ${configurationFingerprint(c, m)}, ${sql.json(configurationSnapshot(c, m))}, 'verified', now())
    ON CONFLICT (model_id, capability) DO UPDATE SET config_fingerprint = EXCLUDED.config_fingerprint, config_snapshot = EXCLUDED.config_snapshot, status = 'verified', verified_at = now()`;
}

const connection = await createConnection(connectionInput(), "test", "test");
const model = await createRegisteredModel(modelInput(connection.id), "test", "test");
await certify(model.id);
await updateRegisteredModel(model.id, modelInput(connection.id, true), model.version, "route", "test");
// The embeddings module reads these when it loads; no EMBEDDING_API_KEY or DASHSCOPE_API_KEY exists.
delete process.env.EMBEDDING_API_KEY;
delete process.env.DASHSCOPE_API_KEY;
process.env.EMBEDDING_MODEL = `model:${model.id}`;
const { EMBEDDING_MODEL, embeddingsAvailable, ensureEmbeddings } = await import("@aihot/backend/providers/embeddings");

test("the connection's stored credential, address and vendor budget carry the request", async () => {
  const items = [{ id: `${T}-a`, text: `${T} first` }, { id: `${T}-b`, text: `${T} second` }];
  // A vector stored under another model is none of this route's business.
  await sql`INSERT INTO embeddings (kind, ref_id, model, text_hash, vector) VALUES ('article', ${items[0]!.id}, 'text-embedding-v4', ${sha256(items[0]!.text)}, ${[9, 9, 9]})`;
  answer = { data: [{ index: 0, embedding: [1, 0, 0] }, { index: 1, embedding: [0, 1, 0] }] };
  assert.equal(embeddingsAvailable(), true, "a registered model is an embedding configuration");
  assert.deepEqual((await ensureEmbeddings(items)).get(items[1]!.id), [0, 1, 0]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.authorization, `Bearer ${KEY}`, "the connection's stored credential is used, never an environment key");
  assert.equal(hits[0]!.body.model, model.modelId);
  assert.deepEqual(hits[0]!.body.input, [items[0]!.text, items[1]!.text]);
  assert.equal("stream" in hits[0]!.body, false);
  assert.deepEqual(
    (await sql<{ ref_id: string; model: string }[]>`SELECT ref_id, model FROM embeddings WHERE ref_id IN ${sql(items.map((i) => i.id))} ORDER BY ref_id, model`)
      .map((r) => [r.ref_id, r.model]),
    [[items[0]!.id, EMBEDDING_MODEL], [items[0]!.id, "text-embedding-v4"], [items[1]!.id, EMBEDDING_MODEL]],
    "vectors of other models are kept; this route stores under its own model: reference");
  const [receipt] = await sql`SELECT service, purpose, model, status FROM receipts WHERE subject = ${`article:${items[0]!.id}`}`;
  assert.deepEqual(receipt, { service: "zhipu", purpose: "embedding", model: model.modelId, status: "completed" });
});

// Variants that need another module load (EMBEDDING_DIMS, a bad model, no provider switch) run in
// child processes against the same database, connection and stubbed endpoint.
async function freshProcess(env: Record<string, string>, code: string, response: unknown = { data: [{ index: 0, embedding: [1, 2, 3] }] }) {
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", `
    const { MockAgent, setGlobalDispatcher } = await import("undici");
    const network = new MockAgent(); network.disableNetConnect(); setGlobalDispatcher(network);
    network.get("https://zhipu.invalid").intercept({ path: "/v4/embeddings", method: "POST" })
      .reply(200, ${JSON.stringify(response)});
    const { config } = await import("@aihot/backend/config"); config.egressProxyUrl = null; config.allowPrivateNetworkFetch = true;
    const { embeddingsAvailable, ensureEmbeddings } = await import("@aihot/backend/providers/embeddings");
    const { sql, closeDb } = await import("@aihot/backend/db");
    try { ${code} } finally { await closeDb(); }
  `], { env: { ...process.env, ...env } });
  return JSON.parse(stdout);
}

test("a vector of the wrong size is refused and its receipt failed", async () => {
  const item = { id: `${T}-dims`, text: `${T} dims text` };
  const out = await freshProcess({ EMBEDDING_DIMS: "4" }, `
    const id = ${JSON.stringify(item.id)}, subject = ${JSON.stringify(`article:${item.id}`)};
    try {
      await ensureEmbeddings([{ id, text: ${JSON.stringify(item.text)} }]);
      console.log(JSON.stringify({ ok: true }));
    } catch (error) {
      const [receipt] = await sql\`SELECT status FROM receipts WHERE subject = \${subject}\`;
      const rows = await sql\`SELECT 1 FROM embeddings WHERE ref_id = \${id}\`;
      console.log(JSON.stringify({ ok: false, message: String(error.message), receipt: receipt?.status, rows: rows.length }));
    }
  `);
  assert.equal(out.ok, false);
  assert.match(out.message, /EMBEDDING_DIMS is 4/);
  assert.equal(out.receipt, "failed");
  assert.equal(out.rows, 0);
});

test("a registered model without a credential is refused, with no paid request", async () => {
  const bare = await createConnection(connectionInput({ name: "Zhipu bare", credential: { action: "keep" } }), "test", "test");
  const bareModel = await createRegisteredModel(modelInput(bare.id), "test", "test");
  await certify(bareModel.id);
  await updateRegisteredModel(bareModel.id, modelInput(bare.id, true), bareModel.version, "route", "test");
  const item = { id: `${T}-bare`, text: `${T} bare text` };
  const out = await freshProcess({ EMBEDDING_MODEL: `model:${bareModel.id}` }, `
    const subject = ${JSON.stringify(`article:${item.id}`)};
    try {
      await ensureEmbeddings([{ id: ${JSON.stringify(item.id)}, text: ${JSON.stringify(item.text)} }]);
      console.log(JSON.stringify({ ok: true }));
    } catch (error) {
      const receipts = await sql\`SELECT 1 FROM receipts WHERE subject = \${subject}\`;
      console.log(JSON.stringify({ ok: false, message: String(error.message), receipts: receipts.length }));
    }
  `);
  assert.equal(out.ok, false);
  assert.match(out.message, /Credential is missing/);
  assert.equal(out.receipts, 0);
});

test("a plain model name never routes through the registry, and the safety valve still applies", async () => {
  const item = { id: `${T}-plain`, text: `${T} plain text` };
  const out = await freshProcess({ EMBEDDING_MODEL: "embedding-3" }, `
    const available = embeddingsAvailable();
    try {
      await ensureEmbeddings([{ id: ${JSON.stringify(item.id)}, text: ${JSON.stringify(item.text)} }]);
      console.log(JSON.stringify({ available, ok: true }));
    } catch (error) {
      console.log(JSON.stringify({ available, ok: false, message: String(error.message) }));
    }
  `);
  assert.deepEqual(out, { available: false, ok: false, message: "EMBEDDING_API_KEY (or DASHSCOPE_API_KEY) missing" });
  const off = await freshProcess({ MODEL_CALLS_ENABLED: "false" }, `
    console.log(JSON.stringify({ available: embeddingsAvailable() }));
  `);
  assert.equal(off.available, false, "MODEL_CALLS_ENABLED=false switches registered embeddings off too");
});

test("short registered embedding batch fails its receipt and never writes partial vectors", async () => {
  const a = { id: `${T}-short-a`, text: `${T} short a` };
  const b = { id: `${T}-short-b`, text: `${T} short b` };
  const out = await freshProcess({}, `
    const items = ${JSON.stringify([a,b])};
    try { await ensureEmbeddings(items); console.log(JSON.stringify({ok:true})); }
    catch (error) { console.log(JSON.stringify({ok:false})); }
  `, { data: [{ index: 0, embedding: [1, 2, 3] }] });
  assert.equal(out.ok, false);
  const [receipt] = await sql`SELECT status FROM receipts WHERE subject = ${`article:${a.id}`}`;
  const rows = await sql`SELECT 1 FROM embeddings WHERE ref_id IN ${sql([a.id, b.id])}`;
  assert.equal(receipt?.status, "failed");
  assert.equal(rows.length, 0);
});

test("out-of-order indexed vectors map to the correct source articles", async () => {
  const a = { id: `${T}-reverse-a`, text: `${T} reverse a` };
  const b = { id: `${T}-reverse-b`, text: `${T} reverse b` };
  const out = await freshProcess({}, `
    const items = ${JSON.stringify([a,b])};
    const result = await ensureEmbeddings(items);
    console.log(JSON.stringify({a:result.get(items[0].id),b:result.get(items[1].id)}));
  `, { data: [{ index: 1, embedding: [0, 1, 0] }, { index: 0, embedding: [1, 0, 0] }] });
  assert.deepEqual(out, {a:[1,0,0],b:[0,1,0]});
});

test("index-less provider batches preserve input order for already-certified connections", async () => {
  const a = { id: T + "-unindexed-a", text: T + " no index a" };
  const b = { id: T + "-unindexed-b", text: T + " no index b" };
  const out = await freshProcess({ EMBEDDING_TEST_ITEMS: JSON.stringify([a, b]) }, `
    const items = JSON.parse(process.env.EMBEDDING_TEST_ITEMS);
    const vectors = await ensureEmbeddings(items);
    console.log(JSON.stringify({ a: vectors.get(items[0].id), b: vectors.get(items[1].id) }));
  `, { data: [{ embedding: [1, 0, 0] }, { embedding: [0, 1, 0] }] });
  assert.deepEqual(out, { a: [1, 0, 0], b: [0, 1, 0] });
});

test("mixed indexed and unindexed provider rows fail closed instead of corrupting grouping", async () => {
  const a = { id: T + "-mixed-a", text: T + " mixed a" };
  const b = { id: T + "-mixed-b", text: T + " mixed b" };
  const out = await freshProcess({ EMBEDDING_TEST_ITEMS: JSON.stringify([a, b]) }, `
    const items = JSON.parse(process.env.EMBEDDING_TEST_ITEMS);
    try {
      await ensureEmbeddings(items);
      console.log(JSON.stringify({ accepted: true }));
    } catch {
      console.log(JSON.stringify({ accepted: false }));
    }
  `, { data: [{ index: 0, embedding: [1, 0, 0] }, { embedding: [0, 1, 0] }] });
  assert.deepEqual(out, { accepted: false });
});
