export const ADAPTERS=["chat","embedding","document","safety","unconfigured"] as const;
export type ProviderAdapterKind=typeof ADAPTERS[number];
export const COMPLEXITIES=["light","medium","heavy"] as const;
export type Complexity=typeof COMPLEXITIES[number];
export const CAPABILITIES=["text","reasoning","vision","embedding","embedding_vision","document","safety","translation","coding","video","reward"] as const;
export type ModelCapability=typeof CAPABILITIES[number];

/** One model's own request sample and response shape; no user-defined timeout. */
export interface ProviderProbeSpec {
 capability:ModelCapability;
 body:Record<string,unknown>;
 response:"chat"|"embedding"|"json";
 source?:string;
}
/** Every independently configured model is a provider instance, not an entry in a global model switch. */
export interface ProviderProfile{
 vendor:string;modelId:string;adapter:ProviderAdapterKind;endpoint:string|null;
 credentialEnv:string;capabilities:ModelCapability[];
 requestDefaults:Record<string,unknown>;probeSpec:ProviderProbeSpec|null;timeoutMs:number;stream:boolean;
 complexity:Complexity;documentationUrl:string|null;notes:string|null;
 enabled:boolean;routeEnabled:boolean;version:number;updatedAt:string;
 checks:Array<{capability:string;status:string;verifiedAt:string|null;latencyMs:number|null}>;
}
export type ProviderChanges=Partial<Pick<ProviderProfile,"adapter"|"endpoint"|"capabilities"|"requestDefaults"|"probeSpec"|"stream"|"complexity"|"documentationUrl"|"notes"|"enabled"|"routeEnabled">>;

// Explicit official NVIDIA free-trial API catalogue, checked 2026-10-17.
// Unknown, partner-only, deprecated and download-only models are NOT eligible.
// "Free Endpoint" means NVIDIA's limited prototype entitlement, not unlimited free usage.
export const VERIFIED_FREE_TRIAL_ENDPOINTS:Readonly<Record<string,string>>={
 "openai/gpt-oss-20b":"https://build.nvidia.com/openai/gpt-oss-20b",
 "google/gemma-4-31b-it":"https://build.nvidia.com/google/gemma-4-31b-it",
 "google/diffusiongemma-26b-a4b-it":"https://build.nvidia.com/google/diffusiongemma-26b-a4b-it",
 "nvidia/nemotron-3.5-lightning-30b-a3b":"https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b",
 "nvidia/nemotron-3-super-120b-a12b":"https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b",
 "nvidia/nemotron-3-ultra-550b-a55b":"https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b",
 "nvidia/nemotron-3.5-super-vl-120b-a12b":"https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b",
 "nvidia/nemotron-3.5-content-safety":"https://build.nvidia.com/nvidia/nemotron-3.5-content-safety",
 "nvidia/llama-3.1-nemotron-safety-guard-8b-v3":"https://build.nvidia.com/nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
 "nvidia/nemotron-3-embed-1b":"https://build.nvidia.com/nvidia/nemotron-3-embed-1b",
 "meta/muse-glimmer-30b":"https://build.nvidia.com/meta/muse-glimmer-30b",
 "deepseek-ai/deepseek-v4.1-flash":"https://build.nvidia.com/deepseek-ai/deepseek-v4.1-flash",
 "stepfun-ai/step-5-preview":"https://build.nvidia.com/stepfun-ai/step-5-preview",
 "z-ai/glm-5.3":"https://build.nvidia.com/z-ai/glm-5-3",
 "z-ai/glm-5.3-flash":"https://build.nvidia.com/z-ai/glm-5-3-flash",
};
export function isVerifiedFreeTrialProvider(modelId:string):boolean{
 return Object.prototype.hasOwnProperty.call(VERIFIED_FREE_TRIAL_ENDPOINTS,modelId);
}
