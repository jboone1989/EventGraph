import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {sql,closeDb} from '@aihot/backend/db';
import {VERIFIED_FREE_TRIAL_ENDPOINTS} from '@aihot/backend/providers/registry/types';
import {importNvidiaModels} from '../scripts/import-nvidia-registered-models.ts';
import {migratedId} from '../scripts/migrate-provider-connections.ts';

after(closeDb);
const BOOTSTRAP='nvidia.registeredModelsBootstrap.v1';
const FREE_ONLY='nvidia.registeredModelsFreeOnly.v2';
const SMOKE='nvidia.officialSmokeProbes.v1';
const CID=migratedId('connection',['nvidia','https://integrate.api.nvidia.com/v1','NVIDIA_API_KEY']);
const free=Object.keys(VERIFIED_FREE_TRIAL_ENDPOINTS);

test('initial NVIDIA import includes only official Free Endpoint candidates and keeps operator rows',async()=>{
 const oldMode=process.env.EVENTGRAPH_PREVIEW_MODE;
 const manualId=migratedId('model',['nvidia','01-ai/yi-large']);
 try{
  await assert.rejects(importNvidiaModels(),/requires the VM13 preview environment/);
  process.env.EVENTGRAPH_PREVIEW_MODE='true';
  await sql`DELETE FROM settings WHERE key IN (${BOOTSTRAP},${FREE_ONLY},${SMOKE})`;
  await sql`INSERT INTO provider_connections
   (id,name,vendor,protocol,base_url,timeout_ms,enabled,policy,credential_env,updated_by)
   VALUES (${CID}::uuid,'NVIDIA','nvidia','openai-compatible',
    'https://integrate.api.nvidia.com/v1',60000,true,'nvidia-free-trial','NVIDIA_API_KEY','test')
   ON CONFLICT(id) DO NOTHING`;
  await sql`INSERT INTO registered_models
   (id,provider_id,model_id,adapter,capabilities,request_defaults,notes,updated_by)
   VALUES (${manualId}::uuid,${CID}::uuid,'01-ai/yi-large','chat','["text"]'::jsonb,
    '{}'::jsonb,'my custom notes','operator')
   ON CONFLICT DO NOTHING`;
  const result=await importNvidiaModels();
  assert.equal(result.status,'imported');
  assert.equal((result.summary as {catalogue:number}).catalogue,81);
  assert.equal((result.summary as {total:number}).total,15);
  assert.equal(free.length,15);
  const models=await sql<{model_id:string;notes:string|null;updated_by:string}[]>`
   SELECT model_id,notes,updated_by FROM registered_models WHERE provider_id=${CID}::uuid`;
  assert.ok(models.length>=16);
  assert.ok(free.every(id=>models.some(m=>m.model_id===id)));
  assert.equal(models.find(x=>x.model_id==='01-ai/yi-large')?.notes,'my custom notes');
  assert.equal(models.some(x=>x.model_id==='ibm/granite-3.0-3b-a800m-instruct'),false);
  const [step]=await sql<{adapter:string;probe_spec:{body:{max_tokens:number}};timeout_override_ms:number}[]>`
   SELECT adapter,probe_spec,timeout_override_ms FROM registered_models
   WHERE provider_id=${CID}::uuid AND model_id='stepfun-ai/step-5-preview'`;
  assert.equal(step?.adapter,'chat');
  assert.equal(step?.probe_spec?.body.max_tokens,4096);
  assert.equal(step?.timeout_override_ms,180000);
  const [gpt]=await sql<{timeout_override_ms:number}[]>`
   SELECT timeout_override_ms FROM registered_models WHERE provider_id=${CID}::uuid AND model_id='openai/gpt-oss-20b'`;
  assert.equal(gpt?.timeout_override_ms,120000);

  const again=await importNvidiaModels();
  assert.equal(again.status,'already-reconciled');
 }finally{
  if(oldMode===undefined)delete process.env.EVENTGRAPH_PREVIEW_MODE;
  else process.env.EVENTGRAPH_PREVIEW_MODE=oldMode;
 }
});

