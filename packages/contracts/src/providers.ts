export type ModelCapability='text'|'reasoning'|'vision'|'embedding'|'embedding_vision'|'document'|'safety'|'translation'|'coding'|'video'|'reward';
export const PROTOCOLS = ['openai-compatible','anthropic-compatible'] as const;
export type CredentialEdit = {action:'keep'|'clear'} | {action:'replace';value:string};
export interface ProviderConnection {
 id:string;name:string;vendor:string;protocol:typeof PROTOCOLS[number];baseUrl:string;
 timeoutMs:number;enabled:boolean;policy:'none'|'nvidia-free-trial';
 credential:{configured:boolean};version:number;updatedAt:string;
}
export interface ConnectionInput {
 name:string;vendor:string;protocol:ProviderConnection['protocol'];baseUrl:string;
 timeoutMs:number;enabled:boolean;credential?:CredentialEdit;
}
export interface RegisteredModel {
 id:string;providerId:string;modelId:string;adapter:'chat'|'embedding'|'document'|'safety'|'unconfigured';
 endpointOverride:string|null;timeoutOverrideMs:number|null;capabilities:ModelCapability[];
 requestDefaults:Record<string,unknown>;probeSpec:{capability:ModelCapability;body:Record<string,unknown>;response:'chat'|'embedding'|'json';source?:string}|null;
 stream:boolean;complexity:'light'|'medium'|'heavy';billing?:'free'|'paid';documentationUrl:string|null;
 notes:string|null;enabled:boolean;routeEnabled:boolean;upstreamMetadata:Record<string,unknown>;
 routing:{eligibleCapabilities:string[];reasons:string[]};
 version:number;updatedAt:string;checks:Array<{capability:string;status:string;verifiedAt:string|null;latencyMs:number|null}>;
}
export type ModelInput = Pick<RegisteredModel,'providerId'|'modelId'|'adapter'|'endpointOverride'|
 'capabilities'|'requestDefaults'|'probeSpec'|'stream'|'complexity'|'documentationUrl'|'notes'|'enabled'|'routeEnabled'> & {billing?:RegisteredModel['billing'];timeoutOverrideMs?:number|null};
export interface Dependency {kind:'model'|'workflow';id:string;name:string}

export interface ProviderManagement {providers:ProviderConnection[];models:RegisteredModel[];protocols:string[];workflows:Array<{key:string;label:string;model:string;source:string}>}

/** Initial tier suggested by total parameter count in a model ID; operators can override it. */
export function complexityFromModelId(id:string):RegisteredModel['complexity'] {
 const match=id.match(/(?:^|[^\d])(\d+(?:\.\d+)?)b(?:[^a-z]|$)/i);
 if(!match)return 'medium';
 const billions=Number(match[1]);
 return billions<120?'light':billions===120?'medium':'heavy';
}
