import {ProviderConfigError} from './connection-types.ts';

/** Adapt the existing chat-completions workflow to Anthropic's Messages API. */
export function anthropicRequest(body:Record<string,unknown>):Record<string,unknown> {
 if(typeof body.model!=='string'||!body.model.trim())throw new ProviderConfigError('Model ID is required','model');
 if(!Array.isArray(body.messages)||!body.messages.length)throw new ProviderConfigError('Messages are required','messages');
 if(body.stream===true)throw new ProviderConfigError('Anthropic streaming is not supported','stream');
 const supported=new Set(['model','messages','stream','max_tokens','temperature','top_p','stop','stop_sequences','system']);
 const unsupported=Object.keys(body).filter(k=>!supported.has(k));
 if(unsupported.length)throw new ProviderConfigError('Unsupported Anthropic request parameters: '+unsupported.join(', '),'requestDefaults');
 const system:string[]=[];
 if(body.system!==undefined){
  if(typeof body.system!=='string')throw new ProviderConfigError('System must be text','messages');
  system.push(body.system);
 }
 const messages:Array<{role:'user'|'assistant';content:string}>=[];
 for(const item of body.messages) {
  if(!item||typeof item!=='object')throw new ProviderConfigError('Invalid message','messages');
  const m=item as {role?:unknown;content?:unknown};
  if(typeof m.content!=='string')throw new ProviderConfigError('Anthropic adapter currently supports text messages only','messages');
  if(m.role==='system'){system.push(m.content);continue;}
  if(m.role!=='user'&&m.role!=='assistant')throw new ProviderConfigError('Unsupported message role for Anthropic','messages');
  messages.push({role:m.role,content:m.content});
 }
 if(!messages.length)throw new ProviderConfigError('At least one user/assistant message is required','messages');
 const maxTokens=body.max_tokens??4096;
 if(!Number.isInteger(maxTokens)||Number(maxTokens)<1)throw new ProviderConfigError('max_tokens must be a positive integer','requestDefaults');
 const result:Record<string,unknown>={model:body.model,max_tokens:maxTokens,messages};
 if(system.length)result.system=system.join('\n');
 if(body.temperature!==undefined)result.temperature=body.temperature;
 if(body.top_p!==undefined)result.top_p=body.top_p;
 if(body.stop_sequences!==undefined)result.stop_sequences=body.stop_sequences;
 else if(body.stop!==undefined)result.stop_sequences=typeof body.stop==='string'?[body.stop]:body.stop;
 return result;
}

/** Preserve the response shape expected by the existing probes, receipts and workflows. */
export function anthropicResponse(data:Record<string,unknown>):Record<string,unknown> {
 const blocks=data.content;
 if(!Array.isArray(blocks))throw new ProviderConfigError('Invalid Anthropic Messages response','model',502);
 const text=blocks.filter((b):b is {type:'text';text:string}=>!!b&&typeof b==='object'&&b.type==='text'&&typeof b.text==='string')
  .map(b=>b.text).join('');
 if(!text.trim())throw new ProviderConfigError('Anthropic response did not include text','model',502);
 const usage=data.usage as {input_tokens?:number;output_tokens?:number}|undefined;
 const input=usage?.input_tokens??0,output=usage?.output_tokens??0;
 return {id:data.id,model:data.model,choices:[{message:{role:'assistant',content:text},finish_reason:data.stop_reason??'stop'}],
  usage:{prompt_tokens:input,completion_tokens:output,total_tokens:input+output}};
}
