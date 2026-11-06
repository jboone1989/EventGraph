/** OpenRouter's model catalog includes chat, embeddings and other endpoint families. */
export type CatalogModel={
 id?:unknown;
 pricing?:{prompt?:unknown;completion?:unknown;request?:unknown;image?:unknown;audio?:unknown};
 endpoints?:unknown;
 architecture?:{input_modalities?:unknown;output_modalities?:unknown};
};
export type FreeCatalogModel={
 id:string;
 adapter:'chat'|'embedding'|'special';
 capabilities:('text'|'vision'|'embedding')[];
 probe:({capability:'text';body:{messages:{role:string;content:string}[]};response:'chat'}|{capability:'embedding';body:{input:string};response:'embedding'})|null;
};
const zero=(value:unknown):boolean=>
 (typeof value==='string'||typeof value==='number')&&String(value).trim()!==''&&Number(value)===0;
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[];
const free=(model:CatalogModel):boolean=>
 zero(model.pricing?.prompt)&&zero(model.pricing?.completion)&&
 (model.pricing?.request==null||zero(model.pricing.request))&&
 (model.pricing?.image==null||zero(model.pricing.image))&&
 (model.pricing?.audio==null||zero(model.pricing.audio));

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
  // Catalog versions can omit endpoint paths; output modalities remain authoritative.
  const textOutput=output.length===0||output.includes('text');
  const inferFromModality=endpoints.length===0;
  const chatEndpoint=endpoints.includes('/api/v1/chat/completions');
  if(m.id==='openrouter/free'||((chatEndpoint||(inferFromModality&&!output.includes('embeddings')))&&textOutput)){
   chat++;
   models.push({id:m.id,adapter:'chat',capabilities:input.includes('image')?['text','vision']:['text'],
    probe:{capability:'text',body:{messages:[{role:'user',content:'Reply OK'}]},response:'chat'}});
  }else if(endpoints.includes('/api/v1/embeddings')||(inferFromModality&&output.includes('embeddings'))){
   embedding++;
   models.push({id:m.id,adapter:'embedding',capabilities:['embedding'],
    probe:{capability:'embedding',body:{input:'Hello world'},response:'embedding'}});
  }else{
   other++;
   models.push({id:m.id,adapter:'special',capabilities:[],probe:null});
  }
 }
 if(!seen.has('openrouter/free')){
  models.push({id:'openrouter/free',adapter:'chat',capabilities:['text'],
   probe:{capability:'text',body:{messages:[{role:'user',content:'Reply OK'}]},response:'chat'}});
 }
 return {models,freeCatalog,chat,embedding,other,invalid};
}
