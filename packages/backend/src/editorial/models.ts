import {registeredRuntime} from '../providers/registry/runtime.ts';
import {loadModel,loadConnection,normalizedRegistryActive,resolveModelReference} from '../providers/registry/connections.ts';
// Model per capability: the code default (the site's choice in site/models.ts, else `default`, the deployment's
// own model), an environment override, and an admin switch kept in settings (every switch is audited).
// Read at call time and cached for a minute, so a switch applies to the next call without a restart; a
// changed model only affects work done from then on (history is not re-judged).
import { READER_WORDING } from "@aihot/industry/wording";
import { DEFAULTS } from "@aihot/site/models";
import { sql } from "../db.ts";
import { serverModules } from "../modules.ts";
import { MODELS } from "../providers/llm.ts";
import { availableModel } from "../providers/nvidia-pool.ts";
import {selectConfiguredProviderForStage} from "../providers/registry/selection.ts";
import { nvidiaCapability } from "../providers/nvidia-catalog.ts";

export interface Capability {
  /** The step's name on the admin page, with an explanation in full-width brackets if it needs one; alerts use the name alone. */
  label: string;
  env: string;
  default: string;
  /** Receipt purposes this capability produces (for the admin statistics). */
  purposes: string[];
  /** The step needs a model that reads images. */
  vision?: boolean;
  /** The step has nothing to do on this site, so a service's outage does not stop it. */
  idle?: () => boolean;
}

export const CAPABILITIES = {
  prefilter: { label: "精选预筛（是否属于这个行业，宽召回）", env: "PREFILTER_MODEL", default: DEFAULTS.prefilter ?? "default", purposes: ["prefilter_article"] },
  score: { label: "精选评分（两次独立评分，按信源分级门槛）", env: "SCORE_MODEL", default: DEFAULTS.score ?? "default", purposes: ["score_article"] },
  understand: { label: "内容理解（入选和接近入选的标题、摘要、推荐理由，能看图时看首图）", env: "UNDERSTAND_MODEL", default: DEFAULTS.understand ?? "default", purposes: ["understand_article"] },
  summarize: { label: "标题摘要（其余文章的中文标题与摘要）", env: "SUMMARIZE_MODEL", default: DEFAULTS.summarize ?? "default", purposes: ["summarize_article"] },
  wording: { label: "改用词（标题、摘要、理由用了本站不用的词时，只改这些词）", env: "WORDING_MODEL", default: DEFAULTS.wording ?? "default", purposes: ["mend_wording"], idle: () => !READER_WORDING.length },
  structure: { label: "结构抽取（分类、标签、主体公司、事件事实，不写读者文字）", env: "STRUCTURE_MODEL", default: DEFAULTS.structure ?? "default", purposes: ["structure_article"] },
  group: { label: "事件归组（新报道与候选事实的关系：同一次发生、同一事件的进展、无关；被同一篇报道连起来的两个事件是否同一事件）", env: "GROUP_MODEL", default: DEFAULTS.group ?? "default", purposes: ["group_article", "group_signal", "group_story"] },
  groupReview: { label: "归组复核（相似度不高的合并、两个事件的合并，写入前再读一遍；最好换一家模型）", env: "GROUP_REVIEW_MODEL", default: DEFAULTS.groupReview ?? "default", purposes: ["group_review", "group_story_review"] },
  digest: { label: "事件综述", env: "DIGEST_MODEL", default: DEFAULTS.digest ?? "default", purposes: ["story_digest"] },
  // A daily's overview joined the writer's work (report_daily); report_lead remains for its older receipts.
  report: { label: "报告总述（周报月报的总述与主题、日报的当日综述）", env: "REPORT_MODEL", default: DEFAULTS.report ?? "default", purposes: ["report_weekly", "report_monthly", "report_lead", "report_daily"] },
  translate: { label: "精选全文翻译（含引用帖）", env: "TRANSLATE_MODEL", default: DEFAULTS.translate ?? "default", purposes: ["translate_body", "translate_quoted"] },
  english: { label: "英文版文字（公开报道的英文标题和摘要、精选报道的推荐理由，事件的英文概览）", env: "ENGLISH_MODEL", default: DEFAULTS.english ?? "default", purposes: ["english_copy", "english_digest"] },
} satisfies Record<string, Capability>;

export type CapabilityKey = keyof typeof CAPABILITIES;

/** Every step: the engine's, then the installed modules' (their defaults also from site/models.ts). */
export function capabilities(): Record<string, Capability> {
  const all: Record<string, Capability> = { ...CAPABILITIES };
  for (const m of serverModules()) for (const [key, step] of Object.entries(m.models ?? {})) all[key] = { ...step, default: DEFAULTS[key] ?? "default" };
  return all;
}

