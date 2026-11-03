import "./setup.ts";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,test} from "node:test";
import {closeDb,sql} from "@aihot/backend/db";
import {modelBindingsOverview,switchModel} from "@aihot/backend/admin/models";
import {listRegisteredModels} from "@aihot/backend/providers/registry/connections";

after(closeDb);
test("workflow choices match registered inventory and server rejects unroutable models",async()=>{
 const connectionId=randomUUID(),modelId=randomUUID();
 await sql`INSERT INTO provider_connections
  (id,name,vendor,protocol,base_url,timeout_ms,enabled,policy,updated_by)
  VALUES (${connectionId}::uuid,'Binding inventory test','custom','openai-compatible',
   'https://model.example.org/v1',60000,true,'none','test')`;
 await sql`INSERT INTO registered_models
  (id,provider_id,model_id,adapter,capabilities,enabled,route_enabled,updated_by)
  VALUES (${modelId}::uuid,${connectionId}::uuid,'binding-inventory-test','chat',
   '["text"]'::jsonb,false,false,'test')`;
 const overview=await modelBindingsOverview();
 const registered=await listRegisteredModels();
 assert.deepEqual(
  new Set(overview.choices.map(c=>c.key)),
  new Set(registered.map(m=>'model:'+m.id)),
  'binding page cannot offer hardcoded presets not present in model management');
 const item=overview.choices.find(c=>c.key==='model:'+modelId)!;
 assert.equal(item.textReady,false);
 assert.ok(item.reasons.some(reason=>/disabled|Routing switch|test/i.test(reason)));
 await assert.rejects(
  switchModel('prefilter','model:'+modelId,'should not bind disabled model','test'),
  /Model is not eligible/);
});
