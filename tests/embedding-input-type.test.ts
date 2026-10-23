// NVIDIA's hosted retrieval embeddings refuse a request without input_type: the request to that
// host carries passage, every other endpoint (OpenAI, DashScope, a local fake) is sent untouched.
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb } from "@aihot/backend/db";

const T = `input-type-${tag()}`;
const requests: Array<Record<string, unknown>> = [];
const provider = await stub((_hit, req) => {
  requests.push(JSON.parse(req.body) as Record<string, unknown>);
  return { data: (requests.at(-1)!.input as string[]).map((_text, index) => ({ index, embedding: [1, 0] })) };
});
// The embeddings module reads these when it loads.
process.env.EMBEDDING_MODEL = T;
process.env.EMBEDDING_DIMS = "0";
process.env.EMBEDDING_API_KEY = "test-key";
process.env.EMBEDDING_BASE_URL = `${provider.url}/v1`;
const { embeddingsInputType, ensureEmbeddings } = await import("@aihot/backend/providers/embeddings");
after(async () => { await provider.close(); await closeDb(); });

test("only NVIDIA's hosted endpoint is asked for passage", () => {
  assert.equal(embeddingsInputType("https://integrate.api.nvidia.com/v1"), "passage");
  assert.equal(embeddingsInputType("https://INTegrate.API.Nvidia.com/v1"), "passage", "the host compares case-insensitively");
  assert.equal(embeddingsInputType("https://api.openai.com/v1"), undefined);
  assert.equal(embeddingsInputType("https://dashscope.aliyuncs.com/compatible-mode/v1"), undefined);
  assert.equal(embeddingsInputType(`${provider.url}/v1`), undefined);
  assert.equal(embeddingsInputType("not a url"), undefined);
});

test("a request to another endpoint carries no input_type", async () => {
  const it = { id: `${T}-1`, text: `${T} text` };
  await ensureEmbeddings([it]);
  assert.deepEqual(requests, [{ model: T, input: [it.text], encoding_format: "float" }]);
});
