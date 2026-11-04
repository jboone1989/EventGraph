import type {ProviderConnection,RegisteredModel} from '@aihot/contracts/providers';

export type ModelPrice={kind:'free'|'paid'|'trial'|'unknown';input?:number;output?:number;checkedAt?:string};
export function modelPrice(model:RegisteredModel,provider?:ProviderConnection):ModelPrice {
 const value=model.upstreamMetadata?.pricing as Record<string,unknown>|undefined;
 if(provider?.policy==='nvidia-free-trial')return {kind:'trial'};
 if(provider?.vendor.toLowerCase()==='openrouter'&&value?.source==='openrouter'&&
  (value.kind==='free'||value.kind==='paid')&&
  typeof value.inputPerMillion==='number'&&typeof value.outputPerMillion==='number')
  return {kind:value.kind,input:value.inputPerMillion,output:value.outputPerMillion,checkedAt:typeof value.checkedAt==='string'?value.checkedAt:undefined};
 return {kind:'unknown'};
}
export const priceLabel=(p:ModelPrice)=>({free:'免费',paid:'收费',trial:'免费试用',unknown:'未知'}[p.kind]);
export const priceDetail=(p:ModelPrice)=>p.input!==undefined&&p.output!==undefined?
 '输入 $'+p.input.toFixed(3)+' / 输出 $'+p.output.toFixed(3)+' · 每百万 tokens':'';
