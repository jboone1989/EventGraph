import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {sql,closeDb} from '@aihot/backend/db';
import {VERIFIED_FREE_TRIAL_ENDPOINTS} from '@aihot/backend/providers/registry/types';
import {importNvidiaModels} from '../scripts/import-nvidia-registered-models.ts';
import {migratedId} from '../scripts/migrate-provider-connections.ts';

after(closeDb);
const BOOTSTRAP='nvidia.registeredModelsBootstrap.v1';
const FREE_ONLY='nvidia.registeredModelsFreeOnly.v2';
const CID=migratedId('connection',['nvidia','https://integrate.api.nvidia.com/v1','NVIDIA_API_KEY']);
const free=Object.keys(VERIFIED_FREE_TRIAL_ENDPOINTS);

test('initial NVIDIA import includes only official Free Endpoint candidates and keeps operator rows',async()=>{
 const oldMode=process.env.EVENTGRAPH_PREVIEW_MODE;
 const manualId=migratedId('model',['nvidia','01-ai/yi-large']);
 try{
  await assert.rejects(importNvidiaModels(),/requires the VM13 preview environment/);
  process.env.EVENTGRAPH_PREVIEW_MODE='true';
  await sql`DELETE FROM settings WHERE key IN (${BOOTSTRAP},${FREE_ONLY})`;
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
  assert.equal(result.summary.catalogue,81);
  assert.equal(result.summary.total,15);
  assert.equal(free.length,15);
  const models=await sql<{model_id:string;notes:string|null;updated_by:string}[]>`
   SELECT model_id,notes,updated_by FROM registered_models WHERE provider_id=${CID}::uuid`;
  assert.ok(models.length>=16);
  assert.ok(free.every(id=>models.some(m=>m.model_id===id)));
  assert.equal(models.find(x=>x.model_id==='01-ai/yi-large')?.notes,'my custom notes');
  assert.equal(models.some(x=>x.model_id==='ibm/granite-3.0-3b-a800m-instruct'),false);
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
  assert.ok(correction.summary.deleted>=1);
  assert.ok(correction.summary.preservedNonFree>=1);
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
