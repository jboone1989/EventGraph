/** Connection-owned authentication and transport, shared by runtime, discovery and tests. */
import {randomUUID} from 'node:crypto';
import {config} from '../../config.ts';
import {sql} from '../../db.ts';
import {audit} from '../../audit.ts';
import {guardedFetch} from '../../lib/http-fetch.ts';
import {paidRequest,ProviderRejectedError,rejectReceivedResponse} from '../receipts.ts';
import {parseSseCompletion} from './adapter.ts';
import {loadConnection,loadModel,modelInput,connectionView,configurationFingerprint,configurationSnapshot,routingState,type CheckRow,type ModelRow,type ConnectionRow} from './connections.ts';
import {storedCredential} from './connection-secrets.ts';
import {checkApiUrl,checkConnectionPolicy,checkModel} from './connection-validation.ts';
import {ProviderConfigError} from './connection-types.ts';

export function modelEndpoint(c:ConnectionRow,m?:ModelRow):string {
 return m?.endpoint_override??c.base_url.replace(/\/$/,'')+(m?.adapter==='embedding'?'/embeddings':m?'/chat/completions':'/models');
}
export async function registeredRuntime(id:string,capability?:string) {
 const m=await loadModel(id),c=await loadConnection(m.provider_id);
 const fingerprint=configurationFingerprint(c,m),snapshot=configurationSnapshot(c,m);
 if(capability) {
  const checks=await sql<CheckRow[]>`SELECT * FROM registered_model_checks WHERE model_id=${id}::uuid`;
  const state=routingState(m,c,checks);
  if(!state.eligibleCapabilities.includes(capability))throw new ProviderConfigError('Model cannot route '+capability+': '+(state.reasons.join('; ')||'capability has no current successful test'),'model',409);
 }
 return {m,c,fingerprint,snapshot};
}
async function transport(c:ConnectionRow,m:ModelRow|undefined,body?:Record<string,unknown>) {
 if(!config.modelCallsEnabled)throw new ProviderConfigError('Model calls are disabled','connection',409);
 const key=storedCredential(c);
 if(!key)throw new ProviderConfigError('Configure a credential first','credential');
 checkApiUrl(c.base_url);
 checkConnectionPolicy(c.base_url,c.policy);
 if(m)checkModel({...modelInput(m),enabled:true,routeEnabled:false},connectionView(c));
 try {
  const res=await guardedFetch(modelEndpoint(c,m),{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,
   'content-type':'application/json',accept:body?.stream===true?'text/event-stream':'application/json'},
   body:body?JSON.stringify(body):undefined,timeoutMs:m?.timeout_override_ms??c.timeout_ms,maxRedirects:0,maxBytes:8*1024*1024});
  if(res.status<200||res.status>=300)throw new ProviderRejectedError('Provider HTTP '+res.status,res.status,res.status===429||res.status>=500);
  const raw=res.text().split(key).join('[redacted]');
  const data=body?.stream===true?parseSseCompletion(raw):JSON.parse(raw) as Record<string,unknown>;
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid response');
  return {data,requestId:res.headers.get('x-request-id')};
 } catch(error) {
  if(error instanceof ProviderRejectedError)throw error;
  throw new ProviderConfigError('Provider request failed: network, destination policy or response format','baseUrl',502);
 }
}
export async function requestRegisteredModel(id:string,capability:string,body:Record<string,unknown>,expectedFingerprint?:string) {
 // Re-read immediately before transport: a selection made before an edit is not authorization.
 const {m,c,fingerprint}=await registeredRuntime(id,capability);
 if(expectedFingerprint&&fingerprint!==expectedFingerprint)throw new ProviderConfigError('Configuration changed before request; retry selection','model',409);
 return transport(c,m,{...m.request_defaults,...body,model:m.model_id,...(m.adapter==='embedding'?{}:{stream:m.stream})});
}
export async function discoverModels(id:string) {
 const c=await loadConnection(id),{data}=await transport(c,undefined);
 if(!Array.isArray(data.data))throw new ProviderConfigError('This provider does not return a supported models list; add models manually','baseUrl');
 const discovered=[...new Set(data.data.map(x=>(x as {id?:unknown})?.id).filter((x):x is string=>typeof x==='string'&&!!x.trim()&&x.length<=300))];
 const existing=await sql<{model_id:string}[]>`SELECT model_id FROM registered_models WHERE provider_id=${id}::uuid`;
 const known=new Set(existing.map(x=>x.model_id));
 return {models:[...discovered.map(modelId=>({modelId,status:known.has(modelId)?'existing':'new'})),
  ...existing.filter(x=>!discovered.includes(x.model_id)).map(x=>({modelId:x.model_id,status:'not-discovered'}))]};
}
export async function testConnection(id:string) {
 const c=await loadConnection(id);await transport(c,undefined);return {ok:true,detail:'Connection and models endpoint responded; model capability is not verified'};
}
export async function testRegisteredModel(id:string,capability:string,actor:string) {
 const {m,c,fingerprint,snapshot}=await registeredRuntime(id);
 if(!m.probe_spec||m.probe_spec.capability!==capability||!m.capabilities.includes(capability as never))
  throw new ProviderConfigError('Configure a matching capability test request first','probeSpec');
 const started=Date.now();let status='failed',detail='Response shape mismatch';
 try {
  const body={...m.request_defaults,...m.probe_spec.body,model:m.model_id,...(m.adapter==='embedding'?{}:{stream:m.stream})};
  const receipt=await paidRequest({service:c.vendor,model:m.model_id,purpose:'model_provider_probe',subject:id+':'+capability,
   identity:{id,fingerprint,body},attemptTag:randomUUID(),requestSummary:{modelId:id,capability}},async()=>{
   const {data,requestId}=await transport(c,m,body);
   return {response:data,requestId,usage:(data.usage as Record<string,unknown>)??null};
  });
  const d=receipt.response as Record<string,unknown>;
  const text=(d.choices as Array<{message?:{content?:unknown}}>|undefined)?.[0]?.message?.content;
  const vector=(d.data as Array<{embedding?:unknown}>|undefined)?.[0]?.embedding;
  const valid=m.probe_spec.response==='chat'?typeof text==='string'&&!!text.trim():
   m.probe_spec.response==='embedding'?Array.isArray(vector)&&vector.length>0&&vector.every(x=>typeof x==='number'&&Number.isFinite(x)):Object.keys(d).length>0&&!d.error;
  if(valid){status='verified';detail='Valid '+m.probe_spec.response+' response';}
 }catch(error){status='unknown';detail=error instanceof ProviderRejectedError?'HTTP '+error.status:'Request failed; check credential, destination and response format';}
 const elapsedMs=Date.now()-started;
 await sql`INSERT INTO registered_model_checks(model_id,capability,config_fingerprint,config_snapshot,status,verified_at,latency_ms,detail)
  VALUES (${id}::uuid,${capability},${fingerprint},${sql.json(snapshot)},${status},${status==='verified'?new Date():null},${elapsedMs},${detail})
  ON CONFLICT(model_id,capability) DO UPDATE SET config_fingerprint=EXCLUDED.config_fingerprint,config_snapshot=EXCLUDED.config_snapshot,
   status=EXCLUDED.status,verified_at=EXCLUDED.verified_at,latency_ms=EXCLUDED.latency_ms,detail=EXCLUDED.detail,updated_at=now()`;
 await audit(actor,'provider.model.test',id,capability,null,{status,elapsedMs,detail});
 return {status,elapsedMs,detail};
}

