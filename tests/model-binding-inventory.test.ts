import "./setup.ts";
import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {createRequire} from "node:module";
import {config} from "@aihot/backend/config";
import {graphitiModelRequest} from "@aihot/backend/providers/graphiti-proxy";
import {clearRegisteredModelCache} from "@aihot/backend/providers/registry/connections";
import {after,test} from "node:test";
import {closeDb,sql} from "@aihot/backend/db";
import {modelBindingsOverview,switchModel} from "@aihot/backend/admin/models";
import {listRegisteredModels,deleteRegisteredModel,configurationFingerprint,configurationSnapshot,loadConnection,loadModel} from "@aihot/backend/providers/registry/connections";

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
 const priorKey=process.env.GRAPHITI_BINDING_TEST_KEY,priorEnv=process.env.GRAPHITI_EMBEDDING_MODEL_REF;
 process.env.GRAPHITI_BINDING_TEST_KEY='test-key-'+connectionId;
 delete process.env.GRAPHITI_EMBEDDING_MODEL_REF;
 // No prior graphitiEmbedding assignment: this test owns the setting and removes it.
 await sql`DELETE FROM provider_workflow_models WHERE setting_key='models.graphitiEmbedding'`;
 await sql`DELETE FROM settings WHERE key='models.graphitiEmbedding'`;
 await sql`INSERT INTO provider_connections (id,name,vendor,protocol,base_url,timeout_ms,enabled,policy,credential_env,updated_by)
   VALUES (${connectionId}::uuid,'Graphiti embedding binding test','custom','openai-compatible','https://model.example.org/v1',60000,true,'none','GRAPHITI_BINDING_TEST_KEY','test')`;
 await sql`INSERT INTO registered_models (id,provider_id,model_id,adapter,capabilities,enabled,route_enabled,updated_by)
   VALUES (${chatId}::uuid,${connectionId}::uuid,'graphiti-chat-test','chat','["text"]'::jsonb,false,false,'test'),
          (${embeddingId}::uuid,${connectionId}::uuid,'graphiti-embedding-test','embedding','["embedding"]'::jsonb,true,true,'test')`;
 try{
  const {modelFor,invalidateModelCache}=await import('@aihot/backend/editorial/models');
  invalidateModelCache();
  await assert.rejects(modelFor('graphitiEmbedding'),/Configure a registered embedding model/);
  await assert.rejects(switchModel('graphitiEmbedding','auto','bad auto','test'),/specific embedding model/);
  await assert.rejects(switchModel('graphitiEmbedding','model:'+chatId,'wrong adapter','test'),/embedding model/);
  await assert.rejects(switchModel('graphitiEmbedding','model:'+embeddingId,'untested model','test'),/Model cannot route embedding/);
  const [unbound]=await sql`SELECT model_id FROM provider_workflow_models WHERE setting_key='models.graphitiEmbedding'`;
  assert.equal(unbound,undefined,'an unverified model must not be saved');
  const m=await loadModel(embeddingId),c=await loadConnection(connectionId);
  await sql`INSERT INTO registered_model_checks(model_id,capability,config_fingerprint,config_snapshot,status,verified_at) VALUES (${embeddingId}::uuid,'embedding',${configurationFingerprint(c,m)},${sql.json(configurationSnapshot(c,m))},'verified',now())`;
  await switchModel('graphitiEmbedding','model:'+embeddingId,'verified embedding binding','test');
  const [assignment]=await sql<{model_id:string}[]>`SELECT model_id FROM provider_workflow_models WHERE setting_key='models.graphitiEmbedding'`;
  assert.equal(assignment?.model_id,embeddingId);
  const view=await modelBindingsOverview();
  assert.equal(view.steps.find(s=>s.key==='graphitiEmbedding')?.current.model,'model:'+embeddingId);
  assert.equal(await modelFor('graphitiEmbedding'),'model:'+embeddingId,'only a verified embedding binding can run');
 }finally{
  await sql`DELETE FROM provider_workflow_models WHERE setting_key='models.graphitiEmbedding'`;
  await sql`DELETE FROM settings WHERE key='models.graphitiEmbedding'`;
  await sql`DELETE FROM registered_models WHERE id IN (${chatId}::uuid,${embeddingId}::uuid)`;
  await sql`DELETE FROM provider_connections WHERE id=${connectionId}::uuid`;
  const {invalidateModelCache}=await import('@aihot/backend/editorial/models');
  invalidateModelCache();
  if(priorKey===undefined)delete process.env.GRAPHITI_BINDING_TEST_KEY;
  else process.env.GRAPHITI_BINDING_TEST_KEY=priorKey;
  if(priorEnv===undefined)delete process.env.GRAPHITI_EMBEDDING_MODEL_REF;
  else process.env.GRAPHITI_EMBEDDING_MODEL_REF=priorEnv;
 }
});

