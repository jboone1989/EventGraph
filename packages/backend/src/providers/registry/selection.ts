import {normalizedRegistryActive,listConnections,listRegisteredModels} from './connections.ts';
import {BudgetExceededError} from "../receipts.ts";
import {listProviders} from "./repository.ts";
import type {ProviderProfile} from "./types.ts";
import {isVerifiedFreeTrialProvider} from "./types.ts";
type Stage="prefilter"|"score"|"understand"|"summarize"|"wording"|"structure"|"group"|"groupReview"|"digest"|"report"|"translate"|"english"|string;
const weights:Record<string,"light"|"medium"|"heavy">={
 prefilter:"light",score:"medium",understand:"medium",summarize:"light",wording:"light",
 structure:"light",group:"medium",groupReview:"heavy",digest:"heavy",
 report:"heavy",translate:"medium",english:"medium",
};
const levels={light:0,medium:1,heavy:2};
/** Pure choice across independent providers; URL, params and auth stay with the chosen row. */
export function rankStageProviders(rows:ProviderProfile[],stage:Stage,now=Date.now(),needsVision=false):ProviderProfile[]{
 const intended=levels[weights[stage]??"medium"];
 const wanted=needsVision?"vision":"text";
 const eligible=rows.filter(p=>p.vendor==="nvidia"&&isVerifiedFreeTrialProvider(p.modelId)&&p.enabled&&p.routeEnabled&&p.endpoint&&p.adapter==="chat"&&
   p.capabilities.includes(wanted)&&p.checks.some(c=>c.capability===wanted&&
     c.status==="verified"&&c.verifiedAt&&now-Date.parse(c.verifiedAt)<86400000));
 return eligible.sort((a,b)=>{
  const score=(p:ProviderProfile)=>{
   const diff=levels[p.complexity]-intended;
   // For cheap tasks prefer smaller; deep tasks prefer enough complexity.
   const tier=intended===0?levels[p.complexity]*100:diff<0?Math.abs(diff)*150:diff*70;
   const latency=p.checks.find(c=>c.capability===wanted)?.latencyMs??120000;
   return tier+latency/1000;
  };
  return score(a)-score(b)||a.modelId.localeCompare(b.modelId);
 });
}
export async function selectConfiguredProviderForStage(stage:Stage,needsVision=false):Promise<string>{
 if(await normalizedRegistryActive()) {
  const connections=await listConnections(),wanted=needsVision?'vision':'text';
  const protectedIds=new Set(connections.filter(c=>c.policy==='nvidia-free-trial').map(c=>c.id));
  const models=(await listRegisteredModels()).filter(m=>protectedIds.has(m.providerId)&&m.adapter==='chat'&&m.routing.eligibleCapabilities.includes(wanted));
  const intended=levels[weights[stage]??'medium'];
  models.sort((a,b)=>Math.abs(levels[a.complexity]-intended)-Math.abs(levels[b.complexity]-intended)||a.id.localeCompare(b.id));
  if(!models[0])throw Error('No eligible configured model for '+stage+'; test the current configuration');
  return 'model:'+models[0].id;
 }
 const eligible=rankStageProviders(await listProviders(),stage,Date.now(),needsVision);
 if(!eligible[0])throw new BudgetExceededError("nvidia","waiting_for_verified_provider",300);
 return "nvidia:"+eligible[0].modelId;
}
