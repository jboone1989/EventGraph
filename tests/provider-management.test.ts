import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {z} from 'zod';
import {sql,closeDb} from '@aihot/backend/db';
import {config} from '@aihot/backend/config';
import {createConnection,createRegisteredModel,updateRegisteredModel,updateConnection,getRegisteredModel,loadConnection,loadModel,configurationFingerprint,configurationSnapshot,writeWorkflowModel} from '@aihot/backend/providers/registry/connections';
import {registeredRuntime,requestRegisteredModel,discoverModels,testRegisteredModel,embedRegisteredModel} from '@aihot/backend/providers/registry/runtime';
import {importModels} from '@aihot/backend/providers/registry/import';
import {switchModel} from '@aihot/backend/admin/models';
import {modelFor,modelSources,invalidateModelCache,stepsOnService} from '@aihot/backend/editorial/models';
import {chatJson} from '@aihot/backend/providers/llm';
import type {ConnectionInput,ModelInput} from '@aihot/contracts/providers';
import {buildApp} from '../apps/api/src/app.ts';
const {MockAgent,getGlobalDispatcher,setGlobalDispatcher}=createRequire(new URL('../packages/backend/package.json',import.meta.url))('undici') as typeof import('undici');
const prior={dispatcher:getGlobalDispatcher(),private:config.allowPrivateNetworkFetch,proxy:config.egressProxyUrl,admin:config.devAdmin};
const network=new MockAgent();network.disableNetConnect();setGlobalDispatcher(network);
config.allowPrivateNetworkFetch=true;config.egressProxyUrl=null;config.devAdmin={displayName:'Test admin'};
process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('base64');
after(async()=>{setGlobalDispatcher(prior.dispatcher);config.allowPrivateNetworkFetch=prior.private;config.egressProxyUrl=prior.proxy;config.devAdmin=prior.admin;await network.close();await closeDb();});
const connection=(extra:Partial<ConnectionInput>={}):ConnectionInput=>({name:'Generic',vendor:'example',protocol:'openai-compatible',baseUrl:'https://provider.invalid/prefix/v4',timeoutMs:60000,enabled:true,credential:{action:'replace',value:'private-key-'+randomUUID()},...extra});
const model=(providerId:string,extra:Partial<ModelInput>={}):ModelInput=>({providerId,modelId:'same-model',adapter:'chat',endpointOverride:null,capabilities:['text'],requestDefaults:{custom_reasoning:{enabled:false}},probeSpec:{capability:'text',body:{messages:[{role:'user',content:'OK'}]},response:'chat'},stream:false,complexity:'medium',documentationUrl:null,notes:null,enabled:true,routeEnabled:false,...extra});
async function certify(id:string,capability='text') {
 const m=await loadModel(id),c=await loadConnection(m.provider_id);
 await sql`INSERT INTO registered_model_checks(model_id,capability,config_fingerprint,config_snapshot,status,verified_at)
  VALUES (${id}::uuid,${capability},${configurationFingerprint(c,m)},${sql.json(configurationSnapshot(c,m))},'verified',now())
  ON CONFLICT(model_id,capability) DO UPDATE SET config_fingerprint=EXCLUDED.config_fingerprint,config_snapshot=EXCLUDED.config_snapshot,status='verified',verified_at=now()`;
}
test('actual chat dispatch preserves prefix, connection identity, credentials and receipts',async()=>{
 const a=await createConnection(connection({baseUrl:'https://first.invalid/custom/v4',credential:{action:'replace',value:'first-key'}}),'test','test');
 const b=await createConnection(connection({baseUrl:'https://second.invalid/other',credential:{action:'replace',value:'second-key'}}),'test','test');
 for(const c of [a,b]) {
  const input=model(c.id),m=await createRegisteredModel(input,'test','test');await certify(m.id);
  await updateRegisteredModel(m.id,{...input,routeEnabled:true},m.version,'route','test');
  const origin=c.id===a.id?'https://first.invalid':'https://second.invalid',prefix=c.id===a.id?'/custom/v4':'/other',key=c.id===a.id?'first-key':'second-key';
  network.get(origin).intercept({path:prefix+'/chat/completions',method:'POST',headers:{authorization:'Bearer '+key}}).reply(200,{choices:[{message:{content:'{"ok":true}'}}],usage:{prompt_tokens:1}});
  const out=await chatJson({model:'model:'+m.id,purpose:'provider-test',subject:c.id,promptVersion:'1',system:'',user:'hi',schema:z.object({ok:z.boolean()})});
  assert.equal(out.data.ok,true);
  const [receipt]=await sql`SELECT request FROM receipts WHERE id=${out.receiptId}`;
  assert.ok(!JSON.stringify(receipt).includes(key));
 }
 network.assertNoPendingInterceptors();
});
test('display edits retain routing; model and connection changes save but block current calls',async()=>{
 const c=await createConnection(connection(),'test','test'),input=model(c.id);
 let m=await createRegisteredModel(input,'test','test');await certify(m.id);
 m=await updateRegisteredModel(m.id,{...input,routeEnabled:true},m.version,'route','test');
 m=await updateRegisteredModel(m.id,{...input,notes:'ordinary note',routeEnabled:true},m.version,'note','test');
 assert.deepEqual(m.routing.eligibleCapabilities,['text']);
 assert.equal((await registeredRuntime(m.id,'text')).m.id,m.id);
 m=await updateRegisteredModel(m.id,{...input,requestDefaults:{temperature:0.8},routeEnabled:true},m.version,'params','test');
 assert.equal(m.routeEnabled,true);assert.deepEqual(m.routing.eligibleCapabilities,[]);assert.match(m.routing.reasons.join(' '),/model/);
 await assert.rejects(registeredRuntime(m.id,'text'),/cannot route/);
 await certify(m.id);
 const changed=await updateConnection(c.id,connection({baseUrl:'https://provider.invalid/new-prefix',credential:{action:'keep'}}),c.version,'address','test');
 assert.ok(changed);
 assert.match((await getRegisteredModel(m.id)).routing.reasons.join(' '),/address/);
 await assert.rejects(requestRegisteredModel(m.id,'text',{}),/cannot route/);
 network.assertNoPendingInterceptors();
});
test('test results authorize only their matching capability and configuration; stale in-flight tests do not restore routing',async()=>{
 const c=await createConnection(connection(),'test','test'),input=model(c.id,{capabilities:['text','vision']});
 let m=await createRegisteredModel(input,'test','test');
 network.get('https://provider.invalid').intercept({path:'/prefix/v4/chat/completions',method:'POST'}).reply(200,{choices:[{message:{content:'OK'}}]});
 assert.equal((await testRegisteredModel(m.id,'text','test')).status,'verified');
 m=await updateRegisteredModel(m.id,{...input,routeEnabled:true},m.version,'route','test');
 assert.deepEqual(m.routing.eligibleCapabilities,['text']);
 await assert.rejects(registeredRuntime(m.id,'vision'),/capability has no current successful test/);
 const old=await registeredRuntime(m.id,'text');
 m=await updateRegisteredModel(m.id,{...input,routeEnabled:true,modelId:'changed'},m.version,'rename','test');
 await certify(m.id);
 await assert.rejects(requestRegisteredModel(m.id,'text',{},old.fingerprint),/changed before request/);
 network.assertNoPendingInterceptors();
});
test('discovery is optional and absent models stay configured; repeat import preserves operator fields',async()=>{
 const c=await createConnection(connection(),'test','test');
 const existing=await createRegisteredModel(model(c.id,{modelId:'not-returned',enabled:false,notes:'manual'}),'test','test');
 network.get('https://provider.invalid').intercept({path:'/prefix/v4/models',method:'GET'}).reply(200,{data:[{id:'found'},{id:'found'}]});
 assert.deepEqual((await discoverModels(c.id)).models,[{modelId:'found',status:'new'},{modelId:'not-returned',status:'not-discovered'}]);
 const imported=await importModels(c.id,['found','not-returned'],'select','test');
 assert.equal(imported.models.length,2);
 assert.equal((await getRegisteredModel(existing.id)).notes,'manual');
 const found=imported.models.find(m=>m.modelId==='found')!;assert.equal(found.enabled,false);assert.equal(found.routeEnabled,false);
 await importModels(c.id,['found'],'repeat','test');assert.equal((await getRegisteredModel(found.id)).version,1);
 network.get('https://provider.invalid').intercept({path:'/prefix/v4/models',method:'GET'}).reply(404,{});
 await assert.rejects(discoverModels(c.id),/HTTP 404/);
 assert.ok(await createRegisteredModel(model(c.id,{modelId:'manual-after-discovery-failure'}),'manual','test'));
});
test('provider redirects are refused and upstream error bodies never expose credentials',async()=>{
 const c=await createConnection(connection({credential:{action:'replace',value:'do-not-echo-this-key'}}),'test','test');
 network.get('https://provider.invalid').intercept({path:'/prefix/v4/models',method:'GET'}).reply(302,'',{headers:{location:'https://other.invalid/capture'}});
 await assert.rejects(discoverModels(c.id),e=>!String(e).includes('do-not-echo-this-key'));
 network.get('https://provider.invalid').intercept({path:'/prefix/v4/models',method:'GET'}).reply(401,'do-not-echo-this-key');
 await assert.rejects(discoverModels(c.id),e=>!String(e).includes('do-not-echo-this-key'));
});
test('workflow switch and reset update the FK binding with settings and fail closed on unknown references',async()=>{
 const c=await createConnection(connection(),'test','test'),m=await createRegisteredModel(model(c.id),'test','test');
 await certify(m.id);await updateRegisteredModel(m.id,{...model(c.id),routeEnabled:true},m.version,'route','test');
 await switchModel('summarize','model:'+m.id,'switch','test');
 assert.equal(await modelFor('summarize'),'model:'+m.id);assert.equal((await modelSources()).summarize?.model,'model:'+m.id);
 assert.ok((await stepsOnService('example')).length);
 const [binding]=await sql`SELECT model_id FROM provider_workflow_models WHERE setting_key='models.summarize'`;assert.equal(binding!.model_id,m.id);
 await switchModel('summarize',null,'reset','test');assert.equal((await sql`SELECT 1 FROM provider_workflow_models WHERE setting_key='models.summarize'`).length,0);
 await sql`INSERT INTO settings(key,value,updated_by) VALUES ('models.summarize','{"model":"missing-model"}'::jsonb,'test')`;
 // Fail closed if the saved admin model is invalid and no environment fallback exists.
 const priorEnv=process.env.SUMMARIZE_MODEL;
 delete process.env.SUMMARIZE_MODEL;
 try{invalidateModelCache();await assert.rejects(modelFor('summarize'),/Unknown configured model/);}
 finally{priorEnv===undefined?delete process.env.SUMMARIZE_MODEL:process.env.SUMMARIZE_MODEL=priorEnv;}
 await sql`DELETE FROM settings WHERE key='models.summarize'`;invalidateModelCache();
});
test('NVIDIA domain recognition enforces boundary, approved endpoint and model policy',async()=>{
 for(const baseUrl of ['https://api.nvidia.com/v1','https://NVIDIA.COM./v1','https://unapproved.api.nvidia.com/v1'])
  await assert.rejects(createConnection(connection({baseUrl}),'test','test'),/NVIDIA/);
 const c=await createConnection(connection({baseUrl:'https://nvidia.com.example.org/v1'}),'test','test');assert.equal(c.policy,'none');
 const m=await createRegisteredModel(model(c.id,{enabled:false,endpointOverride:'https://other.api.nvidia.com/v1/chat/completions'}),'test','test').catch(e=>e);
 assert.match(String(m),/NVIDIA/);
});
test('normalized embedding adapter uses configured prefix and receipt budget',async()=>{
 const c=await createConnection(connection(),'test','test');
 const input=model(c.id,{adapter:'embedding',capabilities:['embedding'],probeSpec:{capability:'embedding',body:{input:'sample'},response:'embedding'}});
 const m=await createRegisteredModel(input,'test','test');await certify(m.id,'embedding');await updateRegisteredModel(m.id,{...input,routeEnabled:true},m.version,'route','test');
 network.get('https://provider.invalid').intercept({path:'/prefix/v4/embeddings',method:'POST',body:b=>!String(b).includes('stream')}).reply(200,{data:[{embedding:[1,2,3]}]});
 assert.deepEqual((await embedRegisteredModel(m.id,'hi','embedding-test',m.id)).vectors,[[1,2,3]]);
});
test('HTTP CRUD enforces auth and CSRF, exposes field errors and returns deletion dependencies',async()=>{
 const app=await buildApp();
 try {
  const headers={'x-csrf-token':'dev'};
  const denied=await app.inject({method:'POST',url:'/api/admin/providers',payload:{}});assert.equal(denied.statusCode,403);
  const bad=await app.inject({method:'POST',url:'/api/admin/providers',headers,payload:{...connection(),baseUrl:'http://127.0.0.1',reason:'test'}});
  assert.equal(bad.statusCode,400);assert.ok(bad.json().fieldErrors.baseUrl);
  const created=await app.inject({method:'POST',url:'/api/admin/providers',headers,payload:{...connection(),reason:'test'}});
  assert.equal(created.statusCode,200);const c=created.json();assert.deepEqual(c.credential,{configured:true});
  assert.ok(!created.body.includes('private-key'));
  const add=await app.inject({method:'POST',url:'/api/admin/providers/'+c.id+'/models',headers,payload:{...model(c.id,{enabled:false}),reason:'test'}});
  assert.equal(add.statusCode,200);
  const imported=await app.inject({method:'POST',url:'/api/admin/providers/'+c.id+'/models:import',headers,payload:{modelIds:['selected-import'],reason:'select'}});assert.equal(imported.statusCode,200);
  const deleted=await app.inject({method:'DELETE',url:'/api/admin/providers/'+c.id,headers,payload:{version:c.version,reason:'delete'}});
  assert.equal(deleted.statusCode,409);assert.equal(deleted.json().dependencies[0].kind,'model');
  const list=await app.inject({url:'/api/admin/providers'});assert.equal(list.statusCode,200);assert.ok(list.json().providers.some((p:{id:string})=>p.id===c.id));
  const stale=await app.inject({method:'PATCH',url:'/api/admin/providers/'+c.id,headers,payload:{...connection(),reason:'stale',version:99}});assert.equal(stale.statusCode,409);
  config.devAdmin=null;assert.equal((await app.inject({url:'/api/admin/providers'})).statusCode,401);
 } finally {config.devAdmin={displayName:'Test admin'};await app.close();}
});