export async function embedRegisteredModel(id:string,input:string|string[],purpose:string,subject:string) {
 const {m,c,fingerprint}=await registeredRuntime(id,'embedding');
 if(m.adapter!=='embedding')throw new ProviderConfigError('Selected model is not an embedding model','model');
 const receipt=await paidRequest({service:c.vendor,model:m.model_id,purpose,subject,identity:{id,fingerprint,input}},async()=>{
  const {data,requestId}=await requestRegisteredModel(id,'embedding',{input},fingerprint);
  return {response:data,requestId,usage:(data.usage as Record<string,unknown>)??null};
 });
 const rows=(receipt.response as {data?:Array<{index?:number;embedding?:number[]}>}).data;
 const count=Array.isArray(input)?input.length:1;
 // Providers certified by the existing probe may omit indices. Such batches preserve
 // response order; mixed or explicit indices must be complete and unique.
 const data=Array.isArray(rows)&&rows.every(row=>row!==null && typeof row==="object" && row.index===undefined)
  ? rows.map((row,index)=>({...row,index})) : rows;
 const valid=Array.isArray(data)&&data.length===count&&data.every((row)=>
  Number.isInteger(row?.index)&&row.index! >= 0&&row.index! < count&&
  Array.isArray(row.embedding)&&row.embedding.length>0&&row.embedding.every(Number.isFinite));
 const sorted=valid?[...data!].sort((a,b)=>a.index!-b.index!):[];
 if(!valid||sorted.some((row,i)=>row.index!==i)){
  await rejectReceivedResponse(receipt.receiptId,'unusable embeddings: count, indices or vector values');
  throw new ProviderConfigError('Invalid embedding response: count, indices or vector values','model',502);
 }
 return {vectors:sorted.map(row=>row.embedding!),receiptId:receipt.receiptId};
}
