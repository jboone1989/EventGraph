import {assertLegacyRegistryWritable} from './connections.ts';
import {sql} from "../../db.ts";
import {audit} from "../../audit.ts";
import {checkProviderChanges} from "./validation.ts";
import type {ProviderChanges,ProviderProfile} from "./types.ts";
import {isVerifiedFreeTrialProvider} from "./types.ts";
interface Row{vendor:string;model_id:string;adapter:ProviderProfile["adapter"];endpoint:string|null;credential_env:string;capabilities:ProviderProfile["capabilities"];request_defaults:Record<string,unknown>;probe_spec:ProviderProfile["probeSpec"];timeout_ms:number;stream:boolean;complexity:ProviderProfile["complexity"];documentation_url:string|null;notes:string|null;enabled:boolean;route_enabled:boolean;version:number;updated_at:Date}
function fromRow(r:Row):ProviderProfile{
 return {vendor:r.vendor,modelId:r.model_id,adapter:r.adapter,endpoint:r.endpoint,credentialEnv:r.credential_env,
  capabilities:r.capabilities,requestDefaults:r.request_defaults,probeSpec:r.probe_spec,timeoutMs:r.timeout_ms,stream:r.stream,
  complexity:r.complexity,documentationUrl:r.documentation_url,notes:r.notes,enabled:r.enabled,
  routeEnabled:r.route_enabled,version:r.version,updatedAt:r.updated_at.toISOString(),checks:[]};
}
export async function listProviders():Promise<ProviderProfile[]>{
 const [rows,checks]=await Promise.all([
  sql<Row[]> `SELECT * FROM model_providers ORDER BY vendor, model_id`,
  sql<{vendor:string;model_id:string;capability:string;status:string;verified_at:Date|null;latency_ms:number|null}[]> `SELECT vendor,model_id,capability,status,verified_at,latency_ms FROM model_provider_checks`,
 ]);
 const indexed=new Map(rows.map(x=>[x.vendor+":"+x.model_id,fromRow(x)]));
 for(const c of checks)indexed.get(c.vendor+":"+c.model_id)?.checks.push({capability:c.capability,status:c.status,verifiedAt:c.verified_at?.toISOString()??null,latencyMs:c.latency_ms});
 return [...indexed.values()];
}
export async function getProvider(vendor:string,id:string):Promise<ProviderProfile|null>{
 const rows=await sql<Row[]>`SELECT * FROM model_providers WHERE vendor=${vendor} AND model_id=${id}`;
 if(!rows[0])return null;
 const item=fromRow(rows[0]);
 const checks=await sql<{capability:string;status:string;verified_at:Date|null;latency_ms:number|null}[]> `SELECT capability,status,verified_at,latency_ms FROM model_provider_checks WHERE vendor=${vendor} AND model_id=${id}`;
 item.checks=checks.map(c=>({capability:c.capability,status:c.status,verifiedAt:c.verified_at?.toISOString()??null,latencyMs:c.latency_ms}));
 return item;
}
const fail=(message:string,code=400):never=>{throw Object.assign(new Error(message),{statusCode:code});};
export async function updateProvider(vendor:string,id:string,changes:ProviderChanges,version:number,reason:string,actor:string):Promise<ProviderProfile>{
 await assertLegacyRegistryWritable();
 if(!reason?.trim())fail("a reason is required");
 if(!Number.isInteger(version))fail("provider version required");
 const current=await getProvider(vendor,id);
 if(current===null)throw Object.assign(new Error("provider not found"),{statusCode:404});
 checkProviderChanges(changes,current);
 if((changes.enabled===true||changes.routeEnabled===true)&&!isVerifiedFreeTrialProvider(id))fail("Only officially confirmed NVIDIA free trial API models can be enabled");
 const next:ProviderProfile={...current,...changes};
 if(next.routeEnabled){
  if(!next.enabled||!next.endpoint||next.adapter==="special"||next.adapter==="unconfigured")fail("provider is not configured for routing");
  // Check results are backend-owned. Operators cannot promote a model without
  // the independent capability probe succeeding recently.
  if(!current.checks.some(c=>c.status==="verified"&&c.verifiedAt&&Date.now()-Date.parse(c.verifiedAt)<86400000))fail("a recent verified capability check is required for routing");
 }
 const rows=await sql<Row[]>`UPDATE model_providers SET
  adapter=${next.adapter},endpoint=${next.endpoint},capabilities=${sql.json(next.capabilities)},
  request_defaults=${sql.json(next.requestDefaults as never)},probe_spec=${next.probeSpec===null?null:sql.json(next.probeSpec as never)},timeout_ms=${next.timeoutMs},stream=${next.stream},
  complexity=${next.complexity},documentation_url=${next.documentationUrl},notes=${next.notes},
  enabled=${next.enabled},route_enabled=${next.routeEnabled},version=version+1,updated_at=now(),updated_by=${actor}
  WHERE vendor=${vendor} AND model_id=${id} AND version=${version} RETURNING *`;
 if(!rows[0])fail("provider config changed; refresh and retry",409);
 const result=fromRow(rows[0]);result.checks=current.checks;
 await audit(actor,"model.provider.update",vendor+":"+id,reason,current,result);
 return result;
}
export async function createProvider(vendor:string,id:string,actor:string):Promise<ProviderProfile>{
 await assertLegacyRegistryWritable();
 if(vendor!=="nvidia"||!/^[-\w.]+\/[-\w.]+$/i.test(id))fail("invalid NVIDIA model ID");
 if(!isVerifiedFreeTrialProvider(id))fail("Only NVIDIA officially verified free trial API models may be added");
 await sql`INSERT INTO model_providers(vendor,model_id,adapter,credential_env,capabilities,enabled,route_enabled,updated_by)
 VALUES (${vendor},${id},'unconfigured','NVIDIA_API_KEY','[]'::jsonb,false,false,${actor}) ON CONFLICT DO NOTHING`;
 const result=await getProvider(vendor,id);
 if(result===null)throw Object.assign(new Error("cannot create provider"),{statusCode:500});
 await audit(actor,"model.provider.create",vendor+":"+id,"new provider",null,result);
 return result;
}

/** Hard delete is explicit, version-checked, audited and allowed only for inactive providers.
 * Capability checks cascade; neither credential values nor inference receipts are deleted.
 */
export async function deleteProvider(vendor:string,id:string,version:number,reason:string,actor:string):Promise<{deleted:boolean}>{
 await assertLegacyRegistryWritable();
 if(!reason?.trim())fail("a reason is required");
 if(!Number.isInteger(version))fail("provider version required");
 const current=await getProvider(vendor,id);
 if(current===null)throw Object.assign(new Error("provider not found"),{statusCode:404});
 if(current.enabled||current.routeEnabled)fail("disable the provider and its route before deletion",409);
 const removed=await sql<{model_id:string}[]>`DELETE FROM model_providers
  WHERE vendor=${vendor} AND model_id=${id} AND version=${version}
   AND enabled=false AND route_enabled=false RETURNING model_id`;
 if(!removed.length)fail("provider changed or is still enabled; refresh and retry",409);
 await audit(actor,"model.provider.delete",vendor+":"+id,reason,current,null);
 return {deleted:true};
}
