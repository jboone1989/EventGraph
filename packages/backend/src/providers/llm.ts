import {normalizedRegistryActive,resolveModelReference} from './registry/connections.ts';
import {registeredRuntime,requestRegisteredModel,modelEndpoint} from './registry/runtime.ts';
import {storedCredential} from './registry/connection-secrets.ts';
// OpenAI-compatible chat calls, always through receipts. One model is enough: `default` is whatever the
// deployment names in LLM_BASE_URL / LLM_API_KEY / LLM_MODEL, and every capability uses it unless the
// site, an environment variable or the admin's model page picks one of the site's named presets
// (site/models.ts).
import type { z } from "zod";
import { PRESETS } from "@aihot/site/models";
import { nvidiaCapability } from "./nvidia-catalog.ts";
import {getProvider} from "./registry/repository.ts";
import {ChatProvider,instantiateProvider,parseSseCompletion as parseProviderStream} from "./registry/adapter.ts";
import { config, credential } from "../config.ts";
import { sha256 } from "../lib/ids.ts";
import { assertAccepted, paidRequest, ProviderRejectedError, rejectReceivedResponse } from "./receipts.ts";

export interface ModelSpec {
  key: string;
  service: string;
  model: string;
  baseUrlEnv: string;
  apiKeyEnv: string;
  /** Extra request fields, e.g. switching reasoning off for short structured tasks. */
  extra?: Record<string, unknown>;
  /** Output tokens added to every call's own limit for a reasoning model, which reasons before it answers. */
  reasoningTokens?: number;
  jsonMode: boolean;
  vision?: boolean;
  endpoint?: string;
  stream?: boolean;
  timeoutMs?: number;
}

function extraFromEnv(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error("LLM_EXTRA_JSON must be a JSON object, e.g. {\"enable_thinking\": false}");
  }
}

function reasoningTokensFromEnv(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (!/^\d+$/.test(value)) throw new Error("LLM_REASONING_TOKENS must be a non-negative integer, e.g. 4000");
  return Number(value);
}

export const MODELS: Record<string, ModelSpec> = {
  // Read from the environment at call time.
  default: {
    key: "default", service: "llm", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    get model() { return process.env.LLM_MODEL ?? ""; },
    get extra() { return extraFromEnv(process.env.LLM_EXTRA_JSON); },
    get reasoningTokens() { return reasoningTokensFromEnv(process.env.LLM_REASONING_TOKENS); },
    get jsonMode() { return process.env.LLM_JSON_MODE !== "false"; },
    get vision() { return process.env.LLM_VISION === "true"; },
  },
  // The pack's named presets, each with its own address and key.
  ...Object.fromEntries(Object.entries(PRESETS).map(([key, preset]) => [key, { key, ...preset }])),
};

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatJsonOptions<S extends z.ZodType> {
  model: string;
  purpose: string;
  subject: string;
  promptVersion: string;
  system: string;
  user: string | ContentPart[];
  schema: S;
  temperature?: number;
  maxTokens?: number;
  attemptTag?: string;
  timeoutMs?: number;
  /** false: the model answers in its own text format (no JSON mode); `parse` turns it into the schema's input. */
  json?: boolean;
  parse?: (content: string) => unknown;
}

export interface ChatJsonResult<T> {
  data: T;
  receiptId: number;
  reused: boolean;
  model: string;
  usage: Record<string, unknown> | null;
}

export class ModelOutputError extends Error {
  readonly receiptId: number | null;
  constructor(message: string, receiptId: number | null = null) {
    super(message);
    this.receiptId = receiptId;
  }
}

function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  if (fence) t = fence[1]!;
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new ModelOutputError("No JSON object in model output");
  const body = t.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    return JSON.parse(escapeControlCharsInStrings(body));
  }
}

