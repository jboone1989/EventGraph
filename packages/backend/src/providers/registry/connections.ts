import {createHash,randomUUID} from 'node:crypto';
import {PRESETS} from '@aihot/site/models';
import {sql,type Db,type Tx} from '../../db.ts';
import {audit} from '../../audit.ts';
import {checkConnection,checkModel,connectionPolicy,checkConnectionPolicy} from './connection-validation.ts';
import {encryptCredential,storedCredential,credentialDigest} from './connection-secrets.ts';
import {ProviderConfigError,type ConnectionInput,type ProviderConnection,type RegisteredModel,type ModelInput,type Dependency} from './connection-types.ts';

export interface ConnectionRow {
 id:string;name:string;vendor:string;protocol:ProviderConnection['protocol'];base_url:string;
 timeout_ms:number;enabled:boolean;policy:ProviderConnection['policy'];credential_env:string|null;
 credential_secret:string|null;credential_version:number;version:number;updated_at:Date;
}
export interface ModelRow {
 id:string;provider_id:string;model_id:string;adapter:RegisteredModel['adapter'];endpoint_override:string|null;timeout_override_ms:number|null;
 capabilities:RegisteredModel['capabilities'];request_defaults:Record<string,unknown>;probe_spec:RegisteredModel['probeSpec'];
 stream:boolean;complexity:RegisteredModel['complexity'];documentation_url:string|null;notes:string|null;
 enabled:boolean;route_enabled:boolean;upstream_metadata:Record<string,unknown>;version:number;updated_at:Date;
}
export type CheckRow={model_id:string;capability:string;config_fingerprint:string;config_snapshot?:Record<string,string>|null;status:string;verified_at:Date|null;latency_ms:number|null};
const missing=(kind:string):never=>{throw new ProviderConfigError(`${kind} not found`,undefined,404);};
function uuid(value:unknown,field:string):asserts value is string {
 if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))
  throw new ProviderConfigError('Enter a valid UUID',field);
}
function versionCheck(current:number,expected:number):void {
 if(!Number.isInteger(expected))throw new ProviderConfigError('Version is required','version');
 if(current!==expected)throw new ProviderConfigError('Configuration changed; refresh and retry','version',409);
}
function reasonCheck(reason:string):void {
 if(typeof reason!=='string'||!reason.trim()||reason.length>1500)throw new ProviderConfigError('Enter a reason (maximum 1500 characters)','reason');
}
export function connectionView(r:ConnectionRow):ProviderConnection {
 // This explicit projection is shared by responses and audit records. No secret or environment name escapes.
 const configured=!!r.credential_secret||!!storedCredential(r);
 return {id:r.id,name:r.name,vendor:r.vendor,protocol:r.protocol,baseUrl:r.base_url,timeoutMs:r.timeout_ms,
  enabled:r.enabled,policy:r.policy,credential:{configured},version:r.version,updatedAt:r.updated_at.toISOString()};
}
export function modelInput(r:ModelRow):ModelInput {
 return {providerId:r.provider_id,modelId:r.model_id,adapter:r.adapter,endpointOverride:r.endpoint_override,timeoutOverrideMs:r.timeout_override_ms??null,
  capabilities:r.capabilities,requestDefaults:r.request_defaults,probeSpec:r.probe_spec,stream:r.stream,
  complexity:r.complexity,documentationUrl:r.documentation_url,notes:r.notes,enabled:r.enabled,routeEnabled:r.route_enabled};
}
function canonical(value:unknown):unknown {
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return value;
}
export function configurationSnapshot(c:ConnectionRow,m:ModelRow):Record<string,string> {
 const {documentationUrl:_,notes:__,enabled:___,routeEnabled:____,...relevant}=modelInput(m);
 const fields={protocol:c.protocol,address:c.base_url,timeout:m.timeout_override_ms??c.timeout_ms,policy:c.policy,
  credential:[c.credential_version,credentialDigest(storedCredential(c))],model:relevant};
 return Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')]));
}
export function configurationFingerprint(c:ConnectionRow,m:ModelRow):string {
 return createHash('sha256').update(JSON.stringify(configurationSnapshot(c,m))).digest('hex');
}
export function routingState(r:ModelRow,c:ConnectionRow,checks:CheckRow[]=[],now=Date.now()):RegisteredModel['routing'] {
 const reasons:string[]=[];
 if(!c.enabled)reasons.push('Connection is disabled');
 if(!r.enabled)reasons.push('Model is disabled');
 if(!r.route_enabled)reasons.push('Routing switch is off');
 if(!['chat','embedding','document','safety'].includes(r.adapter))reasons.push('Adapter is not configured');
 let fingerprint='',snapshot:Record<string,string>={};
 try {if(!storedCredential(c))reasons.push('Credential is missing');snapshot=configurationSnapshot(c,r);fingerprint=configurationFingerprint(c,r);}
 catch {reasons.push('Credential cannot be read');}
 try{checkConnectionPolicy(c.base_url,c.policy);checkModel(modelInput(r),connectionView(c));}catch{reasons.push('Configuration violates endpoint or model policy');}
 const own=checks.filter(x=>x.model_id===r.id);
 const eligible=own.filter(x=>x.config_fingerprint===fingerprint&&
  (x.status==='legacy'||x.status==='verified')&&x.verified_at&&
  now>=x.verified_at.getTime()&&now-x.verified_at.getTime()<86400000&&r.capabilities.includes(x.capability as never)).map(x=>x.capability);
 if(!eligible.length) {
  const mismatched=own.find(x=>x.config_fingerprint!==fingerprint);
  const changed=mismatched?.config_snapshot?Object.keys(snapshot).filter(k=>snapshot[k]!==mismatched.config_snapshot![k]):[];
  reasons.push(mismatched?'Configuration changed'+(changed.length?': '+changed.join(', '):' since its last test')+'; retest required':'No current successful capability test; retest required');
 }
 return {eligibleCapabilities:reasons.length?[]:eligible,reasons};
}
export function modelView(r:ModelRow,c:ConnectionRow,checks:CheckRow[]=[]):RegisteredModel {
 let fingerprint:string|null=null;
 try{fingerprint=configurationFingerprint(c,r);}catch{ /* unreadable credentials invalidate checks */ }
 return {...modelInput(r),timeoutOverrideMs:r.timeout_override_ms??null,id:r.id,upstreamMetadata:r.upstream_metadata,version:r.version,updatedAt:r.updated_at.toISOString(),
  routing:routingState(r,c,checks),
  checks:checks.filter(x=>x.model_id===r.id).map(x=>({capability:x.capability,
   status:x.config_fingerprint===fingerprint?x.status:'unverified',
   verifiedAt:x.config_fingerprint===fingerprint?x.verified_at?.toISOString()??null:null,latencyMs:x.latency_ms}))};
}
export async function loadConnection(id:string,db:Db=sql):Promise<ConnectionRow> {
 uuid(id,'providerId');
 const [row]=await db<ConnectionRow[]>`SELECT * FROM provider_connections WHERE id=${id}::uuid`;
 return row??missing('Connection');
}
export async function loadModel(id:string,db:Db=sql):Promise<ModelRow> {
 uuid(id,'id');
 const [row]=await db<ModelRow[]>`SELECT * FROM registered_models WHERE id=${id}::uuid`;
 return row??missing('Model');
}
export async function listConnections():Promise<ProviderConnection[]> {
 return (await sql<ConnectionRow[]>`SELECT * FROM provider_connections ORDER BY name,id`).map(connectionView);
}
export async function listRegisteredModels():Promise<RegisteredModel[]> {
 const [models,connections,checks]=await Promise.all([
  sql<ModelRow[]>`SELECT * FROM registered_models ORDER BY provider_id,model_id`,
  sql<ConnectionRow[]>`SELECT * FROM provider_connections`,
  sql<CheckRow[]>`SELECT * FROM registered_model_checks`,
 ]);
 const byId=new Map(connections.map(c=>[c.id,c]));
 return models.map(m=>modelView(m,byId.get(m.provider_id)!,checks));
}
export async function getRegisteredModel(id:string,db:Db=sql):Promise<RegisteredModel> {
 const m=await loadModel(id,db),c=await loadConnection(m.provider_id,db);
 return modelView(m,c,await db<CheckRow[]>`SELECT * FROM registered_model_checks WHERE model_id=${id}::uuid`);
}
export async function resolveLegacyModel(vendor:string,modelId:string,db:Db=sql):Promise<string|null> {
 const [alias]=await db<{registered_model_id:string}[]>`SELECT registered_model_id FROM provider_model_aliases
  WHERE vendor=${vendor} AND model_id=${modelId}`;
 return alias?.registered_model_id??null;
}
/** Resolve supported legacy references explicitly; never search by upstream model ID alone. */
export async function resolveModelReference(reference:string,db:Db=sql):Promise<string|null> {
 if(typeof reference!=='string')throw new ProviderConfigError('Model reference must be a string','model');
 if(reference.startsWith('model:')) {
  const id=reference.slice(6);return (await loadModel(id,db)).id;
 }
 const preset=PRESETS[reference],delimiter=reference.indexOf(':');
 const identity=preset?{vendor:preset.service,modelId:preset.model}:delimiter>0?{vendor:reference.slice(0,delimiter),modelId:reference.slice(delimiter+1)}:null;
 if(!identity)return null;
 const id=await resolveLegacyModel(identity.vendor,identity.modelId,db);
 if(id)return id;
 const [completed]=await db`SELECT value FROM settings WHERE key='providerConnections.migration.v1'`;
 if(completed?.value.sourceMappings?.some((s:{vendor:string;modelId:string})=>s.vendor===identity.vendor&&s.modelId===identity.modelId))
  throw new ProviderConfigError('This migrated model has been deleted; select another model','model',404);
 return null;
}
function changedCredential(input:ConnectionInput,old?:ConnectionRow):Pick<ConnectionRow,'credential_secret'|'credential_env'|'credential_version'> {
 const edit=input.credential??{action:'keep'};
 if(edit.action==='keep')return {credential_secret:old?.credential_secret??null,credential_env:old?.credential_env??null,credential_version:old?.credential_version??1};
 return {credential_secret:edit.action==='replace'?encryptCredential(edit.value):null,credential_env:null,
  credential_version:(old?.credential_version??0)+1};
}
export async function createConnection(input:ConnectionInput,reason:string,actor:string):Promise<ProviderConnection> {
 reasonCheck(reason);checkConnection(input);
 checkConnectionPolicy(input.baseUrl,connectionPolicy(input.baseUrl));
 const key=changedCredential(input);
 return sql.begin(async tx=>{
  const [row]=await tx<ConnectionRow[]>`INSERT INTO provider_connections
   (id,name,vendor,protocol,base_url,timeout_ms,enabled,policy,credential_secret,credential_env,credential_version,updated_by)
   VALUES (${randomUUID()}::uuid,${input.name.trim()},${input.vendor.trim()},${input.protocol},${input.baseUrl},
    ${input.timeoutMs},${input.enabled},${connectionPolicy(input.baseUrl)},${key.credential_secret},${key.credential_env},${key.credential_version},${actor}) RETURNING *`;
  const view=connectionView(row!);
  await audit(actor,'provider.connection.create',view.id,reason,null,view,{db:tx});
  return view;
 }) as Promise<ProviderConnection>;
}
export async function updateConnection(id:string,input:ConnectionInput,version:number,reason:string,actor:string):Promise<ProviderConnection> {
 uuid(id,'id');reasonCheck(reason);checkConnection(input);
 return sql.begin(async tx=>{
  const [old]=await tx<ConnectionRow[]>`SELECT * FROM provider_connections WHERE id=${id}::uuid FOR UPDATE`;
  if(!old)return missing('Connection');versionCheck(old.version,version);
  const policy=connectionPolicy(input.baseUrl,old.policy),key=changedCredential(input,old);
  checkConnectionPolicy(input.baseUrl,policy);
  const next={...old,base_url:input.baseUrl,timeout_ms:input.timeoutMs,policy,...key};
  // A connection edit cannot move protected models to an unrestricted endpoint.
  const models=await tx<ModelRow[]>`SELECT * FROM registered_models WHERE provider_id=${id}::uuid`;
  for(const m of models)checkModel(modelInput(m),connectionView(next));
  const [row]=await tx<ConnectionRow[]>`UPDATE provider_connections SET name=${input.name.trim()},vendor=${input.vendor.trim()},
   protocol=${input.protocol},base_url=${input.baseUrl},timeout_ms=${input.timeoutMs},enabled=${input.enabled},policy=${policy},
   credential_secret=${key.credential_secret},credential_env=${key.credential_env},credential_version=${key.credential_version},
   version=version+1,updated_by=${actor},updated_at=now() WHERE id=${id}::uuid RETURNING *`;
  const view=connectionView(row!);
  await audit(actor,'provider.connection.update',id,reason,connectionView(old),view,{db:tx});
  return view;
 }) as Promise<ProviderConnection>;
}
export async function workflowDependencies(id:string,db:Db=sql):Promise<Dependency[]> {
 const rows=await db<{setting_key:string}[]>`SELECT setting_key FROM provider_workflow_models WHERE model_id=${id}::uuid`;
 return rows.map(r=>({kind:'workflow',id:r.setting_key,name:r.setting_key}));
}
export async function deleteConnection(id:string,version:number,reason:string,actor:string):Promise<{deleted:true}> {
 uuid(id,'id');reasonCheck(reason);
 return sql.begin(async tx=>{
  const [old]=await tx<ConnectionRow[]>`SELECT * FROM provider_connections WHERE id=${id}::uuid FOR UPDATE`;
  if(!old)return missing('Connection');versionCheck(old.version,version);
  const models=await tx<{id:string;model_id:string}[]>`SELECT id,model_id FROM registered_models WHERE provider_id=${id}::uuid`;
  const dependencies:Dependency[]=models.map(m=>({kind:'model',id:m.id,name:m.model_id}));
  for(const m of models)dependencies.push(...await workflowDependencies(m.id,tx));
  if(dependencies.length)throw new ProviderConfigError('Move or delete the dependent models and workflow references first',undefined,409,dependencies);
  if(old.enabled)throw new ProviderConfigError('Disable the connection before deletion','enabled',409);
  await tx`DELETE FROM provider_connections WHERE id=${id}::uuid`;
  await audit(actor,'provider.connection.delete',id,reason,connectionView(old),null,{db:tx});
  return {deleted:true as const};
 }) as Promise<{deleted:true}>;
}
function duplicate(error:unknown):never {
 if((error as {code?:string}).code==='23505')throw new ProviderConfigError('This model ID already exists on this connection','modelId',409);
 throw error;
}
async function requireRouteEvidence(input:ModelInput,id:string,c:ConnectionRow,db:Db,old?:ModelRow):Promise<void> {
 if(!input.routeEnabled||old?.route_enabled)return;
 if(!c.enabled)throw new ProviderConfigError('Enable the connection before enabling routing','routeEnabled');
 const candidate={...old,...rowValues(input),id} as ModelRow;
 const checks=await db<CheckRow[]>`SELECT * FROM registered_model_checks WHERE model_id=${id}::uuid`;
 const fingerprint=configurationFingerprint(c,candidate);
 if(!checks.some(x=>x.config_fingerprint===fingerprint&&x.status==='verified'&&x.verified_at&&Date.now()-x.verified_at.getTime()<86400000&&input.capabilities.includes(x.capability as never)))
  throw new ProviderConfigError('Run a successful capability test on the current configuration before enabling routing','routeEnabled');
}
function rowValues(input:ModelInput) {
 return {provider_id:input.providerId,model_id:input.modelId,adapter:input.adapter,endpoint_override:input.endpointOverride,timeout_override_ms:input.timeoutOverrideMs??null,
  capabilities:input.capabilities,request_defaults:input.requestDefaults,probe_spec:input.probeSpec,
  stream:input.stream,complexity:input.complexity,documentation_url:input.documentationUrl,notes:input.notes,
  enabled:input.enabled,route_enabled:input.routeEnabled};
}
function writeValues(input:ModelInput,db:Db) {
 return {...rowValues(input),capabilities:db.json(input.capabilities),
  request_defaults:db.json(input.requestDefaults as never),probe_spec:input.probeSpec===null?null:db.json(input.probeSpec as never)};
}
export async function createRegisteredModel(input:ModelInput,reason:string,actor:string):Promise<RegisteredModel> {
 uuid(input?.providerId,'providerId');reasonCheck(reason);
 try{return await sql.begin(async tx=>{
  const [connection]=await tx<ConnectionRow[]>`SELECT * FROM provider_connections WHERE id=${input.providerId}::uuid FOR UPDATE`;
  if(!connection)return missing('Connection');checkModel(input,connectionView(connection));
  const id=randomUUID();await requireRouteEvidence(input,id,connection,tx);
  await tx`INSERT INTO registered_models ${tx({id,...writeValues(input,tx),updated_by:actor})}`;
  const view=await getRegisteredModel(id,tx);
  await audit(actor,'provider.model.create',id,reason,null,view,{db:tx});return view;
 }) as RegisteredModel;}catch(error){return duplicate(error);}
}
export async function updateRegisteredModel(id:string,input:ModelInput,version:number,reason:string,actor:string):Promise<RegisteredModel> {
 uuid(id,'id');uuid(input?.providerId,'providerId');reasonCheck(reason);
 try{return await sql.begin(async tx=>{
  const previous=await loadModel(id,tx);
  const connections=await tx<ConnectionRow[]>`SELECT * FROM provider_connections WHERE id IN (${previous.provider_id}::uuid,${input.providerId}::uuid) ORDER BY id FOR UPDATE`;
  const connection=connections.find(c=>c.id===input.providerId);
  if(!connection)return missing('Connection');
  const [old]=await tx<ModelRow[]>`SELECT * FROM registered_models WHERE id=${id}::uuid FOR UPDATE`;
  if(!old)return missing('Model');versionCheck(old.version,version);
  checkModel(input,connectionView(connection));await requireRouteEvidence(input,id,connection,tx,old);
  const before=await getRegisteredModel(id,tx);
  await tx`UPDATE registered_models SET ${tx({...writeValues(input,tx),version:old.version+1,updated_by:actor,updated_at:new Date()})} WHERE id=${id}::uuid`;
  const view=await getRegisteredModel(id,tx);
  await audit(actor,'provider.model.update',id,reason,before,view,{db:tx});return view;
 }) as RegisteredModel;}catch(error){return duplicate(error);}
}
export async function deleteRegisteredModel(id:string,version:number,reason:string,actor:string):Promise<{deleted:true}> {
 uuid(id,'id');reasonCheck(reason);
 return sql.begin(async tx=>{
  const m=await loadModel(id,tx);
  await tx`SELECT id FROM provider_connections WHERE id=${m.provider_id}::uuid FOR UPDATE`;
  const [old]=await tx<ModelRow[]>`SELECT * FROM registered_models WHERE id=${id}::uuid FOR UPDATE`;
  if(!old)return missing('Model');versionCheck(old.version,version);
  const dependencies=await workflowDependencies(id,tx);
  if(dependencies.length)throw new ProviderConfigError('Remove workflow references before deleting this model',undefined,409,dependencies);
  if(old.enabled||old.route_enabled)throw new ProviderConfigError('Disable the model and routing before deletion','enabled',409);
  const before=await getRegisteredModel(id,tx);
  await tx`DELETE FROM registered_models WHERE id=${id}::uuid`;
  await audit(actor,'provider.model.delete',id,reason,before,null,{db:tx});return {deleted:true as const};
 }) as Promise<{deleted:true}>;
}
/** Use this in every workflow-setting write, including legacy API and configuration imports. */
export async function writeWorkflowModel(tx:Tx,key:string,id:string|null,actor:string):Promise<void> {
 if(id===null){await tx`DELETE FROM settings WHERE key=${key}`;return;}
 uuid(id,'model');
 const rows=await tx`SELECT id FROM registered_models WHERE id=${id}::uuid FOR KEY SHARE`;
 if(!rows.length)return missing('Model');
 await tx`INSERT INTO settings(key,value,updated_by) VALUES (${key},${tx.json({model:'model:'+id})},${actor})
  ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`;
 await tx`INSERT INTO provider_workflow_models(setting_key,model_id) VALUES (${key},${id}::uuid)
  ON CONFLICT(setting_key) DO UPDATE SET model_id=EXCLUDED.model_id`;
}

export async function normalizedRegistryActive(db:Db=sql):Promise<boolean> {
 // Importing old records is never permission to switch live routing.
 if(process.env.MODEL_PROVIDER_REGISTRY_ENABLED!=='true')return false;
 const [activated]=await db`SELECT 1 FROM settings WHERE key='providerConnections.activation.v1'`;
 return !!activated;
}
export async function assertLegacyRegistryWritable():Promise<void> {
 if(await normalizedRegistryActive())throw new ProviderConfigError('Legacy model management is retired; use provider connections and model IDs',undefined,409);
}