test('correction deletes untouched invalid seed entries, preserving edited and linked records',async()=>{
 const oldMode=process.env.EVENTGRAPH_PREVIEW_MODE;
 const invalid='ibm/granite-3.0-3b-a800m-instruct';
 const edited='ibm/granite-3.0-8b-instruct';
 const legacy=migratedId('model',['nvidia',invalid]);
 const retained=migratedId('model',['nvidia',edited]);
 try{
  process.env.EVENTGRAPH_PREVIEW_MODE='true';
  // Simulate the earlier 81-row bootstrap while leaving its recorded source marker.
  await sql`DELETE FROM settings WHERE key=${FREE_ONLY}`;
  for(const [id,name,version,actor] of [[legacy,invalid,1,'nvidia-model-import'],[retained,edited,2,'operator']] as const){
   await sql`INSERT INTO registered_models
    (id,provider_id,model_id,adapter,capabilities,request_defaults,upstream_metadata,version,updated_by)
    VALUES (${id}::uuid,${CID}::uuid,${name},'chat','["text"]'::jsonb,'{}'::jsonb,
      '{"source":"seed-catalogue"}'::jsonb,${version},${actor})
    ON CONFLICT DO NOTHING`;
  }
  const correction=await importNvidiaModels();
  assert.equal(correction.status,'reconciled');
  assert.ok((correction.summary as {deleted:number}).deleted>=1);
  assert.ok((correction.summary as {preservedNonFree:number}).preservedNonFree>=1);
  const rows=await sql<{model_id:string}[]>`SELECT model_id FROM registered_models WHERE id IN (${legacy}::uuid,${retained}::uuid)`;
  assert.equal(rows.some(x=>x.model_id===invalid),false);
  assert.equal(rows.some(x=>x.model_id===edited),true);
  const again=await importNvidiaModels();
  assert.equal(again.status,'already-reconciled');
 }finally{
  if(oldMode===undefined)delete process.env.EVENTGRAPH_PREVIEW_MODE;
  else process.env.EVENTGRAPH_PREVIEW_MODE=oldMode;
 }
});

test('official smoke sync updates untouched bootstrap configurations and preserves operator edits',async()=>{
 const oldMode=process.env.EVENTGRAPH_PREVIEW_MODE;
 try{
  process.env.EVENTGRAPH_PREVIEW_MODE='true';
  await sql`DELETE FROM settings WHERE key=${SMOKE}`;
  await sql`UPDATE registered_models SET probe_spec='{"capability":"text","body":{"messages":[{"role":"user","content":"old"}],"max_tokens":384},"response":"chat"}'::jsonb,
   version=1,updated_by='nvidia-model-import'
   WHERE provider_id=${CID}::uuid AND model_id='nvidia/nemotron-3.5-super-vl-120b-a12b'`;
  await sql`UPDATE registered_models SET adapter='unconfigured',capabilities='[]'::jsonb,probe_spec=NULL,
   timeout_override_ms=60000,version=1,updated_by='nvidia-model-import'
   WHERE provider_id=${CID}::uuid AND model_id='stepfun-ai/step-5-preview'`;
  await sql`UPDATE registered_models SET timeout_override_ms=60000,version=2,updated_by='operator'
   WHERE provider_id=${CID}::uuid AND model_id='openai/gpt-oss-20b'`;
  const res=await importNvidiaModels();
  assert.equal(res.status,'already-reconciled');
  const smoke='smoke' in res?res.smoke:null;
  assert.ok(smoke);
  assert.equal(smoke.status,'synced');
  assert.equal((smoke.summary as {updated:number}).updated,2);
  const changed=await sql<{model_id:string;adapter:string;probe_spec:{body:{max_tokens:number;reasoning_effort?:string}};timeout_override_ms:number;version:number}[]>`
   SELECT model_id,adapter,probe_spec,timeout_override_ms,version FROM registered_models
   WHERE provider_id=${CID}::uuid AND model_id IN
    ('nvidia/nemotron-3.5-super-vl-120b-a12b','stepfun-ai/step-5-preview','openai/gpt-oss-20b')`;
  const byId=new Map(changed.map(x=>[x.model_id,x]));
  assert.equal(byId.get('nvidia/nemotron-3.5-super-vl-120b-a12b')?.probe_spec.body.reasoning_effort,'none');
  assert.equal(byId.get('nvidia/nemotron-3.5-super-vl-120b-a12b')?.probe_spec.body.max_tokens,1024);
  assert.equal(byId.get('stepfun-ai/step-5-preview')?.adapter,'chat');
  assert.equal(byId.get('stepfun-ai/step-5-preview')?.probe_spec.body.max_tokens,4096);
  assert.equal(byId.get('openai/gpt-oss-20b')?.timeout_override_ms,60000);
  assert.equal(byId.get('openai/gpt-oss-20b')?.version,2);
  const repeat=await importNvidiaModels();
  const repeatSmoke='smoke' in repeat?repeat.smoke:null;
  assert.ok(repeatSmoke);
  assert.equal(repeatSmoke.status,'already-synced');
 }finally{
  if(oldMode===undefined)delete process.env.EVENTGRAPH_PREVIEW_MODE;
  else process.env.EVENTGRAPH_PREVIEW_MODE=oldMode;
 }
});
