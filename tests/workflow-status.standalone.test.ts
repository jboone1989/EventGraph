import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProviderManagement } from "@aihot/contracts/providers";
import { workflowStageStatus } from "../apps/web/app/features/admin/workflow-status.ts";

const data: ProviderManagement = {
  providers: [{
    id: "p", name: "智谱官方", vendor: "zhipu", protocol: "openai-compatible",
    baseUrl: "https://example.org", timeoutMs: 60000, enabled: true, policy: "none",
    credential: { configured: true }, version: 1, updatedAt: "2026-10-25T00:00:00Z",
  }],
  models: [{
    id: "m", providerId: "p", modelId: "glm-5.3-flash", adapter: "chat",
    endpointOverride: null, timeoutOverrideMs: null, capabilities: ["text"],
    requestDefaults: {}, probeSpec: { capability: "text", body: {}, response: "chat" },
    stream: false, complexity: "medium", documentationUrl: null, notes: null,
    enabled: true, routeEnabled: true, upstreamMetadata: {}, version: 1,
    updatedAt: "2026-10-25T00:00:00Z", routing: { eligibleCapabilities: ["text"], reasons: [] },
    checks: [{ capability: "text", status: "verified", verifiedAt: "2026-10-25T00:00:00Z", latencyMs: 900 }],
  }],
  protocols: [], workflows: [],
};
const stage = { key: "structure", label: "结构抽取", source: "admin", model: "model:m" };

test("current registered model reports operational evidence", () => {
  const s = workflowStageStatus(stage, data);
  assert.equal(s.kind, "ready");
  assert.equal(s.provider?.name, "智谱官方");
  assert.equal(s.check?.latencyMs, 900);
  assert.equal(s.canTest, true);
});
test("legacy stage selection is not incorrectly marked verified", () => {
  assert.equal(workflowStageStatus({ ...stage, model: "nvidia:legacy" }, data).kind, "unverified");
  assert.equal(workflowStageStatus({ ...stage, model: "model:missing" }, data).kind, "problem");
});
test("disabled providers, routing and test status block model readiness", () => {
  assert.equal(workflowStageStatus(stage, { ...data, providers: data.providers.map(p => ({ ...p, enabled: false })) }).kind, "problem");
  assert.equal(workflowStageStatus(stage, { ...data, models: data.models.map(m => ({ ...m, routeEnabled: false })) }).kind, "problem");
  const untested = { ...data, models: data.models.map(m => ({ ...m, routing: { eligibleCapabilities: [], reasons: ["测试已过期"] } })) };
  const s = workflowStageStatus(stage, untested);
  assert.equal(s.kind, "problem");
  assert.match(s.reason, /过期/);
});
