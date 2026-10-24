/** Refresh routed models before the 24h capability test expires and recover expired/failed checks.
 * Tests are paid requests: opt-in via both model flags, at most 3 per run, and failed tests cool down for 6h. */
import {sql} from '../../db.ts';
import {audit} from '../../audit.ts';
import {loadModel,loadConnection,configurationFingerprint} from './connections.ts';
import {testRegisteredModel} from './runtime.ts';

const DAY_MS=86400000,LEAD_MS=2*3600000,GRACE_MS=6*3600000,BATCH=3,ACTOR='system:provider-retest';
export const retestEnabled=()=>process.env.MODEL_PROVIDER_REGISTRY_ENABLED==='true'&&process.env.MODEL_CALLS_ENABLED==='true';

interface Candidate{model_id:string;capability:string}
/** A missed cron window must not strand a paid model forever. Failed checks retry at most every 6h. */
async function expiring(now:number):Promise<Candidate[]> {
 return sql<Candidate[]>`SELECT k.model_id,k.capability FROM registered_model_checks k
  JOIN registered_models m ON m.id=k.model_id JOIN provider_connections c ON c.id=m.provider_id
  WHERE m.enabled AND m.route_enabled AND c.enabled
   AND m.probe_spec->>'capability'=k.capability AND m.capabilities ? k.capability
   AND (
     (k.status IN ('verified','legacy') AND k.verified_at IS NOT NULL AND k.verified_at<=${new Date(now-DAY_MS+LEAD_MS)})
     OR (k.status NOT IN ('verified','legacy') AND k.updated_at<=${new Date(now-GRACE_MS)})
   )
  ORDER BY coalesce(k.verified_at,k.updated_at),k.model_id`;
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
    const [fresh]=await sql<{config_fingerprint:string;verified_at:Date|null;status:string;updated_at:Date}[]>`
     SELECT config_fingerprint,verified_at,status,updated_at FROM registered_model_checks WHERE model_id=${cand.model_id}::uuid AND capability=${cand.capability}`;
    if(!fresh || (fresh.config_fingerprint===configurationFingerprint(c,m) && 
      (fresh.status==='verified'||fresh.status==='legacy') &&
      fresh.verified_at && fresh.verified_at.getTime()>now-DAY_MS+LEAD_MS) ||
      (fresh.status!=='verified' && fresh.status!=='legacy' && fresh.updated_at.getTime()>now-GRACE_MS)){skipped++;continue;}
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
