/** OpenRouter's model catalog includes chat, embeddings and other endpoint families. */
export type CatalogModel={
 id?:unknown;
 pricing?:Record<string,unknown>;
 endpoints?:unknown;
 architecture?:{input_modalities?:unknown;output_modalities?:unknown};
};
export type FreeCatalogModel={
 id:string;
 /** An implemented request adapter, never an invented model type. */
 adapter:'chat'|'embedding'|'unconfigured';
 capabilities:('text'|'vision'|'embedding')[];
 probe:({capability:'text';body:{messages:{role:string;content:string}[]};response:'chat'}|{capability:'embedding';body:{input:string};response:'embedding'})|null;
 endpoints:string[];
 inputModalities:string[];
 outputModalities:string[];
};
const zero=(value:unknown):boolean=>
 (typeof value==='string'||typeof value==='number')&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)===0;
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[];
const overrideConditions=new Set(['min_prompt_tokens','utc_days','utc_start','utc_end']);
/** Do not mistake zero token rates for a free image/audio/video model.
 * All quoted charge dimensions, including future pricing keys and overrides, must be zero. */
const free=(model:CatalogModel):boolean=>{
 const pricing=model.pricing;
 if(!pricing||typeof pricing!=='object'||Array.isArray(pricing))return false;
 const charges=Object.entries(pricing).filter(([key])=>key!=='discount'&&key!=='overrides');
 if(!charges.length||charges.some(([,value])=>value!==null&&!zero(value)))return false;
 const overrides=pricing.overrides;
 if(overrides!=null&&(!Array.isArray(overrides)||overrides.some(override=>
  !override||typeof override!=='object'||Array.isArray(override)||
  Object.entries(override).some(([key,value])=>!overrideConditions.has(key)&&value!==null&&!zero(value)))))return false;
 // Video can be priced per second while token rates stay zero. Without an explicit
 // zero video/duration rate, the catalog does not prove that video output is free.
 if(strings(model.architecture?.output_modalities).includes('video')&&
    !charges.some(([key,value])=>/(?:video|seconds?|duration|frames?)/i.test(key)&&zero(value)))return false;
 return true;
};

/** Classify by advertised API endpoint, never expose rerank/decision models as chat. */
export function classifyOpenRouterFreeCatalog(data:unknown[]):{
 models:FreeCatalogModel[];freeCatalog:number;chat:number;embedding:number;other:number;invalid:number;
}{
 const models:FreeCatalogModel[]=[];
 const seen=new Set<string>();
 let freeCatalog=0,chat=0,embedding=0,other=0,invalid=0;
 for(const entry of data){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;
  const m=entry as CatalogModel;
  if(!free(m))continue;
  freeCatalog++;
  if(typeof m.id!=='string'||!m.id.trim()||m.id.length>300){invalid++;continue;}
  if(seen.has(m.id))continue;
  seen.add(m.id);
  const endpoints=strings(m.endpoints);
  const output=strings(m.architecture?.output_modalities);
  const input=strings(m.architecture?.input_modalities);
  // Respect the advertised API route. Text output via /responses or /decisions
  // does not mean the model supports /chat/completions.
  const chatEndpoint=endpoints.includes('/api/v1/chat/completions');
  const isChat=(chatEndpoint||(!endpoints.length&&output.includes('text'))) &&
   (!output.length||output.includes('text'));
  const isEmbedding=endpoints.includes('/api/v1/embeddings')||
   (!endpoints.length&&output.includes('embeddings'));
  const upstream={id:m.id,endpoints,inputModalities:input,outputModalities:output};
  if(m.id==='openrouter/free'||isChat){
   chat++;
   models.push({...upstream,adapter:'chat',capabilities:input.includes('image')?['text','vision']:['text'],
    probe:{capability:'text',body:{messages:[{role:'user',content:'Reply OK'}]},response:'chat'}});
  }else if(isEmbedding){
   embedding++;
   models.push({...upstream,adapter:'embedding',capabilities:['embedding'],
    probe:{capability:'embedding',body:{input:'Hello world'},response:'embedding'}});
  }else{
   other++;
   models.push({...upstream,adapter:'unconfigured',capabilities:[],probe:null});
  }
 }
 if(!seen.has('openrouter/free')){
  models.push({id:'openrouter/free',adapter:'chat',capabilities:['text'],
   endpoints:['/api/v1/chat/completions'],inputModalities:['text'],outputModalities:['text'],
   probe:{capability:'text',body:{messages:[{role:'user',content:'Reply OK'}]},response:'chat'}});
 }
 return {models,freeCatalog,chat,embedding,other,invalid};
}
