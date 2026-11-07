import {writeWorkflowModel,loadModel,listRegisteredModels,listConnections} from '../providers/registry/connections.ts';
import {registeredRuntime} from '../providers/registry/runtime.ts';
// Admin "模型与评测": the model each capability uses and where that choice comes from,
// the prompt versions in use, quality / latency / cost of the last days per model, the switch history
// and the SelectBench runs that compare models on the same batch. A switch is audited and applies to
// new work only.
import type { AdminModelBindings } from "@aihot/contracts/admin";
import { sql } from "../db.ts";
import { ACTIVE_MODEL_BINDINGS, CAPABILITIES, capabilities, invalidateModelCache, modelSources } from "../editorial/models.ts";
import { audit } from "../audit.ts";

/** Registry choices and settings-based auto routes share the same admin page. */
export async function modelBindingsOverview(): Promise<AdminModelBindings> {
 const [models,connections,rows,effective]=await Promise.all([
  listRegisteredModels(),listConnections(),
  sql<{key:string;value:{model?:string}}[]>`SELECT key,value FROM settings WHERE key LIKE 'models.%'`,
  modelSources(),
 ]);
 const names=new Map(connections.map(c=>[c.id,c.name]));
 const saved=new Map(rows.map(r=>[r.key,r.value?.model??'']));
 const selection=(key:string)=>{
  const model=saved.get('models.'+key);
  return model?{model,source:'admin' as const}:{model:'',source:'default' as const};
 };
 return {
  defaultModel:selection('default'),
  steps:Object.entries(capabilities()).filter(([key])=>!(key in CAPABILITIES) || ACTIVE_MODEL_BINDINGS.has(key)).map(([key,c])=>({
   key,label:c.label,vision:!!c.vision,embedding:!!c.embedding,current:selection(key),effective:effective[key]!
  })),
  choices:models.filter(m=>m.adapter==='chat'||m.adapter==='embedding').map(m=>({
   key:'model:'+m.id,modelId:m.modelId,provider:names.get(m.providerId)??m.providerId,
   adapter:m.adapter,vision:m.capabilities.includes('vision')
  })),
 };
}

/** A setting is either a fixed model reference or an automatic free routing policy. */
export async function switchModel(capability:string,model:string|null,reason:string,actor:string){
 const step=capability==='default'?{vision:false,embedding:false}:capabilities()[capability];
 if(!step)throw Object.assign(new Error('unknown capability'),{statusCode:400});
 if(!reason.trim())throw Object.assign(new Error('a reason is required'),{statusCode:400});
 const automatic=model==='auto'||(model!==null&&/^auto:(light|medium|heavy)$/.test(model));
 if(step.embedding&&automatic)throw Object.assign(new Error('Choose a specific embedding model'),{statusCode:400});
 let id:string|null=null;
 if(model!==null&&!automatic){
  if(!model.startsWith('model:'))
   throw Object.assign(new Error('Choose a model from Model Management'),{statusCode:400});
  const selected=await loadModel(model.slice(6));
  if(selected.adapter!==(step.embedding?'embedding':'chat'))
   throw Object.assign(new Error(step.embedding?'This workflow needs an embedding model':'This workflow needs a chat model'),{statusCode:400});
  if(step.embedding)await registeredRuntime(selected.id,'embedding');
  if(step.vision&&!selected.capabilities.includes('vision'))
   throw Object.assign(new Error('This workflow needs a vision model'),{statusCode:400});
  id=selected.id;
 }
 const key='models.'+capability;
 const [previous]=await sql<{value:{model?:string}}[]> `SELECT value FROM settings WHERE key=${key}`;
 const before=previous?.value?.model??null;
 await sql.begin(async tx=>{
  if(automatic){
   await tx`INSERT INTO settings(key,value,updated_by) VALUES (${key},${tx.json({model})},${actor})
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`;
   await tx`DELETE FROM provider_workflow_models WHERE setting_key=${key}`;
  }else await writeWorkflowModel(tx,key,id,actor);
  await audit(actor,'models.switch','capability:'+capability,reason,{model:before},{model:model},{db:tx});
 });
 invalidateModelCache();
 return {capability,before:{model:before??'',source:before?'admin':'default'},
  after:{model:model??'',source:model?'admin':'default'}};
}
