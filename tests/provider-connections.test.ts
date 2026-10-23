import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {sql,closeDb} from '@aihot/backend/db';
import {createConnection,updateConnection,deleteConnection,listConnections,loadConnection,
 createRegisteredModel,updateRegisteredModel,deleteRegisteredModel,getRegisteredModel,
 configurationFingerprint,routingState,normalizedRegistryActive,loadModel,writeWorkflowModel,resolveModelReference,resolveLegacyModel} from '@aihot/backend/providers/registry/connections';
import {storedCredential,credentialDigest} from '@aihot/backend/providers/registry/connection-secrets';
import {ProviderConfigError,type ConnectionInput,type ModelInput} from '@aihot/backend/providers/registry/connection-types';
import {migrateProviderConnections,migratedId} from '../scripts/migrate-provider-connections.ts';

process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('base64');
const actor='provider-test';
const connection=(extra:Partial<ConnectionInput>={}):ConnectionInput=>({name:'Example',vendor:'example',protocol:'openai-compatible',
 baseUrl:'https://example.com/custom/v4',timeoutMs:60000,enabled:true,...extra});
const model=(providerId:string,extra:Partial<ModelInput>={}):ModelInput=>({providerId,modelId:'shared-name',adapter:'chat',
 endpointOverride:null,capabilities:['text'],requestDefaults:{enable_thinking:false},probeSpec:{capability:'text',
 body:{messages:[{role:'user',content:'Reply OK'}]},response:'chat'},stream:false,complexity:'medium',
 documentationUrl:null,notes:null,enabled:false,routeEnabled:false,...extra});
