import { listConnections, listRegisteredModels } from './connections.ts';
import { BudgetExceededError } from '../receipts.ts';
import type { RegisteredModel, ProviderConnection } from '@aihot/contracts/providers';

export type Complexity = 'light' | 'medium' | 'heavy';
const weights: Record<string, Complexity> = {
  prefilter: 'light', score: 'medium', understand: 'heavy', summarize: 'light',
  wording: 'light', structure: 'medium', group: 'heavy', groupReview: 'heavy',
  digest: 'heavy', report: 'heavy', graphiti: 'heavy', translate: 'medium', english: 'medium', explain: 'heavy',
};
const levels: Record<Complexity, number> = { light: 0, medium: 1, heavy: 2 };
const cooling = new Map<string, number>();
// The most recently successful free model is reused until an explicit rejection.
// Keyed by required tier and capability, never by workflow or arbitrary test latency.
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

export function rankFreeModels(models:RegisteredModel[],connections:ProviderConnection[],stage:string,
  now=Date.now(),needsVision=false,excluded:ReadonlySet<string>=new Set()):RegisteredModel[] {
  const owners=new Map(connections.map(c=>[c.id,c]));
  const capability=needsVision?'vision':'text',target=stageComplexity(stage);
  const cached=lastGood.get(cacheKey(stage,needsVision));
  return models.filter(m=>{
    const c=owners.get(m.providerId);
    return !!c&&c.enabled&&c.credential.configured&&m.billing==='free'&&
      m.enabled&&m.routeEnabled&&m.adapter==='chat'&&
      m.routing.eligibleCapabilities.includes(capability)&&levels[m.complexity]>=levels[target]&&
      !excluded.has(m.id)&&(cooling.get(m.id)??0)<=now;
  }).sort((a,b)=>{
    // Previously successful free model wins; otherwise stay in the requested tier.
    const cachedDifference=Number(b.id===cached)-Number(a.id===cached);
    return cachedDifference||
      (levels[a.complexity]-levels[target])-(levels[b.complexity]-levels[target])||
      a.modelId.localeCompare(b.modelId)||a.id.localeCompare(b.id);
  });
}

export async function selectConfiguredProviderForStage(stage:string,needsVision=false,
  excluded:ReadonlySet<string>=new Set()):Promise<string> {
  const [connections,models]=await Promise.all([listConnections(),listRegisteredModels()]);
  const candidates=rankFreeModels(models,connections,stage,Date.now(),needsVision,excluded);
  if(!candidates.length)throw new BudgetExceededError('free-models','waiting_for_free_provider',300);
  return 'model:'+candidates[0]!.id;
}

export function coolDownReference(reference:string,seconds=60):void {
  if(reference.startsWith('model:'))coolDownModel(reference.slice(6),seconds);
}