/** Models sometimes emit raw newlines or tabs inside JSON strings (multi-line posts); escape only those. */
export function escapeControlCharsInStrings(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      else if (ch < " ") {
        out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
        continue;
      }
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

function isConnectFailure(error: unknown): boolean {
  const code = (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
  return ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "CERT_HAS_EXPIRED"].includes(code ?? "");
}

/** Only text and vision chat families are eligible for /chat/completions. */
export const isNvidiaTextModel=(id:string)=>nvidiaCapability(id)==="text";
export const isNvidiaChatModel=(id:string)=>["text","vision"].includes(nvidiaCapability(id));

function inputCapabilityFor(user:string|ContentPart[]):string {return Array.isArray(user)&&user.some(p=>p.type==='image_url')?'vision':'text';}

export async function chatJson<S extends z.ZodType>(opts: ChatJsonOptions<S>): Promise<ChatJsonResult<z.infer<S>>> {
  // A healthy model chosen by the NVIDIA monitor can be addressed directly by ID.
  // Dynamic routing only accepts compatible text model IDs on our NVIDIA endpoint.
  const normalizedId=opts.model.startsWith('model:')?opts.model.slice(6):
    await normalizedRegistryActive()?await resolveModelReference(opts.model):null;
  const normalized=normalizedId?await registeredRuntime(normalizedId,inputCapabilityFor(opts.user)):null;
  if(normalized&&!['chat','document','safety'].includes(normalized.m.adapter))throw Error('Selected model does not support chat');
  const registryEnabled=process.env.MODEL_PROVIDER_REGISTRY_ENABLED==="true";
  const dynamicId = opts.model.startsWith("nvidia:") ? opts.model.slice(7) :
    registryEnabled&&MODELS[opts.model]?.service==="nvidia" ? MODELS[opts.model]!.model : "";
  const knownNvidia = Object.values(MODELS).find(m=>m.service==="nvidia"&&m.model===dynamicId);
  // Each NVIDIA model is now resolved from its own database provider profile when opted in.
  // The old presets remain a compatibility path until development validates every adapter.
  const inputCapability=Array.isArray(opts.user)&&opts.user.some(part=>part.type==="image_url")?"vision":"text";
  const registered=dynamicId&&registryEnabled
    ? await getProvider("nvidia",dynamicId):null;
  const provider=registered&&registered.enabled&&registered.routeEnabled&&
     ["chat","document","safety"].includes(registered.adapter) && registered.endpoint
     ? instantiateProvider(registered):null;
  if(dynamicId&&registryEnabled&&(!(provider instanceof ChatProvider)||
     !registered?.checks.some(c=>c.status==="verified"&&c.capability===inputCapability&&c.verifiedAt&&
        Date.now()-Date.parse(c.verifiedAt)<86400000)))
    throw new Error("NVIDIA provider needs a recent successful "+inputCapability+" check: "+dynamicId);
  const spec: ModelSpec | undefined = (normalized ? {
    key:opts.model,service:normalized.c.vendor,model:normalized.m.model_id,baseUrlEnv:'',apiKeyEnv:'',
    jsonMode:false,vision:normalized.m.capabilities.includes('vision'),extra:normalized.m.request_defaults,
    endpoint:modelEndpoint(normalized.c,normalized.m),stream:normalized.m.stream,timeoutMs:normalized.m.timeout_override_ms??normalized.c.timeout_ms,
  } : provider instanceof ChatProvider ? {
    key:opts.model,service:"nvidia",model:dynamicId,baseUrlEnv:"NVIDIA_BASE_URL",
    apiKeyEnv:"NVIDIA_API_KEY",jsonMode:false,
    vision:registered?.capabilities.includes("vision"),extra:registered?.requestDefaults,
    endpoint:registered?.endpoint??undefined,stream:registered?.stream,
    timeoutMs:registered?.timeoutMs,
  } : isNvidiaChatModel(dynamicId)&&!registryEnabled ? {
    key: opts.model, service: "nvidia", model: dynamicId, baseUrlEnv: "NVIDIA_BASE_URL",
    apiKeyEnv: "NVIDIA_API_KEY", jsonMode: false,
    vision: nvidiaCapability(dynamicId)==="vision",
    extra: knownNvidia?.extra ?? (dynamicId.startsWith("nvidia/nemotron-3.5-lightning")
      ? { chat_template_kwargs: { enable_thinking: false } }
      : dynamicId.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : undefined),
  } : MODELS[opts.model]);
  if (!spec) throw new Error(`Unknown model ${opts.model}`);
  if (!config.modelCallsEnabled) throw new Error("Model calls are disabled (MODEL_CALLS_ENABLED=false)");
  const baseUrl = spec.endpoint ?? credential("models", spec.baseUrlEnv);
  const apiKey = normalized?storedCredential(normalized.c):credential("models", spec.apiKeyEnv);
  if (!baseUrl || !apiKey || !spec.model) throw new Error(`Model ${opts.model} is not configured (${spec.baseUrlEnv}, ${spec.apiKeyEnv}${spec.key === "default" ? ", LLM_MODEL" : ""})`);

  const temperature = opts.temperature ?? 0.2;
  const maxTokens = Math.max(opts.maxTokens ?? 1500, 512) + (spec.reasoningTokens ?? 0);
  const userText = typeof opts.user === "string" ? opts.user : JSON.stringify(opts.user);
  const body: Record<string, unknown> = {
    model: spec.model,
    messages: [
      // A prompt given as one user message (the title/summary prompts) has no system message.
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      // Multimodal parts go through as parts; plain objects are sent as JSON text.
      { role: "user", content: typeof opts.user === "string" || Array.isArray(opts.user) ? opts.user : userText },
    ],
    temperature,
    max_tokens: maxTokens,
    ...(spec.jsonMode && opts.json !== false ? { response_format: { type: "json_object" } } : {}),
    ...(spec.extra ?? {}),
    ...(spec.stream ? {stream:true} : {}),
  };

  const receipt = await paidRequest(
    {
      service: spec.service,
      model: spec.model,
      purpose: opts.purpose,
      subject: opts.subject,
      identity: { connectionModelId:normalizedId,configuration:normalized?.fingerprint,model: spec.model, promptVersion: opts.promptVersion, system: sha256(opts.system), user: sha256(userText), temperature, maxTokens, extra: spec.extra ?? null },
      requestSummary: { promptVersion: opts.promptVersion, systemHash: sha256(opts.system), userHash: sha256(userText), userChars: userText.length, temperature, maxTokens },
      attemptTag: opts.attemptTag,
    },
    async () => {
      const started = Date.now();
      if(normalizedId){
        const {data,requestId}=await requestRegisteredModel(normalizedId,inputCapability,body,normalized!.fingerprint);
        return {response:{...data,_latencyMs:Date.now()-started},requestId,usage:(data.usage as Record<string,unknown>)??null,cost:null};
      }
      if(provider instanceof ChatProvider){
        const output=await provider.request(body,inputCapability);
        const json=output.data;
        return {response:{...json,_latencyMs:Date.now()-started},
          requestId:(json.id as string|undefined)??output.requestId,
          usage:(json.usage as Record<string,unknown>|undefined)??null,cost:null};
      }
      let res: Response;
      try {
        res = await fetch(spec.endpoint ?? `${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(opts.timeoutMs ?? spec.timeoutMs ?? 120_000),
        });
      } catch (error) {
        if (isConnectFailure(error)) throw new ProviderRejectedError(`connect failed: ${String(error)}`, null, true);
        throw error;
      }
      const text = await res.text();
      assertAccepted(spec.service, res.status, text);
      let json: Record<string, unknown>;
      try {
        json = spec.stream ? parseProviderStream(text) : JSON.parse(text);
        if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("Expected a response object");
      } catch {
        json = { unparsable: text.slice(0, 20000) };
      }
      const usage = (json.usage as Record<string, unknown> | undefined) ?? null;
      return {
        response: { ...json, _latencyMs: Date.now() - started },
        requestId: (json.id as string | undefined) ?? res.headers.get("x-request-id"),
        usage,
        cost: null,
      };
    },
  );

  const response = receipt.response as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; usage?: Record<string, unknown> };
  const content = response.choices?.[0]?.message?.content ?? "";
  let parsed: z.infer<S>;
  try {
    parsed = opts.schema.parse(opts.parse ? opts.parse(content) : extractJson(content));
  } catch (error) {
    // Unusable output: record it and let a later attempt pay for a fresh answer. A reasoning model that
    // reasoned up to the output limit leaves an empty or cut-off answer; say so, and where to give it room.
    const detail = response.choices?.[0]?.finish_reason === "length"
      ? `output token limit reached (finish_reason=length): a reasoning model may have spent it reasoning; give it room with ${spec.key === "default" ? "LLM_REASONING_TOKENS" : `reasoningTokens on preset ${spec.key}`}. ${String(error)}`
      : String(error);
    await rejectReceivedResponse(receipt.receiptId, `unusable output: ${detail.slice(0, 500)}`);
    throw new ModelOutputError(`Model ${opts.model} returned unusable output for ${opts.subject}: ${detail.slice(0, 300)}`, receipt.receiptId);
  }
  return { data: parsed, receiptId: receipt.receiptId, reused: receipt.reused, model: spec.key, usage: response.usage ?? null };
}