after(closeDb);
test('persisted credential fingerprint is keyed, never the offline SHA-256 of an API secret',()=>{
 const weak='weak-secret-for-test',plain=createHash('sha256').update(weak).digest('hex');
 assert.notEqual(credentialDigest(weak),plain);
 assert.notEqual(credentialDigest(weak),credentialDigest(weak+'-rotated'));
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
 // Even an exact legacy fingerprint cannot authorize checks older than 24 hours.
 const stale=routingState({...await loadModel(m.id),enabled:true,route_enabled:true},await loadConnection(c.id),
  [{model_id:m.id,capability:'text',config_fingerprint:fingerprint,status:'legacy',
    verified_at:new Date(Date.now()-25*60*60*1000),latency_ms:null}]);
 assert.deepEqual(stale.eligibleCapabilities,[]);
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

test('deletion reports concrete model/workflow dependencies and keeps enable separate',async()=>{
 const c=await createConnection(connection({enabled:false}),'test',actor);
 const m=await createRegisteredModel(model(c.id),'test',actor);
 const key='models.provider-test-'+randomUUID();
 await sql.begin(tx=>writeWorkflowModel(tx,key,m.id,actor));
 await assert.rejects(deleteRegisteredModel(m.id,m.version,'delete',actor),(e:unknown)=>
  e instanceof ProviderConfigError&&e.statusCode===409&&e.dependencies.some(d=>d.kind==='workflow'&&d.id===key));
 await assert.rejects(deleteConnection(c.id,c.version,'delete',actor),(e:unknown)=>
  e instanceof ProviderConfigError&&e.statusCode===409&&e.dependencies.some(d=>d.kind==='model'&&d.id===m.id)&&e.dependencies.some(d=>d.id===key));
 await sql.begin(tx=>writeWorkflowModel(tx,key,null,actor));
 assert.deepEqual(await deleteRegisteredModel(m.id,m.version,'delete',actor),{deleted:true});
 assert.deepEqual(await deleteConnection(c.id,c.version,'delete',actor),{deleted:true});
});

test('migration is repeatable, preserves source configurations and validates actual workflow targets',async()=>{
 process.env.NVIDIA_API_KEY='migration-test-key';
 const oldIds=['openai/gpt-oss-20b','nvidia/nemotron-3-super-120b-a12b'];
 for(const id of oldIds)await sql`INSERT INTO model_providers(vendor,model_id,adapter,endpoint,credential_env,capabilities,request_defaults,enabled,route_enabled)
  VALUES ('nvidia',${id},'chat','https://integrate.api.nvidia.com/v1/chat/completions','NVIDIA_API_KEY','["text"]'::jsonb,'{"temperature":0.7}'::jsonb,true,true)`;
 for(const [i,id] of oldIds.entries())await sql`INSERT INTO settings(key,value,updated_by)
  VALUES (${'models.migration-'+i},${sql.json({model:'nvidia:'+id})},${actor})`;
 // Old route switches are not probe evidence. Only a fresh successful exact
 // capability check may become legacy, and its original timestamp is preserved.
 const verifiedAt=new Date(Date.now()-10*60*1000);
 for(const id of oldIds)await sql`INSERT INTO model_provider_checks
  (vendor,model_id,capability,status,verified_at,latency_ms,detail)
  VALUES ('nvidia',${id},'text','verified',${verifiedAt},400,'prior verified probe')`;
 await sql`INSERT INTO model_provider_checks
  (vendor,model_id,capability,status,verified_at)
  VALUES ('nvidia',${oldIds[0]},'vision','failed',NULL)`;

 await sql`UPDATE model_providers SET timeout_ms=120000 WHERE model_id=${oldIds[1]!}`;
 await sql`INSERT INTO model_providers(vendor,model_id,adapter,endpoint,credential_env,enabled,route_enabled) VALUES ('nvidia','disabled-legacy','unconfigured','https://integrate.api.nvidia.com/v1/chat/completions','NVIDIA_API_KEY',false,false)`;
 // Preflight fails atomically when even a disabled legacy connection references
 // a runtime key not present in this environment. Never write partial mappings.
 delete process.env.PROVIDER_MIGRATION_MISSING_KEY;
 await sql`INSERT INTO model_providers(vendor,model_id,adapter,endpoint,credential_env,enabled,route_enabled)
  VALUES ('example','missing-key','unconfigured','https://example.com/v1','PROVIDER_MIGRATION_MISSING_KEY',false,false)`;
 await assert.rejects(migrateProviderConnections(),/Missing provider runtime credential: PROVIDER_MIGRATION_MISSING_KEY/);
 assert.equal((await sql`SELECT 1 FROM settings WHERE key='providerConnections.migration.v1'`).length,0);
 await sql`DELETE FROM model_providers WHERE vendor='example' AND model_id='missing-key'`;
 delete process.env.MODEL_PROVIDER_REGISTRY_ENABLED;
 const first=await migrateProviderConnections();
 assert.equal(first.createdModels,3);assert.equal(first.migratedReferences,0);
 assert.equal(first.activated,false);
 assert.equal(await normalizedRegistryActive(),false);
 assert.equal((await sql`SELECT 1 FROM settings WHERE key='providerConnections.activation.v1'`).length,0);
 process.env.MODEL_PROVIDER_REGISTRY_ENABLED='true';
 assert.equal(await normalizedRegistryActive(),false,'flag alone must not activate old data');
 const activated=await migrateProviderConnections({activate:true});
 assert.equal(activated.migratedReferences,2);
 assert.equal(await normalizedRegistryActive(),true);
 const original=oldIds.map(id=>migratedId('model',['nvidia',id]));
 for(const [i,id] of original.entries()) {
  const m=await getRegisteredModel(id);
  assert.equal(m.modelId,oldIds[i]);assert.equal(m.enabled,true);assert.equal(m.routeEnabled,true);
  assert.equal(await resolveLegacyModel('nvidia',oldIds[i]!),id);
  assert.equal(await resolveModelReference('nvidia:'+oldIds[i]),id);
  assert.equal(await resolveModelReference('model:'+id),id);
  assert.equal(await resolveModelReference(oldIds[i]!),null);
  assert.deepEqual(m.requestDefaults,{temperature:0.7});
  assert.deepEqual(m.routing.eligibleCapabilities,['text']);
  assert.equal(m.checks.find(c=>c.capability==='text')?.status,'legacy');
  assert.equal(m.checks.find(c=>c.capability==='text')?.verifiedAt,verifiedAt.toISOString());
  assert.notEqual(m.checks.find(c=>c.capability==='vision')?.status,'legacy');
  assert.equal(m.timeoutOverrideMs,i===0?60000:120000);
  const [setting]=await sql`SELECT value FROM settings WHERE key=${'models.migration-'+i}`;
  assert.equal(setting!.value.model,'model:'+id);
 }
 assert.equal((await getRegisteredModel(original[0]!)).providerId,(await getRegisteredModel(original[1]!)).providerId);
 assert.equal((await getRegisteredModel(migratedId('model',['nvidia','disabled-legacy']))).checks.some(x=>x.status==='legacy'),false);
 const edited=await getRegisteredModel(original[0]!);
 await sql`UPDATE registered_models SET notes='admin edit',version=version+1 WHERE id=${edited.id}::uuid`;
 const again=await migrateProviderConnections();
 assert.equal(again.createdModels,0);assert.equal(again.migratedReferences,0);
 assert.equal((await getRegisteredModel(edited.id)).notes,'admin edit');
 assert.equal(await resolveModelReference('nvidia-gpt-oss-20b'),original[0]);
 // Same number of bindings, wrong target: the migration must reject and roll back.
 await sql`UPDATE provider_workflow_models SET model_id=${original[1]!}::uuid WHERE setting_key='models.migration-0'`;
 await assert.rejects(migrateProviderConnections(),/binding disagrees/);
 await sql.begin(tx=>writeWorkflowModel(tx,'models.migration-0',null,actor));
 await sql`UPDATE registered_models SET enabled=false,route_enabled=false WHERE id=${original[0]!}::uuid`;
 const deleting=await getRegisteredModel(original[0]!);
 await deleteRegisteredModel(deleting.id,deleting.version,'remove migrated model',actor);
 await migrateProviderConnections();
 assert.equal((await sql`SELECT 1 FROM registered_models WHERE id=${original[0]!}::uuid`).length,0);
 assert.equal(await resolveLegacyModel('nvidia',oldIds[0]!),null);
 await assert.rejects(resolveModelReference('nvidia:'+oldIds[0]),/has been deleted/);
 await assert.rejects(resolveModelReference('nvidia-gpt-oss-20b'),/has been deleted/);
});
