/** Re-tests a registered model's capability shortly before (or just after) its 24 h success expires.
 * Off unless MODEL_PROVIDER_REGISTRY_ENABLED and MODEL_CALLS_ENABLED are both "true": a test is a paid model call.
 * Only a capability that already has a current-configuration success is retried, one test per model per run. */
import {sql} from '../../db.ts';
import {audit} from '../../audit.ts';
import {loadModel,loadConnection,configurationFingerprint} from './connections.ts';
import {testRegisteredModel} from './runtime.ts';

const DAY_MS=86400000,LEAD_MS=2*3600000,GRACE_MS=6*3600000,BATCH=3,ACTOR='system:provider-retest';
export const retestEnabled=()=>process.env.MODEL_PROVIDER_REGISTRY_ENABLED==='true'&&process.env.MODEL_CALLS_ENABLED==='true';

interface Candidate{model_id:string;capability:string}
/** verified_at in [now-24h-GRACE, now-24h+LEAD]; a failed or unknown retest clears verified_at and so is not repeated. */
async function expiring(now:number):Promise<Candidate[]> {
 return sql<Candidate[]>`SELECT k.model_id,k.capability FROM registered_model_checks k
  JOIN registered_models m ON m.id=k.model_id JOIN provider_connections c ON c.id=m.provider_id
  WHERE m.enabled AND m.route_enabled AND c.enabled AND k.status IN ('verified','legacy') AND k.verified_at IS NOT NULL
   AND m.probe_spec->>'capability'=k.capability AND k.capability=ANY(m.capabilities)
   AND k.verified_at>=${new Date(now-DAY_MS-GRACE_MS)} AND k.verified_at<=${new Date(now-DAY_MS+LEAD_MS)}
  ORDER BY k.verified_at,k.model_id`;
}
export async function retestExpiringModels(now=Date.now()) {
 if(!retestEnabled())return {state:'disabled' as const,tested:0,skipped:0,failed:0};
 // One run at a time across processes; a second process returns without spending anything.
 return sql.begin(async tx=>{
  const [lock]=await tx`SELECT pg_try_advisory_xact_lock(hashtext('provider-retest')) AS ok`;
  if(!lock!.ok)return {state:'locked' as const,tested:0,skipped:0,failed:0};
  let tested=0,skipped=0,failed=0;
  for(const cand of await expiring(now)) {
   if(tested+failed>=BATCH)break;
   try {
    // Re-read: another path may have refreshed it, or the configuration may have changed since the scan.
    const m=await loadModel(cand.model_id),c=await loadConnection(m.provider_id);
    const [fresh]=await sql<{config_fingerprint:string;verified_at:Date|null}[]>`
     SELECT config_fingerprint,verified_at FROM registered_model_checks WHERE model_id=${cand.model_id}::uuid AND capability=${cand.capability}`;
    if(!fresh?.verified_at||fresh.config_fingerprint!==configurationFingerprint(c,m)||fresh.verified_at.getTime()>now-DAY_MS+LEAD_MS){skipped++;continue;}
    const out=await testRegisteredModel(cand.model_id,cand.capability,ACTOR);
    out.status==='verified'?tested++:failed++;
   } catch(error) {
    failed++;
    await audit(ACTOR,'provider.model.retest.error',cand.model_id,cand.capability,null,{error:String(error).slice(0,300)}).catch(()=>{});
   }
  }
  await audit(ACTOR,'provider.model.retest.run','provider-retest',null,null,{tested,skipped,failed});
  return {state:'ran' as const,tested,skipped,failed};
 });
}
