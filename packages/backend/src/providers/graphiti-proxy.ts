import {createHash} from 'node:crypto';
import {matchesBearerToken} from '../lib/bearer-auth.ts';
import {modelFor,invalidateModelCache} from '../editorial/models.ts';
import {config} from '../config.ts';
import {storedCredential} from './registry/connection-secrets.ts';
import {ProviderConfigError} from './registry/connection-types.ts';
import {clearRegisteredModelCache} from './registry/connections.ts';
import {registeredRuntime,requestRegisteredModel} from './registry/runtime.ts';
import {selectConfiguredProviderForStage,markFailedAutoRoute} from './registry/selection.ts';
import {paidRequest,ReceiptBusyError,rejectReceivedResponse} from './receipts.ts';
import {shutdownSignal} from '../lib/shutdown.ts';
import {stableJson} from '../lib/ids.ts';

type Kind='chat'|'embedding';
const bad=(message:string):never=>{throw Object.assign(new Error(message),{statusCode:400});};

/** A distinct internal service credential. Provider API keys never leave the backend. */
export function graphitiAuthorized(header:unknown,secret:string|undefined):boolean {
 return matchesBearerToken(header,secret,{requireBearer:true,minSecretLength:32});
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
 // OpenAI Python clients may request base64 embeddings. Require numeric vectors for
 // the Graphiti dimension check and the existing Neo4j graph.
 return kind==='chat'?{...rest,stream:false}:{...rest,encoding_format:'float'};
}

export function vectorDimensions(response:Record<string,unknown>,expected:number,inputCount?:number):void {
 const data=response.data;
 if(!Array.isArray(data)||!data.length||(inputCount!==undefined&&data.length!==inputCount)||data.some(
   item=>!item||typeof item!=='object'||!Array.isArray(item.embedding)||
     item.embedding.length!==expected||item.embedding.some((v:unknown)=>typeof v!=='number'||!Number.isFinite(v))))
  throw new Error('Graphiti embedding dimension mismatch: expected '+expected);
 // Some providers omit indices, but explicit indices must be complete and unique.
 if(data.some(item=>item.index!==undefined)){
  const indices=data.map(item=>item.index);
  if(indices.some(index=>!Number.isInteger(index)||index<0||index>=data.length)||
     new Set(indices).size!==data.length)
   throw new Error('Graphiti embedding dimension mismatch: invalid vector indices');
  response.data=[...data].sort((a,b)=>a.index-b.index);
 }
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
 while(true){
  const ref=automatic?await selectConfiguredProviderForStage(autoTier,false,excluded):configured;
  if(!ref.startsWith('model:'))throw new Error('Graphiti requires a registered model; configure its workflow binding');
  const id=ref.slice(6),capability=kind==='chat'?'text':'embedding';
  const {m,c,fingerprint}=await registeredRuntime(id,capability);
  if(kind==='chat'&&m.adapter!=='chat')throw new Error('Graphiti chat binding requires a chat model');
  if(kind==='embedding'&&m.adapter!=='embedding')throw new Error('Graphiti embedding binding requires an embedding model');
  // Fail before creating a paid request receipt: no request was sent yet.
  if(!config.modelCallsEnabled)throw new ProviderConfigError('Model calls are disabled','connection',409);
  if(!storedCredential(c))throw new ProviderConfigError('Configure a credential first','credential',409);
  const payload={...body,...(kind==='embedding'&&c.vendor.toLowerCase()!=='nvidia'?{input_type:undefined}:{})};
  const hash=createHash('sha256').update(stableJson(payload)).digest('hex');
  try {
   const receipt=await paidRequest({
    service:c.vendor,model:m.model_id,purpose:kind==='chat'?'graphiti_chat':'graphiti_embedding',
    subject:'graphiti:'+hash,
    identity:{kind,hash,modelId:id,fingerprint},
    requestSummary:{kind,requestHash:hash,modelId:id,...(automatic?{routing:{stage:'graphiti'}}:{})},
   },async()=>{
    const {data,requestId}=await requestRegisteredModel(id,capability,payload,fingerprint,kind==='chat');
    return {response:data,requestId,usage:(data.usage as Record<string,unknown>)??null,cost:null};
   });
   const response=receipt.response as Record<string,unknown>;
   if(kind==='embedding'){
    try{vectorDimensions(response,Number(process.env.GRAPHITI_EMBEDDING_DIM||2048),Array.isArray(body.input)?body.input.length:1);}
    catch(error){await rejectReceivedResponse(receipt.receiptId,'Graphiti embedding dimension mismatch');throw error;}
   } else {
    // A received HTTP response without a usable message is not a successful
    // Graphiti model call. Function calls and text responses are both valid.
    const choices=response.choices;
    const valid=Array.isArray(choices)&&choices.some(choice=>{
      const message=choice?.message;
      return message&&((typeof message.content==='string'&&message.content.trim().length>0)||
        (Array.isArray(message.tool_calls)&&message.tool_calls.length>0));
    });
    if(!valid){
      await rejectReceivedResponse(receipt.receiptId,'Graphiti chat returned no usable message');
      throw new Error('Graphiti chat returned no usable message');
    }
   }
   return response;
  }catch(error){
   if(!automatic||shutdownSignal.signal.aborted||error instanceof ReceiptBusyError)throw error;
   // Failed and unknown receipts remain auditable. The next attempt uses a
   // different model ID, not a resend of the unverified original receipt.
   excluded.add(id);
   await markFailedAutoRoute(ref,error);
  }
 }
}
