import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {sql,closeDb} from '@aihot/backend/db';
import {importNvidiaModels} from '../scripts/import-nvidia-registered-models.ts';
import {migratedId} from '../scripts/migrate-provider-connections.ts';

after(closeDb);

test('one-time NVIDIA import preserves existing model edits, original adapters and tests',async()=>{
 const oldMode=process.env.EVENTGRAPH_PREVIEW_MODE;
 const connectionId=migratedId('connection',['nvidia','https://integrate.api.nvidia.com/v1','NVIDIA_API_KEY']);
 const retainedId=migratedId('model',['nvidia','01-ai/yi-large']);
 try {
  await assert.rejects(importNvidiaModels(),/requires the VM13 preview environment/);
  process.env.EVENTGRAPH_PREVIEW_MODE='true';
  await sql`DELETE FROM settings WHERE key='nvidia.registeredModelsBootstrap.v1'`;
  await sql`INSERT INTO provider_connections
   (id,name,vendor,protocol,base_url,timeout_ms,enabled,policy,credential_env,updated_by)
   VALUES (${connectionId}::uuid,'NVIDIA','nvidia','openai-compatible',
     'https://integrate.api.nvidia.com/v1',60000,true,'nvidia-free-trial','NVIDIA_API_KEY','test')
   ON CONFLICT(id) DO NOTHING`;
  await sql`INSERT INTO registered_models
   (id,provider_id,model_id,adapter,capabilities,request_defaults,notes,updated_by)
   VALUES (${retainedId}::uuid,${connectionId}::uuid,'01-ai/yi-large','chat','["text"]'::jsonb,
    '{}'::jsonb,'my custom notes','test')
   ON CONFLICT DO NOTHING`;
  const imported=await importNvidiaModels();
  assert.equal(imported.status,'imported');
  assert.equal(imported.summary.catalogue,81);
  assert.ok(imported.summary.total>=81);
  assert.ok(imported.summary.preserved>=1);

  const models=await sql<{model_id:string;adapter:string;notes:string|null;enabled:boolean;route_enabled:boolean;probe_spec:unknown}[]>`
   SELECT m.model_id,m.adapter,m.notes,m.enabled,m.route_enabled,m.probe_spec
   FROM registered_models m JOIN provider_connections c ON c.id=m.provider_id
   WHERE c.vendor='nvidia'`;
  assert.ok(models.length>=81);
  assert.equal(new Set(models.map(x=>x.model_id)).size,models.length);
  const preserved=models.find(x=>x.model_id==='01-ai/yi-large');
  assert.equal(preserved?.notes,'my custom notes');
  assert.ok(models.some(x=>x.adapter==='embedding'));
  assert.ok(models.some(x=>x.adapter==='safety'));
  assert.ok(models.some(x=>x.adapter==='unconfigured'));
  const afterFirst=models.length;
  const repeated=await importNvidiaModels();
  assert.equal(repeated.status,'already-imported');
  const [count]=await sql<{count:number}[]>`
   SELECT count(*)::integer AS count FROM registered_models m
   JOIN provider_connections c ON c.id=m.provider_id WHERE c.vendor='nvidia'`;
  assert.equal(count?.count,afterFirst,'idempotent execution must not create duplicates');
 }finally{
  if(oldMode===undefined)delete process.env.EVENTGRAPH_PREVIEW_MODE;
  else process.env.EVENTGRAPH_PREVIEW_MODE=oldMode;
 }
});
