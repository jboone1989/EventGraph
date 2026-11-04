import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {sql,closeDb} from '@aihot/backend/db';
import {createConnection,updateConnection,deleteConnection,listConnections,loadConnection,
 createRegisteredModel,updateRegisteredModel,deleteRegisteredModel,getRegisteredModel,
 configurationFingerprint,routingState,loadModel,writeWorkflowModel,clearRegisteredModelCache} from '@aihot/backend/providers/registry/connections';
import {storedCredential,credentialDigest} from '@aihot/backend/providers/registry/connection-secrets';
import {ProviderConfigError,type ConnectionInput,type ModelInput} from '@aihot/backend/providers/registry/connection-types';

process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('base64');
const actor='provider-test';
const connection=(extra:Partial<ConnectionInput>={}):ConnectionInput=>({name:'Example',vendor:'example',protocol:'openai-compatible',
 baseUrl:'https://example.com/custom/v4',timeoutMs:60000,enabled:true,...extra});
const model=(providerId:string,extra:Partial<ModelInput>={}):ModelInput=>({providerId,modelId:'shared-name',adapter:'chat',
 endpointOverride:null,capabilities:['text'],requestDefaults:{enable_thinking:false},probeSpec:{capability:'text',
 body:{messages:[{role:'user',content:'Reply OK'}]},response:'chat'},stream:false,complexity:'medium',
 documentationUrl:null,notes:null,enabled:false,routeEnabled:false,...extra});
after(closeDb);
test('runtime model cache hits until cleared, while CRUD invalidates it automatically',async()=>{
 const c=await createConnection(connection({name:'cache-'+randomUUID()}),'create',actor);
 const m=await createRegisteredModel(model(c.id,{modelId:'before'}),'create',actor);
 assert.equal((await loadModel(m.id)).model_id,'before');
 await sql`UPDATE registered_models SET model_id='after' WHERE id=${m.id}::uuid`;
 assert.equal((await loadModel(m.id)).model_id,'before');
 clearRegisteredModelCache();
 assert.equal((await loadModel(m.id)).model_id,'after');
 const edited=await updateRegisteredModel(m.id,model(c.id,{modelId:'edited'}),m.version,'edit',actor);
 assert.equal((await loadModel(m.id)).model_id,'edited');
 await deleteRegisteredModel(m.id,edited.version,'delete',actor);
 await assert.rejects(loadModel(m.id),/Model not found/);
});

test('persisted credential fingerprint is keyed, never the offline SHA-256 of an API secret',()=>{
 const weak='weak-secret-for-test',plain=createHash('sha256').update(weak).digest('hex');
 assert.notEqual(credentialDigest(weak),plain);
 assert.notEqual(credentialDigest(weak),credentialDigest(weak+'-rotated'));
});


test('a provider with no models can be deleted in one CRUD operation even when enabled',async()=>{
 const first=await createConnection(connection({name:'empty-'+randomUUID(),enabled:true}),'create',actor);
 assert.deepEqual(await deleteConnection(first.id,first.version,'delete empty connection',actor),{deleted:true});
 const second=await createConnection(connection({name:'has-model-'+randomUUID(),enabled:true}),'create',actor);
 const child=await createRegisteredModel(model(second.id),'create child',actor);
 await assert.rejects(deleteConnection(second.id,second.version,'delete with child',actor),
  e=>e instanceof ProviderConfigError&&e.statusCode===409&&e.dependencies.some(d=>d.id===child.id));
 await deleteRegisteredModel(child.id,child.version,'delete child',actor);
 assert.deepEqual(await deleteConnection(second.id,second.version,'delete empty connection',actor),{deleted:true});
});

test('credentials support replace, keep and clear, without values in views or audits',async()=>{
 const secret='secret-'+randomUUID();
 const c=await createConnection(connection({credential:{action:'replace',value:secret}}),'test',actor);
 assert.deepEqual(c.credential,{configured:true});assert.ok(!JSON.stringify(c).includes(secret));
 const row=await loadConnection(c.id);
 assert.equal(storedCredential(row),secret);assert.notEqual(row.credential_secret,secret);
 const kept=await updateConnection(c.id,connection({credential:{action:'keep'}}),c.version,'keep',actor);
 assert.equal(storedCredential(await loadConnection(c.id)),secret);
 assert.equal((await loadConnection(c.id)).credential_version,row.credential_version);
 const secret2='replacement-'+randomUUID();
 const replaced=await updateConnection(c.id,connection({credential:{action:'replace',value:secret2}}),kept.version,'replace',actor);
 assert.equal(storedCredential(await loadConnection(c.id)),secret2);
 const cleared=await updateConnection(c.id,connection({credential:{action:'clear'}}),replaced.version,'clear',actor);
 assert.deepEqual(cleared.credential,{configured:false});assert.equal(storedCredential(await loadConnection(c.id)),null);
 const audits=await sql`SELECT before,after FROM audit_log WHERE subject=${c.id}`;
 assert.ok(!JSON.stringify(audits).includes(secret));assert.ok(!JSON.stringify(audits).includes(secret2));
 assert.ok(!JSON.stringify(await listConnections()).includes('credential_secret'));
});