test("Graphiti registered chat is non-streaming upstream and reuses received receipts",async()=>{
 const require=createRequire(new URL("../packages/backend/package.json",import.meta.url));
 const {MockAgent,getGlobalDispatcher,setGlobalDispatcher}=require("undici") as typeof import("undici");
 const previous={dispatcher:getGlobalDispatcher(),private:config.allowPrivateNetworkFetch,proxy:config.egressProxyUrl,calls:config.modelCallsEnabled,secret:process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY,testKey:process.env.GRAPHITI_INTEGRATION_TEST_KEY,dim:process.env.GRAPHITI_EMBEDDING_DIM};
 const agent=new MockAgent();agent.disableNetConnect();setGlobalDispatcher(agent);
 config.allowPrivateNetworkFetch=true;config.egressProxyUrl=null;config.modelCallsEnabled=true;
 process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString("base64");
 const connectionId=randomUUID(),chatId=randomUUID(),embeddingId=randomUUID(),modelId="graphiti-stream-"+chatId,embeddingModelId="graphiti-vector-"+embeddingId;
 process.env.GRAPHITI_INTEGRATION_TEST_KEY="test-key-"+connectionId;
 try{
  await sql`INSERT INTO provider_connections (id,name,vendor,protocol,base_url,timeout_ms,enabled,policy,credential_env,updated_by) VALUES (${connectionId}::uuid,'Graphiti stream test','custom','openai-compatible','https://graphiti-test.invalid/v1',60000,true,'none','GRAPHITI_INTEGRATION_TEST_KEY','test')`;
  await sql`INSERT INTO registered_models (id,provider_id,model_id,adapter,capabilities,enabled,route_enabled,stream,updated_by) VALUES (${chatId}::uuid,${connectionId}::uuid,${modelId},'chat','["text"]'::jsonb,true,true,true,'test')`;
  const c=await loadConnection(connectionId),m=await loadModel(chatId);
  await sql`INSERT INTO registered_model_checks(model_id,capability,config_fingerprint,config_snapshot,status,verified_at) VALUES (${chatId}::uuid,'text',${configurationFingerprint(c,m)},${sql.json(configurationSnapshot(c,m))},'verified',now())`;
  await switchModel("graphiti","model:"+chatId,"stream transport test","test");
  let sent=0,requestBody:Record<string,unknown>={};
  agent.get("https://graphiti-test.invalid").intercept({path:"/v1/chat/completions",method:"POST"}).reply(req=>{
   sent++;requestBody=JSON.parse(String(req.body));
   return {statusCode:200,data:{choices:[{message:{role:"assistant",content:"OK"}}],usage:{prompt_tokens:2,completion_tokens:1}}};
  });
  const query={messages:[{role:"user",content:"hello Graphiti"}]};
  const one=await graphitiModelRequest("chat",query);
  const two=await graphitiModelRequest("chat",query);
  assert.deepEqual(one,two);
  assert.equal(sent,1,"duplicate logical request must reuse the saved receipt");
  assert.equal(requestBody.stream,false,"the registered stream=true setting cannot override Graphiti non-streaming");
  assert.equal(requestBody.model,modelId);
  const [receipt]=await sql<{status:string;attempts:number}[]>`SELECT status,attempts FROM receipts WHERE purpose='graphiti_chat' AND model=${modelId} ORDER BY id DESC LIMIT 1`;
  assert.deepEqual([receipt?.status,receipt?.attempts],["received",1]);
  await sql`INSERT INTO registered_models (id,provider_id,model_id,adapter,capabilities,enabled,route_enabled,stream,updated_by) VALUES (${embeddingId}::uuid,${connectionId}::uuid,${embeddingModelId},'embedding','["embedding"]'::jsonb,true,true,false,'test')`;
  const em=await loadModel(embeddingId);
  await sql`INSERT INTO registered_model_checks(model_id,capability,config_fingerprint,config_snapshot,status,verified_at) VALUES (${embeddingId}::uuid,'embedding',${configurationFingerprint(c,em)},${sql.json(configurationSnapshot(c,em))},'verified',now())`;
  await switchModel("graphitiEmbedding","model:"+embeddingId,"verified embedding test","test");
  process.env.GRAPHITI_EMBEDDING_DIM="3";
  let vectorInput:Record<string,unknown>={};
  agent.get("https://graphiti-test.invalid").intercept({path:"/v1/embeddings",method:"POST"}).reply(req=>{vectorInput=JSON.parse(String(req.body));return {statusCode:200,data:{data:[{index:0,embedding:[0.1,0.2]}]}};});
  await assert.rejects(graphitiModelRequest("embedding",{input:["vector test"]}),/dimension mismatch/);
  assert.equal(vectorInput.encoding_format,"float");
  const [vectorReceipt]=await sql<{status:string}[]>`SELECT status FROM receipts WHERE purpose='graphiti_embedding' AND model=${embeddingModelId} ORDER BY id DESC LIMIT 1`;
  assert.equal(vectorReceipt?.status,"failed","an unusable vector must reject its receipt");
 }finally{
  await sql`DELETE FROM provider_workflow_models WHERE setting_key='models.graphiti'`;
  await sql`DELETE FROM provider_workflow_models WHERE setting_key='models.graphitiEmbedding'`;
  await sql`DELETE FROM settings WHERE key='models.graphitiEmbedding'`;
  await sql`DELETE FROM settings WHERE key='models.graphiti'`;
  await sql`DELETE FROM registered_models WHERE id IN (${chatId}::uuid,${embeddingId}::uuid)`;
  await sql`DELETE FROM provider_connections WHERE id=${connectionId}::uuid`;
  clearRegisteredModelCache();
  setGlobalDispatcher(previous.dispatcher);config.allowPrivateNetworkFetch=previous.private;config.egressProxyUrl=previous.proxy;config.modelCallsEnabled=previous.calls;
  if(previous.secret===undefined)delete process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY;else process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY=previous.secret;
  if(previous.testKey===undefined)delete process.env.GRAPHITI_INTEGRATION_TEST_KEY;else process.env.GRAPHITI_INTEGRATION_TEST_KEY=previous.testKey;
  if(previous.dim===undefined)delete process.env.GRAPHITI_EMBEDDING_DIM;else process.env.GRAPHITI_EMBEDDING_DIM=previous.dim;
  await agent.close();
 }
});
