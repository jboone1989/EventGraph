import {ADAPTERS,CAPABILITIES,COMPLEXITIES,type ProviderChanges,type ProviderProfile} from "./types.ts";

const bad=(reason:string):never=>{throw Object.assign(new Error(reason),{statusCode:400});};
const allowedHosts=new Set(["integrate.api.nvidia.com","ai.api.nvidia.com"]);
const forbiddenDefaults=new Set(["model","messages","stream","authorization","api_key","apiKey","endpoint","url"]);
const allowedKeys=new Set(["temperature","top_p","top_k","frequency_penalty","presence_penalty","reasoning_effort","reasoning_budget","chat_template_kwargs","stop","seed","response_format","input_type","truncate","encoding_format","max_tokens"]);
function record(value:unknown):value is Record<string,unknown>{
 return !!value&&typeof value==="object"&&!Array.isArray(value);
}
export function checkProviderChanges(changes:ProviderChanges,old?:ProviderProfile):void{
 const accepted=new Set(["adapter","endpoint","capabilities","requestDefaults","probeSpec","stream","complexity","documentationUrl","notes","enabled","routeEnabled"]);
 if(!record(changes)||Object.keys(changes).some(k=>!accepted.has(k)))bad("unknown provider configuration property");
 if(changes.adapter!==undefined&&!ADAPTERS.includes(changes.adapter))bad("invalid adapter");
 if(changes.complexity!==undefined&&!COMPLEXITIES.includes(changes.complexity))bad("invalid complexity");
 if(changes.capabilities!==undefined&&(!Array.isArray(changes.capabilities)||changes.capabilities.some(c=>!CAPABILITIES.includes(c))))bad("invalid capabilities");
 if(changes.endpoint!==undefined&&changes.endpoint!==null){
  let url:URL;try{url=new URL(changes.endpoint)}catch{return bad("invalid provider endpoint")}
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.search||url.hash||!allowedHosts.has(url.hostname)||!url.pathname.startsWith("/v1/"))bad("endpoint must be an approved NVIDIA HTTPS API path");
 }
 if(changes.probeSpec!==undefined&&changes.probeSpec!==null){
  const p=changes.probeSpec;
  if(!record(p)||!CAPABILITIES.includes(p.capability)||
    !["chat","embedding","json"].includes(p.response)||!record(p.body)||
    JSON.stringify(p).length>12000)bad("invalid provider test request");
  if(Object.keys(p.body).some(k=>["authorization","api_key","apiKey","endpoint","url","credential"].includes(k)))
    bad("test request cannot contain credentials or override endpoint");
  if(p.source!==undefined&&(typeof p.source!=="string"||p.source.length>400))bad("invalid test source");
 }
 if(changes.requestDefaults!==undefined){
  if(!record(changes.requestDefaults)||Object.keys(changes.requestDefaults).length>24)bad("invalid request defaults");
  if(Object.keys(changes.requestDefaults).some(k=>!allowedKeys.has(k)||forbiddenDefaults.has(k)))bad("request defaults include unsafe or unsupported keys");
  if(JSON.stringify(changes.requestDefaults).length>4096)bad("request defaults too long");
 }
 for(const key of ["enabled","routeEnabled","stream"] as const)if(changes[key]!==undefined&&typeof changes[key]!=="boolean")bad("invalid "+key);
 for(const key of ["documentationUrl","notes"] as const)if(changes[key]!==undefined&&changes[key]!==null&&typeof changes[key]!=="string")bad("invalid "+key);
 if(changes.notes&&changes.notes.length>1500)bad("notes too long");
 if(changes.documentationUrl&&(!changes.documentationUrl.startsWith("https://docs.api.nvidia.com/")||changes.documentationUrl.length>400))bad("documentation URL must be NVIDIA API reference");
 const adapter=changes.adapter??old?.adapter,endpoint=changes.endpoint===undefined?old?.endpoint:changes.endpoint;
 if(changes.routeEnabled&&(changes.enabled===false||(!changes.enabled&&!old?.enabled)))bad("route requires an enabled provider");
 if(changes.routeEnabled&&(!endpoint||adapter==="unconfigured"))bad("route requires a supported configured API endpoint");
 if(adapter!=="chat"&&adapter!=="document"&&adapter!=="safety"&&changes.stream)bad("stream is only available for chat-style adapters");
}