test('a credential cannot be retained across different origins, and model overrides cannot redirect it',async()=>{
 const c=await createConnection(connection({credential:{action:'replace',value:'sensitive-key'}}),'test',actor);
 await assert.rejects(updateConnection(c.id,connection({baseUrl:'https://unrelated.invalid/v1',credential:{action:'keep'}}),c.version,'host',actor),/Replace or clear the credential/);
 await assert.rejects(createRegisteredModel(model(c.id,{endpointOverride:'https://unrelated.invalid/v1/chat/completions'}),'test',actor),/share the connection origin/);
 const changed=await updateConnection(c.id,connection({baseUrl:'https://unrelated.invalid/v1',credential:{action:'clear'}}),c.version,'clear-key',actor);
 assert.equal(changed.credential.configured,false);
});

test('same upstream model name is independent across connections; duplicates on one connection conflict',async()=>{
 const a=await createConnection(connection(),'test',actor),b=await createConnection(connection({vendor:'other'}),'test',actor);
 const ma=await createRegisteredModel(model(a.id),'test',actor),mb=await createRegisteredModel(model(b.id),'test',actor);
 assert.notEqual(ma.id,mb.id);assert.notEqual(ma.providerId,mb.providerId);
 await assert.rejects(createRegisteredModel(model(a.id),'test',actor),(e:unknown)=>e instanceof ProviderConfigError&&e.statusCode===409&&!!e.fieldErrors.modelId);
 const edited=await updateRegisteredModel(ma.id,model(a.id,{modelId:'renamed',requestDefaults:{custom_reasoning:{enabled:true}}}),ma.version,'edit',actor);
 assert.equal(edited.id,ma.id);assert.equal((await getRegisteredModel(mb.id)).modelId,'shared-name');
 await assert.rejects(updateRegisteredModel(ma.id,model(a.id),ma.version,'stale',actor),(e:unknown)=>e instanceof ProviderConfigError&&e.statusCode===409);
});

test('protected endpoints cannot be bypassed through brand, policy payload or a host change',async()=>{
 const c=await createConnection(connection({vendor:'anything',baseUrl:'https://integrate.api.nvidia.com/v1'}),'test',actor);
 assert.equal(c.policy,'nvidia-free-trial');
 const dotted=await createConnection(connection({vendor:'anything',baseUrl:'https://INTEGRATE.API.NVIDIA.COM./v1'}),'test',actor);
 assert.equal(dotted.policy,'nvidia-free-trial');
 await assert.rejects(createRegisteredModel(model(c.id,{modelId:'not-approved',enabled:true}),'test',actor),/free trial/);
 await assert.rejects(updateConnection(c.id,connection({baseUrl:'https://example.com/v1'}),c.version,'bypass',actor),/NVIDIA/);
 await assert.rejects(createConnection({...connection(),policy:'none'} as never,'test',actor),/Unknown/);
 await assert.rejects(createConnection(connection({baseUrl:'https://ai.api.nvidia.com/v12'}),'test',actor),/NVIDIA/);
 const m=await createRegisteredModel(model(c.id,{modelId:'openai/gpt-oss-20b'}),'test',actor);
 await assert.rejects(updateRegisteredModel(m.id,model(c.id,{modelId:m.modelId,endpointOverride:'https://example.com/v1/chat/completions'}),m.version,'bypass',actor),/NVIDIA|connection origin/);
});