/** Names of the active steps currently routed to a service, using the same choices as model calls. */
export async function stepsOnService(service: string): Promise<string[]> {
  const current = await modelSources();
  const names:string[]=[];
  for(const [key,c] of Object.entries(capabilities())) {
    const reference=current[key]!.model;
    let owner=MODELS[reference]?.service;
    if(reference.startsWith('model:')) {
     // An admin can refer to a deleted normalized model. Show other steps
     // instead of failing the whole admin status page.
     try {owner=(await loadConnection((await loadModel(reference.slice(6))).provider_id)).vendor;}
     catch {continue;}
    }
    if(owner===service&&!c.idle?.())names.push(c.label.split('（')[0]!);
  }
  return names;
}

let cache: { at: number; overrides: Record<string, string> } | null = null;

async function overrides(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.overrides;
  const rows = await sql<{ key: string; value: { model?: string } }[]>`SELECT key, value FROM settings WHERE key LIKE 'models.%'`;
  const map: Record<string, string> = {};
  for (const r of rows) if (r.value?.model) map[r.key.slice("models.".length)] = r.value.model;
  cache = { at: Date.now(), overrides: map };
  return map;
}

export function invalidateModelCache() {
  cache = null;
}

/** Whether a registered model explicitly declares image input support. Unspecified means text-only. */
export async function modelSupportsVision(model: string): Promise<boolean> {
  if(model.startsWith('model:'))return (await loadModel(model.slice(6))).capabilities.includes('vision');
  if (MODELS[model]) return MODELS[model].vision === true;
  // The healthy NVIDIA pool resolves a preset to its concrete service model ID.
  const dynamicId=model.startsWith("nvidia:")?model.slice(7):"";
  return !!dynamicId && nvidiaCapability(dynamicId)==="vision";
}

/** Whether a step can use a registered model. A model that reads images writes text as well. */
export function capabilityAcceptsModel(capability: Capability, model: { vision?: boolean }): boolean {
  return !capability.vision || model.vision === true;
}

/** An invalid or deleted admin reference must not suppress a valid environment choice. */
async function validChoice(reference:string):Promise<boolean> {
 if(MODELS[reference])return true;
 try {
  if(reference.startsWith('model:')){await loadModel(reference.slice(6));return true;}
  if(await normalizedRegistryActive())return !!(await resolveModelReference(reference));
 } catch {return false;}
 return false;
}
async function effectiveChoice(c:Capability,admin?:string):Promise<{model:string;source:'admin'|'env'|'default'}> {
 // A malformed admin selection must not mask a healthy environment override.
 if(admin&&await validChoice(admin))return {model:admin,source:'admin'};
 const env=process.env[c.env];
 if(env) {
  if(await validChoice(env))return {model:env,source:'env'};
  // An explicitly invalid environment override falls back to the site default.
  // This matches the pre-registry routing behavior even if admin is also stale.
  return {model:c.default,source:'default'};
 }
 // An invalid saved admin choice with no environment override must fail closed
 // until an operator fixes it, rather than silently replacing it with another model.
 if(admin)return {model:admin,source:'admin'};
 return {model:c.default,source:'default'};
}

/** The model a capability uses now: admin switch, else environment, else the code default. */
export async function modelFor(capability: CapabilityKey | (string & {})): Promise<string> {
  const c = capabilities()[capability];
  if (!c) throw new Error(`unknown model step: ${capability}`);
  const chosen=(await effectiveChoice(c,(await overrides())[capability])).model;
  if(chosen.startsWith('model:')){await registeredRuntime(chosen.slice(6),c.vision?'vision':'text');return chosen;}
  if (process.env.NVIDIA_MODEL_POOL_ENABLED === "true") {
    const nvidiaChosen=MODELS[chosen]?.service==="nvidia" ||
      (chosen==="default"&&process.env.NVIDIA_POOL_ROUTE_DEFAULT==="true");
    if(nvidiaChosen&&process.env.MODEL_PROVIDER_REGISTRY_ENABLED==="true")
      return selectConfiguredProviderForStage(capability,!!c.vision);
    if (MODELS[chosen]?.service === "nvidia") return availableModel(chosen);
    if (chosen === "default" && process.env.NVIDIA_POOL_ROUTE_DEFAULT === "true")
      return availableModel(c.vision ? "nvidia-glm-5.3-flash" : "nvidia-gpt-oss-20b");
  }
  if(await normalizedRegistryActive()){const id=await resolveModelReference(chosen);if(id){await registeredRuntime(id,c.vision?'vision':'text');return 'model:'+id;}}
  if(!MODELS[chosen])throw new Error('Unknown configured model: '+chosen);
  return chosen;
}

/** Where the current choice comes from, for the admin page. */
export async function modelSources(): Promise<Record<string, { model: string; source: "admin" | "env" | "default" }>> {
  const o = await overrides();
  const out: Record<string, { model: string; source: "admin" | "env" | "default" }> = {};
  for(const [key,c] of Object.entries(capabilities()))
    out[key]=await effectiveChoice(c,o[key]);
  return out;
}
