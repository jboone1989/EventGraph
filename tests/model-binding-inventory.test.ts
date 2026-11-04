import "./setup.ts";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,test} from "node:test";
import {closeDb,sql} from "@aihot/backend/db";
import {modelBindingsOverview,switchModel} from "@aihot/backend/admin/models";
import {listRegisteredModels,deleteRegisteredModel} from "@aihot/backend/providers/registry/connections";

after(closeDb);
test("model list and bindings use the same inventory and support CRUD",async()=>{
 const connectionId=randomUUID(),modelId=randomUUID();
 await sql`INSERT INTO provider_connections
  (id,name,vendor,protocol,base_url,timeout_ms,enabled,policy,updated_by)
  VALUES (${connectionId}::uuid,'Binding inventory test','custom','openai-compatible',
   'https://model.example.org/v1',60000,true,'none','test')`;
 await sql`INSERT INTO registered_models
  (id,provider_id,model_id,adapter,capabilities,enabled,route_enabled,updated_by)
  VALUES (${modelId}::uuid,${connectionId}::uuid,'binding-inventory-test','chat',
   '["text"]'::jsonb,false,false,'test')`;
 const before=await modelBindingsOverview();
 assert.deepEqual(
  new Set(before.choices.map(c=>c.key)),
  new Set((await listRegisteredModels()).map(m=>'model:'+m.id)));
 assert.ok(before.choices.some(c=>c.key==='model:'+modelId));
 // Binding saves a relational assignment, not a verification/preset state.
 await switchModel('prefilter','model:'+modelId,'select new model','test');
 const [binding]=await sql<{model_id:string}[]>`
  SELECT model_id FROM provider_workflow_models WHERE setting_key='models.prefilter'`;
 assert.equal(binding?.model_id,modelId);
 const afterBind=await modelBindingsOverview();
 assert.deepEqual(afterBind.steps.find(s=>s.key==='prefilter')!.current,
  {model:'model:'+modelId,source:'admin'});
 // Removing a model also removes its workflow assignment and compatibility setting.
 assert.deepEqual(await deleteRegisteredModel(modelId,1,'delete model','test'),{deleted:true});
 const [exists]=await sql`SELECT 1 FROM provider_workflow_models WHERE setting_key='models.prefilter'`;
 const [setting]=await sql`SELECT 1 FROM settings WHERE key='models.prefilter'`;
 assert.equal(exists,undefined);assert.equal(setting,undefined);
 const afterDelete=await modelBindingsOverview();
 assert.ok(!afterDelete.choices.some(c=>c.key==='model:'+modelId));
 assert.deepEqual(afterDelete.steps.find(s=>s.key==='prefilter')!.current,
  {model:'',source:'default'});
 await sql`DELETE FROM provider_connections WHERE id=${connectionId}::uuid`;
});
test("binding API accepts only registered chat models and rejects old presets",async()=>{
 await assert.rejects(
  switchModel('prefilter','qwen3-vl-flash','should reject unregistered preset','test'),
  /Choose a model from Model Management/);
});

test("Graphiti embedding is an explicit embedding-only binding, never the chat default",async()=>{
 const connectionId=randomUUID(),chatId=randomUUID(),embeddingId=randomUUID();
 // No prior graphitiEmbedding assignment: this test owns the setting and removes it.
 await sql`DELETE FROM provider_workflow_models WHERE setting_key='models.graphitiEmbedding'`;
 await sql`DELETE FROM settings WHERE key='models.graphitiEmbedding'`;
 await sql`INSERT INTO provider_connections (id,name,vendor,protocol,base_url,timeout_ms,enabled,policy,updated_by)
   VALUES (${connectionId}::uuid,'Graphiti embedding binding test','custom','openai-compatible','https://model.example.org/v1',60000,true,'none','test')`;
 await sql`INSERT INTO registered_models (id,provider_id,model_id,adapter,capabilities,enabled,route_enabled,updated_by)
   VALUES (${chatId}::uuid,${connectionId}::uuid,'graphiti-chat-test','chat','["text"]'::jsonb,false,false,'test'),
          (${embeddingId}::uuid,${connectionId}::uuid,'graphiti-embedding-test','embedding','["embedding"]'::jsonb,false,false,'test')`;
 try{
  const {modelFor,invalidateModelCache}=await import('@aihot/backend/editorial/models');
  invalidateModelCache();
  await assert.rejects(modelFor('graphitiEmbedding'),/Configure a registered embedding model/);
  await assert.rejects(switchModel('graphitiEmbedding','auto','bad auto','test'),/specific tested embedding model/);
  await assert.rejects(switchModel('graphitiEmbedding','model:'+chatId,'wrong adapter','test'),/embedding model/);
  await switchModel('graphitiEmbedding','model:'+embeddingId,'binding test','test');
  const [assignment]=await sql<{model_id:string}[]>`SELECT model_id FROM provider_workflow_models WHERE setting_key='models.graphitiEmbedding'`;
  assert.equal(assignment?.model_id,embeddingId);
  const view=await modelBindingsOverview();
  assert.equal(view.steps.find(s=>s.key==='graphitiEmbedding')?.current.model,'model:'+embeddingId);
  await assert.rejects(modelFor('graphitiEmbedding'),/Model cannot route embedding/, 'an unverified model is not callable');
 }finally{
  await sql`DELETE FROM provider_workflow_models WHERE setting_key='models.graphitiEmbedding'`;
  await sql`DELETE FROM settings WHERE key='models.graphitiEmbedding'`;
  await sql`DELETE FROM registered_models WHERE id IN (${chatId}::uuid,${embeddingId}::uuid)`;
  await sql`DELETE FROM provider_connections WHERE id=${connectionId}::uuid`;
  const {invalidateModelCache}=await import('@aihot/backend/editorial/models');
  invalidateModelCache();
 }
});