test('verification follows configuration fingerprints, including external credential rotation',async()=>{
 process.env.PROVIDER_TEST_KEY='first';
 const c=await createConnection(connection(),'test',actor);
 await sql`UPDATE provider_connections SET credential_env='PROVIDER_TEST_KEY' WHERE id=${c.id}::uuid`;
 const m=await createRegisteredModel(model(c.id),'test',actor);
 const fingerprint=configurationFingerprint(await loadConnection(c.id),await loadModel(m.id));
 await sql`INSERT INTO registered_model_checks(model_id,capability,config_fingerprint,status,verified_at)
  VALUES (${m.id}::uuid,'text',${fingerprint},'verified',now())`;
 assert.equal((await getRegisteredModel(m.id)).checks[0]?.status,'verified');
 // A matching successful check remains valid when only time has passed.
 const eligibleRow={...await loadModel(m.id),enabled:true,route_enabled:true};
 const eligibleConnection=await loadConnection(c.id);
 const oldCheck={model_id:m.id,capability:'text',config_fingerprint:fingerprint,status:'legacy',
    verified_at:new Date(Date.now()-25*60*60*1000),latency_ms:null};
 const stillVerified=routingState(eligibleRow,eligibleConnection,[oldCheck]);
 assert.deepEqual(stillVerified.eligibleCapabilities,['text']);
 // A future-dated or unsuccessful check must never enable routing.
 const future=routingState(eligibleRow,eligibleConnection,[{...oldCheck,status:'verified',
   verified_at:new Date(Date.now()+60*60*1000)}]);
 assert.deepEqual(future.eligibleCapabilities,[]);
 const failed=routingState(eligibleRow,eligibleConnection,[{...oldCheck,status:'failed'}]);
 assert.deepEqual(failed.eligibleCapabilities,[]);
 const renamed=await updateConnection(c.id,connection({name:'New display name'}),c.version,'display',actor);
 assert.equal((await getRegisteredModel(m.id)).checks[0]?.status,'verified');
 process.env.PROVIDER_TEST_KEY='rotated';
 assert.equal((await getRegisteredModel(m.id)).checks[0]?.status,'unverified');
 process.env.PROVIDER_TEST_KEY='first';
 const edited=await updateRegisteredModel(m.id,model(c.id,{requestDefaults:{temperature:0.8}}),m.version,'params',actor);
 assert.equal(edited.checks[0]?.status,'unverified');
 await assert.rejects(updateRegisteredModel(m.id,model(c.id,{requestDefaults:{temperature:0.8},enabled:true,routeEnabled:true}),edited.version,'route',actor),/successful capability test/);
 const changed=await updateConnection(c.id,connection({baseUrl:'https://example.com/another/v1'}),renamed.version,'address',actor);
 assert.equal(changed.baseUrl,'https://example.com/another/v1');
 assert.equal((await getRegisteredModel(m.id)).checks[0]?.verifiedAt,null);
});

test('a successful 25-hour-old capability test can enable routing without repeated paid calls',async()=>{
 const c=await createConnection(connection({name:'persistent-'+randomUUID(),
  credential:{action:'replace',value:'test-key-'+randomUUID()}}),'create',actor);
 const input=model(c.id,{enabled:true});
 const m=await createRegisteredModel(input,'create',actor);
 const fingerprint=configurationFingerprint(await loadConnection(c.id),await loadModel(m.id));
 await sql`INSERT INTO registered_model_checks(model_id,capability,config_fingerprint,status,verified_at)
   VALUES (${m.id}::uuid,'text',${fingerprint},'verified',now()-interval '25 hours')`;
 const routed=await updateRegisteredModel(m.id,{...input,routeEnabled:true},m.version,'enable',actor);
 assert.deepEqual(routed.routing.eligibleCapabilities,['text']);
});

test('deleting a bound model clears its workflow assignment and settings atomically',async()=>{
 const c=await createConnection(connection({enabled:false}),'test',actor);
 const m=await createRegisteredModel(model(c.id),'test',actor);
 const key='models.provider-test-'+randomUUID();
 await sql.begin(tx=>writeWorkflowModel(tx,key,m.id,actor));
 await assert.rejects(deleteConnection(c.id,c.version,'delete',actor),(e:unknown)=>
  e instanceof ProviderConfigError&&e.statusCode===409&&e.dependencies.some(d=>d.kind==='model'&&d.id===m.id)&&e.dependencies.some(d=>d.id===key));
 assert.deepEqual(await deleteRegisteredModel(m.id,m.version,'delete',actor),{deleted:true});
 const [binding]=await sql`SELECT 1 FROM provider_workflow_models WHERE setting_key=${key}`;
 const [setting]=await sql`SELECT 1 FROM settings WHERE key=${key}`;
 assert.equal(binding,undefined);
 assert.equal(setting,undefined);
 assert.deepEqual(await deleteConnection(c.id,c.version,'delete',actor),{deleted:true});
});
