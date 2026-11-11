// Which models a step may use (admin) and whether it is sent an image (runtime) read the same flag.
import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb } from "@aihot/backend/db";
import { switchModel } from "@aihot/backend/admin/models";
import {
  CAPABILITIES,
  capabilityAcceptsModel,
  modelSupportsVision,
} from "@aihot/backend/editorial/models";
import { MODELS } from "@aihot/backend/providers/llm";

after(closeDb);

test("every step takes a model that reads images; only a step that needs images refuses a text model", async () => {
  const understand = CAPABILITIES.understand;
  assert.equal(capabilityAcceptsModel(understand, MODELS["glm-5.3-flash"]!), true);
  assert.equal(capabilityAcceptsModel(understand, MODELS["qwen3-vl-flash"]!), true);
  assert.equal(capabilityAcceptsModel(understand, MODELS["deepseek-flash"]!), true);
  assert.equal(capabilityAcceptsModel(CAPABILITIES.score, MODELS["qwen3-vl-flash"]!), true);
  assert.equal(capabilityAcceptsModel({ ...understand, vision: true }, MODELS["deepseek-flash"]!), false);

  await assert.rejects(
    switchModel("understand", "qwen3-vl-flash", "disallow implicit preset", "test"),
    /Choose a model from Model Management/);

  assert.equal('vision' in understand, false);
});

test("runtime image attachment is explicit rather than probing presets with unspecified vision support", async () => {
  assert.equal(await modelSupportsVision("qwen3-vl-flash"), true);
  assert.equal(await modelSupportsVision("glm-5.3-flash"), true);
  assert.equal(await modelSupportsVision("qwen3.8-flash"), false);
  assert.equal(await modelSupportsVision("default"), process.env.LLM_VISION === "true");
});
