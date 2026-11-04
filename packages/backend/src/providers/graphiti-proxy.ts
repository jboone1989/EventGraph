import {createHash, timingSafeEqual} from 'node:crypto';
import {modelFor,invalidateModelCache} from '../editorial/models.ts';
import {clearRegisteredModelCache} from './registry/connections.ts';
import {registeredRuntime,requestRegisteredModel} from './registry/runtime.ts';
import {selectConfiguredProviderForStage,coolDownReference} from './registry/selection.ts';
import {paidRequest,ProviderRejectedError,BudgetExceededError,rejectReceivedResponse} from './receipts.ts';
import {stableJson} from '../lib/ids.ts';

type Kind='chat'|'embedding';
const bad=(message:string):never=>{throw Object.assign(new Error(message),{statusCode:400});};

/** A distinct internal service credential. Provider API keys never leave the backend. */
export function graphitiAuthorized(header:unknown,secret:string|undefined):boolean {
 if(typeof header!=='string'||!secret||secret.length<32||!header.startsWith('Bearer '))return false;
 const provided=Buffer.from(header.slice(7)),expected=Buffer.from(secret);
 return provided.length===expected.length&&timingSafeEqual(provided,expected);
}

export function graphitiBody(kind:Kind,value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))return bad('Invalid model request');
 const body=value as Record<string,unknown>;
 if(body.stream===true)return bad('Streaming is unsupported by the Graphiti model proxy');
 if(kind==='chat'){
  if(!Array.isArray(body.messages)||!body.messages.length||body.messages.length>40)return bad('Invalid messages');
  if(body.messages.some(m=>!m||typeof m!=='object'||typeof m.role!=='string'))return bad('Invalid message');
 }else{
  const input=typeof body.input==='string'?[body.input]:body.input;
  if(!Array.isArray(input)||!input.length||input.length>32||
     input.some(x=>typeof x!=='string'||!x.length||x.length>12000))return bad('Invalid embedding input');
 }
 if(JSON.stringify(body).length>150000)return bad('Graphiti request exceeds input limit');
 const {model:_,...rest}=body;
 return kind==='chat'?{...rest,stream:false}:rest;
}

export function vectorDimensions(response:Record<string,unknown>,expected:number):void {
 const data=response.data;
 if(!Array.isArray(data)||!data.length||data.some(
   item=>!item||typeof item!=='object'||!Array.isArray(item.embedding)||
     item.embedding.length!==expected||item.embedding.some((v:unknown)=>typeof v!=='number'||!Number.isFinite(v))))
  throw new Error('Graphiti embedding dimension mismatch: expected '+expected);
}

/** Select by the existing default/overrides and use the same registered request/receipt path. */
export async function graphitiModelRequest(kind:Kind,value:unknown):Promise<Record<string,unknown>> {
 // Admin writes may originate on VM13 while this API runs on the production host.
 // Read the shared DB on each model call instead of trusting another process's cache.
 invalidateModelCache();
 clearRegisteredModelCache();
 const body=graphitiBody(kind,value),stage=kind==='chat'?'graphiti':'graphitiEmbedding';
 const configured=await modelFor(stage);
 const automatic=kind==='chat'&&configured.startsWith('auto:');
 const autoTier=automatic?(configured.split(':')[2]??stage):stage;
 const excluded=new Set<string>();
 for(let attempt=0;attempt<(automatic?8:1);attempt++){
  const ref=automatic?await selectConfiguredProviderForStage(autoTier,false,excluded):configured;
  if(!ref.startsWith('model:'))throw new Error('Graphiti requires a registered model; configure its workflow binding');
  const id=ref.slice(6),capability=kind==='chat'?'text':'embedding';
  const {m,c,fingerprint}=await registeredRuntime(id,capability);
  if(kind==='chat'&&m.adapter!=='chat')throw new Error('Graphiti chat binding requires a chat model');
  if(kind==='embedding'&&m.adapter!=='embedding')throw new Error('Graphiti embedding binding requires an embedding model');
  const payload={...body,...(kind==='embedding'&&c.vendor.toLowerCase()!=='nvidia'?{input_type:undefined}:{})};
  const hash=createHash('sha256').update(stableJson(payload)).digest('hex');
  try {
   const receipt=await paidRequest({
    service:c.vendor,model:m.model_id,purpose:kind==='chat'?'graphiti_chat':'graphiti_embedding',
    subject:'graphiti:'+hash,
    identity:{kind,hash,modelId:id,fingerprint},
    requestSummary:{kind,requestHash:hash,modelId:id,...(automatic?{routing:{stage:'graphiti'}}:{})},
   },async()=>{
    const {data,requestId}=await requestRegisteredModel(id,capability,payload,fingerprint);
    return {response:data,requestId,usage:(data.usage as Record<string,unknown>)??null,cost:null};
   });
   const response=receipt.response as Record<string,unknown>;
   if(kind==='embedding'){
    try{vectorDimensions(response,Number(process.env.GRAPHITI_EMBEDDING_DIM??2048));}
    catch(error){await rejectReceivedResponse(receipt.receiptId,'Graphiti embedding dimension mismatch');throw error;}
   }
   return response;
  }catch(error){
   // Only a confirmed HTTP refusal is safe to retry with a different free model.
   if(!automatic||!(error instanceof ProviderRejectedError)||
      ![403,429,502,503,504].includes(error.status??0))throw error;
   excluded.add(id);
   await coolDownReference(ref,error.status===429?60:30,error.status===429);
  }
 }
 throw new BudgetExceededError('free-models','graphiti_no_eligible_provider',300);
}
