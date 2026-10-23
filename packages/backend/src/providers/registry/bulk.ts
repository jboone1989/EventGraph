import {assertLegacyRegistryWritable} from './connections.ts';
/** One persisted queue job per Provider. Each worker sends that Provider's own sample.
 * Disabled models are tested independently of production routing.
 */
import {randomUUID} from "node:crypto";
import {sql} from "../../db.ts";
import {audit} from "../../audit.ts";
import {enqueue,QUEUES} from "../../jobs/queue.ts";
import {listProviders} from "./repository.ts";
import {probeConfiguredProvider} from "./probe.ts";
import {isVerifiedFreeTrialProvider} from "./types.ts";
export type BulkStatus="queued"|"running"|"verified"|"failed"|"unknown"|"unsupported";
export interface BulkRow{vendor:string;modelId:string;capability:string;status:BulkStatus;latencyMs:number|null;detail:string|null;updatedAt:string}
interface Row{vendor:string;model_id:string;capability:string;status:BulkStatus;latency_ms:number|null;detail:string|null;updated_at:Date;run_id:string}
const present=(x:Row):BulkRow=>({vendor:x.vendor,modelId:x.model_id,capability:x.capability,status:x.status,latencyMs:x.latency_ms,detail:x.detail,updatedAt:x.updated_at.toISOString()});
export async function latestBulkRun(runId?:string){
 const [recent]=await sql<{run_id:string;created_at:Date;requested_by:string}[]>`
  SELECT run_id, min(created_at) AS created_at, max(requested_by) AS requested_by
  FROM model_provider_bulk_checks
  WHERE (${runId??null}::uuid IS NULL OR run_id=${runId??null}::uuid)
  GROUP BY run_id ORDER BY created_at DESC LIMIT 1`;
 if(!recent)return null;
 const rows=await sql<Row[]>`SELECT * FROM model_provider_bulk_checks WHERE run_id=${recent.run_id}::uuid ORDER BY vendor,model_id`;
 if(!runId&&rows.some(r=>!isVerifiedFreeTrialProvider(r.model_id)))return null;
 const summary={total:rows.length,queued:0,running:0,verified:0,failed:0,unknown:0,unsupported:0};
 for(const r of rows)summary[r.status]++;
 return {runId:recent.run_id,startedAt:recent.created_at.toISOString(),requestedBy:recent.requested_by,summary,finished:summary.queued+summary.running===0,rows:rows.map(present)};
}
export async function startBulkRun(actor:string){
 await assertLegacyRegistryWritable();
 const active=await latestBulkRun();
 if(active&&!active.finished){
  // Recovery is explicit and cheap; never make the HTTP request enqueue dozens of models.
  await enqueue(QUEUES.providerDispatch,{runId:active.runId});
  return latestBulkRun(active.runId);
 }
 const providers=(await listProviders()).filter(p=>p.vendor==="nvidia"&&isVerifiedFreeTrialProvider(p.modelId));
 const runId=randomUUID();
 for(const p of providers){
  const capability=p.probeSpec?.capability??"unconfigured";
  const testable=!!(p.probeSpec&&p.endpoint&&p.adapter!=="unconfigured");
  await sql`INSERT INTO model_provider_bulk_checks
   (run_id,vendor,model_id,capability,status,detail,requested_by)
   VALUES (${runId}::uuid,${p.vendor},${p.modelId},${capability},
    ${testable?"queued":"unsupported"},${testable?null:"Provider test request not configured"},${actor})`;
 }
 await audit(actor,"model.provider.bulk.start","model-providers", "test each provider with its own DB request",null,{runId,count:providers.length});
 // One scheduler event only; no model requests run in the HTTP lifecycle.
 await enqueue(QUEUES.providerDispatch,{runId});
 return latestBulkRun(runId);
}
/** Worker: unique job claims one DB row; retries can only advance previously queued/unknown rows. */
export async function runBulkProviderJob(data:{runId:string;vendor:string;modelId:string;capability:string}){
 const {runId,vendor,modelId,capability}=data;
 if(vendor!=="nvidia"||!isVerifiedFreeTrialProvider(modelId)){
  await sql`UPDATE model_provider_bulk_checks SET status='unsupported',
    detail='Not confirmed as a NVIDIA free trial API',updated_at=now()
    WHERE run_id=${runId}::uuid AND vendor=${vendor} AND model_id=${modelId}
    AND status='queued'`;
  return;
 }
 const claimed=await sql<{status:BulkStatus}[]>`UPDATE model_provider_bulk_checks
 SET status='running',updated_at=now(),detail=NULL
 WHERE run_id=${runId}::uuid AND vendor=${vendor} AND model_id=${modelId}
 AND capability=${capability} AND status IN ('queued','unknown') RETURNING status`;
 if(!claimed.length)return;
 let result:{status:BulkStatus;elapsedMs:number|null;detail:string};
 try{
  const r=await probeConfiguredProvider(vendor,modelId,capability,"provider-bulk:"+runId,{allowInactive:true,attemptTag:runId});
  result={status:r.status,elapsedMs:r.elapsedMs,detail:r.detail};
 }catch{
  result={status:"unknown",elapsedMs:null,detail:"provider execution interrupted"};
 }
 await sql`UPDATE model_provider_bulk_checks SET status=${result.status},
  latency_ms=${result.elapsedMs},detail=${result.detail},updated_at=now()
  WHERE run_id=${runId}::uuid AND vendor=${vendor} AND model_id=${modelId} AND capability=${capability}`;
}

/** Worker starts every independently configured free-trial model in parallel.
 * Each task writes its own durable result, independently of other models.
 */
export async function dispatchBulkProviderJobs({runId}:{runId:string}){
 const rows=await sql<{vendor:string;model_id:string;capability:string}[]>`
  SELECT vendor,model_id,capability FROM model_provider_bulk_checks
  WHERE run_id=${runId}::uuid AND status='queued'
  ORDER BY vendor,model_id`;
 const eligible=rows.filter(p=>isVerifiedFreeTrialProvider(p.model_id));
 // Kick off every model immediately. There is no fixed concurrency cap or
 // per-model dispatch wait: each call claims its own row and sends its own request.
 // Promise.allSettled lets completed models persist results while others are pending.
 const outcomes=await Promise.allSettled(eligible.map(p=>runBulkProviderJob({
  runId,vendor:p.vendor,modelId:p.model_id,capability:p.capability
 })));
 return {dispatched:eligible.length,settled:outcomes.length,
  rejected:outcomes.filter(p=>p.status==="rejected").length};
}
