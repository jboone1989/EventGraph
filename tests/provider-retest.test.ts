import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {sql,closeDb} from '@aihot/backend/db';
import {config} from '@aihot/backend/config';
import {createConnection,createRegisteredModel,loadConnection,loadModel,configurationFingerprint,configurationSnapshot} from '@aihot/backend/providers/registry/connections';
import {retestExpiringModels} from '@aihot/backend/providers/registry/retest';
import type {ConnectionInput,ModelInput} from '@aihot/contracts/providers';
const {MockAgent,getGlobalDispatcher,setGlobalDispatcher}=createRequire(new URL('../packages/backend/package.json',import.meta.url))('undici') as typeof import('undici');
const prior={dispatcher:getGlobalDispatcher(),private:config.allowPrivateNetworkFetch,proxy:config.egressProxyUrl,calls:config.modelCallsEnabled,
 registry:process.env.MODEL_PROVIDER_REGISTRY_ENABLED,env:process.env.MODEL_CALLS_ENABLED};
const network=new MockAgent();network.disableNetConnect();setGlobalDispatcher(network);
config.allowPrivateNetworkFetch=true;config.egressProxyUrl=null;config.modelCallsEnabled=true;
process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('base64');
const on=()=>{process.env.MODEL_PROVIDER_REGISTRY_ENABLED='true';process.env.MODEL_CALLS_ENABLED='true';};
after(async()=>{setGlobalDispatcher(prior.dispatcher);config.allowPrivateNetworkFetch=prior.private;config.egressProxyUrl=prior.proxy;config.modelCallsEnabled=prior.calls;
 for(const [k,v] of [['MODEL_PROVIDER_REGISTRY_ENABLED',prior.registry],['MODEL_CALLS_ENABLED',prior.env]] as const)v===undefined?delete process.env[k]:process.env[k]=v;
 await network.close();await closeDb();});
const connection=():ConnectionInput=>({name:'Retest',vendor:'example',protocol:'openai-compatible',baseUrl:'https://retest.invalid/v1',timeoutMs:60000,enabled:true,credential:{action:'replace',value:'key-'+randomUUID()}});
const model=(providerId:string,extra:Partial<ModelInput>={}):ModelInput=>({providerId,modelId:'m-'+randomUUID(),adapter:'chat',endpointOverride:null,capabilities:['text'],requestDefaults:{},probeSpec:{capability:'text',body:{messages:[{role:'user',content:'OK'}]},response:'chat'},stream:false,complexity:'medium',documentationUrl:null,notes:null,enabled:true,routeEnabled:true,...extra});
const HOUR=3600000;
async function seed(ageHours:number|null,extra:Partial<ModelInput>={},status='verified') {
 const c=await createConnection(connection(),'test','test');
 const m=await createRegisteredModel(model(c.id,{...extra,routeEnabled:false}),'test','test');
 if(ageHours!==null) {
  const row=await loadModel(m.id),conn=await loadConnection(row.provider_id);
  await sql`INSERT INTO registered_model_checks(model_id,capability,config_fingerprint,config_snapshot,status,verified_at)
   VALUES (${m.id}::uuid,'text',${configurationFingerprint(conn,row)},${sql.json(configurationSnapshot(conn,row))},${status},${new Date(Date.now()-ageHours*HOUR)})`;
 }
 if(extra.routeEnabled!==false&&ageHours!==null&&status==='verified')
  await sql`UPDATE registered_models SET route_enabled=true WHERE id=${m.id}::uuid`;
 return m.id;
}
const reply=()=>network.get('https://retest.invalid').intercept({path:'/v1/chat/completions',method:'POST'}).reply(200,{choices:[{message:{content:'OK'}}]});
const cleanup=()=>sql`UPDATE registered_models SET route_enabled=false WHERE route_enabled`;
const verifiedAt=async(id:string)=>(await sql<{verified_at:Date}[]>`SELECT verified_at FROM registered_model_checks WHERE model_id=${id}::uuid`)[0]!.verified_at.getTime();

