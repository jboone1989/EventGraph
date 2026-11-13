import { listConnections, listRegisteredModels } from './connections.ts';
import { BudgetExceededError, ProviderRejectedError } from '../receipts.ts';
import { sql } from '../../db.ts';
import type { RegisteredModel, ProviderConnection } from '@aihot/contracts/providers';

export type Complexity = 'light' | 'medium' | 'heavy';
const weights: Record<string, Complexity> = {
  prefilter: 'light', score: 'medium', understand: 'medium', summarize: 'light',
  wording: 'light', structure: 'medium', group: 'medium', groupReview: 'heavy',
  digest: 'medium', report: 'heavy', graphiti: 'medium', translate: 'medium', english: 'medium', explain: 'medium',
};
const levels: Record<Complexity, number> = { light: 0, medium: 1, heavy: 2 };
const cooling = new Map<string, number>();
// Reuse only a model that returned a valid, schema-checked result.
// Temporary model failures are shared across workers by a bounded database cooldown.
const lastGood = new Map<string, string>();

export function stageComplexity(stage: string): Complexity {
  return stage === 'light' || stage === 'medium' || stage === 'heavy' ? stage : weights[stage] ?? 'medium';
}
const cacheKey=(stage:string,needsVision:boolean)=>stageComplexity(stage)+':'+(needsVision?'vision':'text');

export function rememberSuccessfulRoute(reference:string,stage:string,needsVision=false):void {
  if(reference.startsWith('model:'))lastGood.set(cacheKey(stage,needsVision),reference.slice(6));
}

/** After a rejection do not pick the same cached model again. */
export function coolDownModel(id:string,seconds=60):void {
  const until=Date.now()+Math.max(1,seconds)*1000;
  cooling.set(id,until);
  for(const [key,cachedId] of lastGood)if(cachedId===id)lastGood.delete(key);
}

export function rankAutomaticModels(models:RegisteredModel[],connections:ProviderConnection[],stage:string,
  now=Date.now(),needsVision=false,excluded:ReadonlySet<string>=new Set()):RegisteredModel[] {
  const owners=new Map(connections.map(c=>[c.id,c]));
  const capability=needsVision?'vision':'text',target=stageComplexity(stage);
  const cached=lastGood.get(cacheKey(stage,needsVision));
  return models.filter(m=>{
    const c=owners.get(m.providerId);
    return !!c&&c.enabled&&c.credential.configured&&
      m.enabled&&m.routeEnabled&&m.adapter==='chat'&&
      m.routing.eligibleCapabilities.includes(capability)&&levels[m.complexity]>=levels[target]&&
      !excluded.has(m.id)&&(cooling.get(m.id)??0)<=now;
  }).sort((a,b)=>{
    // Exact tier wins over a previously cached higher-tier fallback. Within the
    // same tier, reuse the last model that returned a valid business answer.
    const tierDifference=(levels[a.complexity]-levels[target])-(levels[b.complexity]-levels[target]);
    const cachedDifference=Number(b.id===cached)-Number(a.id===cached);
    return tierDifference||cachedDifference||a.modelId.localeCompare(b.modelId)||a.id.localeCompare(b.id);
  });
}

/** Test-compatible alias. Automatic routing is intentionally not restricted to free models. */
export const rankFreeModels = rankAutomaticModels;

const failureKey = (id:string) => 'routing.failed:' + id;

/** A provider hiccup must not poison unrelated articles until UTC midnight.
 * The caller already excludes this UUID for the current logical task.
 * Persist a short cross-worker cooldown to avoid hammering failing providers.
 */
export function autoRouteFailureCooldownSeconds(error:unknown):number {
  if(error instanceof ProviderRejectedError) {
    if(error.status===429)return 300;
    if(error.status===413)return 60;
    if([401,403,404,410].includes(error.status??0))return 1800;
    if((error.status??0)>=500)return 120;
  }
  return 60;
}

/** Older failure rows have no expiry and must not retain the old all-day ban. */
export function activeFailedRouteIds(rows:ReadonlyArray<{key:string;value:unknown}>,now=Date.now()):Set<string> {
  const active=new Set<string>();
  for(const row of rows) {
    if(!row.key.startsWith('routing.failed:'))continue;
    const value=row.value;
    const until=value&&typeof value==='object'&&!Array.isArray(value)&&'until' in value
      ?(value as {until:unknown}).until:null;
    if(typeof until==='string') {
      const expires=Date.parse(until);
      if(Number.isFinite(expires)&&expires>now)active.add(row.key.slice('routing.failed:'.length));
    }
  }
  return active;
}

export async function markFailedAutoRoute(reference:string,error:unknown):Promise<void> {
  if(!reference.startsWith('model:'))return;
  const id=reference.slice(6);
  const at=new Date(),until=new Date(at.getTime()+autoRouteFailureCooldownSeconds(error)*1000);
  for(const [key,cachedId] of lastGood)if(cachedId===id)lastGood.delete(key);
  await sql`
    INSERT INTO settings(key,value,updated_by)
    VALUES (${failureKey(id)},${sql.json({reason:String(error).slice(0,200),at:at.toISOString(),until:until.toISOString()})},'auto-routing')
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`;
}

/** Admin's explicit "refresh models" also gives previously failed models a new chance. */
export async function clearFailedAutoRoutes():Promise<number> {
  const deleted=await sql<{key:string}[]>`DELETE FROM settings WHERE key LIKE 'routing.failed:%' RETURNING key`;
  cooling.clear();lastGood.clear();
  return deleted.length;
}

export async function selectConfiguredProviderForStage(stage:string,needsVision=false,
  excluded:ReadonlySet<string>=new Set()):Promise<string> {
  const [connections,models,failed]=await Promise.all([
    listConnections(),listRegisteredModels(),
    sql<{key:string;value:unknown}[]>`SELECT key,value FROM settings WHERE key LIKE 'routing.failed:%'`,
  ]);
  const ineligible=new Set([...excluded,...activeFailedRouteIds(failed)]);
  const candidates=rankAutomaticModels(models,connections,stage,Date.now(),needsVision,ineligible);
  if(!candidates.length)throw new BudgetExceededError('models','no_available_model',300);
  return 'model:'+candidates[0]!.id;
}

export function coolDownReference(reference:string,seconds=60):void {
  if(reference.startsWith('model:'))coolDownModel(reference.slice(6),seconds);
}
