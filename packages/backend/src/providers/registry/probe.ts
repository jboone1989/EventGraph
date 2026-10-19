import {assertLegacyRegistryWritable} from './connections.ts';
/** Probe sends the body saved on this exact model Provider; no shared model-specific parameters or timeout. */
import {sql} from "../../db.ts";
import {credential} from "../../config.ts";
import {audit} from "../../audit.ts";
import {paidRequest,assertAccepted,ProviderRejectedError} from "../receipts.ts";
import {parseSseCompletion} from "./adapter.ts";
import {getProvider} from "./repository.ts";
import type {ProviderProfile} from "./types.ts";
import {isVerifiedFreeTrialProvider} from "./types.ts";

export type ProbeResult={vendor:string;modelId:string;capability:string;status:"verified"|"failed"|"unknown"|"unsupported";elapsedMs:number|null;detail:string};
export function providerSampleBody(p:ProviderProfile):Record<string,unknown>{
 if(!p.probeSpec)throw Error("model test request not configured");
 const body={...p.requestDefaults,...p.probeSpec.body};
 if(["chat","embedding","document","safety"].includes(p.adapter)&&body.model===undefined)body.model=p.modelId;
 if(["chat","document","safety"].includes(p.adapter)&&body.stream===undefined)body.stream=p.stream;
 return body;
}
function responseValid(data:Record<string,unknown>,kind:"chat"|"embedding"|"json"):boolean{
 if(kind==="embedding"){
  const e=(data.data as Array<{embedding?:unknown}>|undefined)?.[0]?.embedding;
  return Array.isArray(e)&&e.length>0&&e.every(x=>typeof x==="number"&&Number.isFinite(x));
 }
 if(kind==="chat"){
  const text=(data.choices as Array<{message?:{content?:unknown}}>|undefined)?.[0]?.message?.content;
  return typeof text==="string"&&text.trim().length>0;
 }
 return Object.keys(data).length>0&&!data.error;
}
function failure(error:unknown){
 if(error instanceof ProviderRejectedError)return {status:error.retryable?"unknown" as const:"failed" as const,detail:"HTTP "+(error.status??"?")};
 if(/Budget for /.test(String(error)))return {status:"unknown" as const,detail:"budget limit"};
 return {status:"unknown" as const,detail:"network or parse failure"};
}
export async function probeConfiguredProvider(vendor:string,id:string,capability:string,actor:string,opts:{allowInactive?:boolean;attemptTag?:string}={}):Promise<ProbeResult>{
 if(vendor!=="nvidia"||!isVerifiedFreeTrialProvider(id))return {vendor,modelId:id,capability,status:"unsupported",elapsedMs:null,detail:"Not officially verified as free trial endpoint"};
 await assertLegacyRegistryWritable();
 const p=await getProvider(vendor,id);
 if(!p)throw Object.assign(new Error("provider not found"),{statusCode:404});
 if(!p.probeSpec||!p.endpoint||p.adapter==="unconfigured"||p.probeSpec.capability!==capability)
  return {vendor,modelId:id,capability,status:"unsupported",elapsedMs:null,detail:"provider request sample not configured"};
 if(!opts.allowInactive&&!p.enabled)throw Object.assign(new Error("provider disabled; bulk tests can check it"),{statusCode:400});
 const token=credential("models",p.credentialEnv);
 if(!token)return {vendor,modelId:id,capability,status:"unknown",elapsedMs:null,detail:"credential unavailable"};
 const body=providerSampleBody(p);const started=performance.now();
 let status:ProbeResult["status"]="unknown",detail="unknown";
 try{
  const receipt=await paidRequest({
   service:vendor,model:id,purpose:"model_provider_probe",subject:capability+":"+id,
   identity:{capability,configVersion:p.version,body},attemptTag:opts.attemptTag??new Date().toISOString(),
   requestSummary:{capability,version:p.version},
  },async()=>{
   const res=await fetch(p.endpoint!,{method:"POST",headers:{authorization:"Bearer "+token,
    "content-type":"application/json",accept:body.stream===true?"text/event-stream":"application/json"},body:JSON.stringify(body)});
   const raw=await res.text();assertAccepted(vendor,res.status,raw);
   const data=body.stream===true?parseSseCompletion(raw):JSON.parse(raw) as Record<string,unknown>;
   return {response:data,requestId:res.headers.get("x-request-id"),usage:(data.usage as Record<string,unknown>)??null};
  });
  status=responseValid(receipt.response as Record<string,unknown>,p.probeSpec.response)?"verified":"failed";
  detail=status==="verified"?"valid "+p.probeSpec.response+" response":"response shape mismatch";
 }catch(error){const x=failure(error);status=x.status;detail=x.detail;}
 const elapsedMs=Math.round(performance.now()-started);
 await sql`INSERT INTO model_provider_checks(vendor,model_id,capability,verified_at,status,latency_ms,detail,updated_at)
 VALUES (${vendor},${id},${capability},${status==="verified"?new Date():null},${status},${elapsedMs},${detail},now())
 ON CONFLICT(vendor,model_id,capability) DO UPDATE SET
  status=EXCLUDED.status,latency_ms=EXCLUDED.latency_ms,detail=EXCLUDED.detail,updated_at=now(),
  verified_at=CASE WHEN EXCLUDED.status='verified' THEN EXCLUDED.verified_at ELSE NULL END`;
 await audit(actor,"model.provider.probe",vendor+":"+id,capability,null,{status,elapsedMs,detail});
 return {vendor,modelId:id,capability,status,elapsedMs,detail};
}