test('disabled by default or with either flag off: no model call and no audit',async()=>{
 await cleanup();await seed(23);
 for(const [r,c] of [[undefined,undefined],['true',undefined],[undefined,'true'],['true','false']] as const) {
  r===undefined?delete process.env.MODEL_PROVIDER_REGISTRY_ENABLED:process.env.MODEL_PROVIDER_REGISTRY_ENABLED=r;
  c===undefined?delete process.env.MODEL_CALLS_ENABLED:process.env.MODEL_CALLS_ENABLED=c;
  assert.equal((await retestExpiringModels()).state,'disabled');
 }
 network.assertNoPendingInterceptors();
});
test('selects only enabled, routed, previously successful single capabilities near or just past 24 h',async()=>{
 await cleanup();on();
 const near=await seed(23),past=await seed(26),fresh=await seed(10),dead=await seed(40),never=await seed(null),
  failed=await seed(23,{},'failed'),unrouted=await seed(23,{routeEnabled:false}),
  mismatch=await seed(23,{probeSpec:{capability:'vision',body:{messages:[{role:'user',content:[{type:'image_url',image_url:{url:'https://example.invalid/sample.png'}}]}]},response:'chat'},capabilities:['text','vision']});
 reply();reply();
 const out=await retestExpiringModels();
 assert.deepEqual([out.state,out.tested,out.failed],['ran',2,0]);
 network.assertNoPendingInterceptors();
 assert.ok(await verifiedAt(near)>Date.now()-HOUR&&await verifiedAt(past)>Date.now()-HOUR);
 assert.ok(await verifiedAt(fresh)<Date.now()-9*HOUR);
 assert.ok(await verifiedAt(dead)<Date.now()-39*HOUR);
 assert.equal((await sql`SELECT 1 FROM registered_model_checks WHERE model_id=${never}::uuid`).length,0);
 for(const id of [failed,unrouted,mismatch])assert.ok(await verifiedAt(id)<Date.now()-22*HOUR);
 const audits=await sql`SELECT action FROM audit_log WHERE actor='system:provider-retest' AND subject IN (${near},${past})`;
 assert.equal(audits.length,2);
});
test('changed configuration is not retested; repeat and concurrent runs spend once; batch is capped',async()=>{
 await cleanup();on();
 const changed=await seed(23);
 // Simulate an upstream configuration edit made after the last successful probe.
 await sql`UPDATE registered_models SET model_id='renamed',version=version+1 WHERE id=${changed}::uuid`;
 const ids=[];for(let i=0;i<5;i++)ids.push(await seed(23));
 // A second worker may start before the first releases its advisory lock
 // (returns locked) or just afterwards (processes the remaining models).
 // Both outcomes are valid; no model may be probed twice in either case.
 for(let i=0;i<5;i++)reply();
 const [a,b]=await Promise.all([retestExpiringModels(),retestExpiringModels()]);
 assert.ok(a.tested<=3&&b.tested<=3,'each batch must remain bounded');
 assert.ok(a.tested+b.tested>=3&&a.tested+b.tested<=5);
 const remaining=5-a.tested-b.tested;
 const second=await retestExpiringModels();
 assert.equal(second.tested,remaining);
 const third=await retestExpiringModels();
 assert.equal(third.tested,0);
 network.assertNoPendingInterceptors();
 assert.ok(await verifiedAt(changed)<Date.now()-22*HOUR);
});
test('a failing provider does not stop the batch and its failure is audited',async()=>{
 await cleanup();on();
 const bad=await seed(23),good=await seed(23.5);
 network.get('https://retest.invalid').intercept({path:'/v1/chat/completions',method:'POST'}).reply(401,{});
 reply();
 const out=await retestExpiringModels();
 assert.equal(out.tested+out.failed,2);
 assert.equal(out.failed,1);
 assert.equal((await sql`SELECT status FROM registered_model_checks WHERE model_id=${bad}::uuid`)[0]!.status==='verified'
  ||(await sql`SELECT status FROM registered_model_checks WHERE model_id=${good}::uuid`)[0]!.status==='verified',true);
 assert.ok((await sql`SELECT 1 FROM audit_log WHERE action='provider.model.retest.run'`).length>=1);
});
