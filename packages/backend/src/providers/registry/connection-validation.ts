import {ADAPTERS,CAPABILITIES,COMPLEXITIES} from './types.ts';
import {PROTOCOLS,ProviderConfigError,type ConnectionInput,type ModelInput,type ProviderConnection} from './connection-types.ts';
import {checkModelPolicy} from './nvidia-policy.ts';
export {connectionPolicy,checkConnectionPolicy} from './nvidia-policy.ts';

const fail=(field:string,message:string):never=>{throw new ProviderConfigError(message,field);};
export function object(value:unknown):value is Record<string,unknown> {
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function text(field:string,value:unknown,max:number):asserts value is string {
 if(typeof value!=='string'||!value.trim()||value.length>max)fail(field,`Enter ${field} (maximum ${max} characters)`);
}
export function checkApiUrl(value:unknown,field='baseUrl'):URL {
 text(field,value,2000);
 if(value!==value.trim()||/[\x00-\x20\x7f]/.test(value))fail(field,'API URLs cannot contain whitespace or control characters');
 let url:URL;try{url=new URL(value);}catch{return fail(field,'Enter a complete HTTPS API URL');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)
  fail(field,'Use HTTPS without credentials, query parameters or a fragment');
 return url;
}
export function checkConnection(input:ConnectionInput):void {
 const keys=new Set(['name','vendor','protocol','baseUrl','timeoutMs','enabled','credential']);
 if(!object(input)||Object.keys(input).some(k=>!keys.has(k)))fail('connection','Unknown connection configuration property');
 text('name',input.name,120);text('vendor',input.vendor,80);
 if(!PROTOCOLS.includes(input.protocol))fail('protocol','Unsupported protocol');
 checkApiUrl(input.baseUrl);
 if(!Number.isInteger(input.timeoutMs)||input.timeoutMs<1000||input.timeoutMs>600000)fail('timeoutMs','Timeout must be between 1000 and 600000 ms');
 if(typeof input.enabled!=='boolean')fail('enabled','Enabled must be a boolean');
 if(input.credential!==undefined) {
  const c=input.credential;
  if(!object(c)||!['keep','clear','replace'].includes(c.action)||Object.keys(c).some(k=>!['action','value'].includes(k)))fail('credential','Choose keep, replace or clear');
  if(c.action==='replace') {
   if(typeof c.value!=='string'||!c.value.trim()||c.value.length>8192||/[\r\n]/.test(c.value))fail('credential','Enter a credential without line breaks (maximum 8192 characters)');
  } else if('value' in c)fail('credential','Only replacement accepts a credential value');
 }
}
const forbidden=new Set(['model','messages','stream','authorization','api_key','apikey','credential','endpoint','url','input','prompt','api_base','base_url','baseurl','host','headers']);
function safeJson(field:string,value:unknown,max:number):void {
 if(!object(value)||JSON.stringify(value).length>max)fail(field,'Enter a JSON object within the size limit');
 function visit(node:unknown):void {
  if(Array.isArray(node)){for(const child of node)visit(child);return;}
  if(!object(node))return;
  for(const [key,child] of Object.entries(node)) {
   if(['authorization','api_key','apikey','credential','__proto__','constructor','prototype'].includes(key.toLowerCase()))fail(field,'Credentials and prototype keys are not allowed in request JSON');
   visit(child);
  }
 }
 visit(value);
}
export function checkModel(input:ModelInput,connection:Pick<ProviderConnection,'id'|'baseUrl'|'policy'>):void {
 const keys=new Set(['providerId','modelId','adapter','endpointOverride','timeoutOverrideMs','capabilities','requestDefaults','probeSpec','stream','complexity','documentationUrl','notes','enabled','routeEnabled']);
 if(!object(input)||Object.keys(input).some(k=>!keys.has(k)))fail('model','Unknown model configuration property');
 if(input.timeoutOverrideMs!=null&&(!Number.isInteger(input.timeoutOverrideMs)||input.timeoutOverrideMs<1000||input.timeoutOverrideMs>600000))fail('timeoutOverrideMs','Timeout must be between 1000 and 600000 ms');
 if(input.providerId!==connection.id)fail('providerId','Connection does not match the model');
 text('modelId',input.modelId,300);
 if(input.modelId!==input.modelId.trim()||/[\r\n\x00]/.test(input.modelId))fail('modelId','Model ID cannot have surrounding whitespace or control characters');
 if(!ADAPTERS.includes(input.adapter))fail('adapter','Unsupported adapter');
 if(!COMPLEXITIES.includes(input.complexity))fail('complexity','Invalid complexity');
 if(!Array.isArray(input.capabilities)||input.capabilities.length>CAPABILITIES.length||input.capabilities.some(c=>!CAPABILITIES.includes(c)))fail('capabilities','Invalid capabilities');
 for(const field of ['stream','enabled','routeEnabled'] as const)if(typeof input[field]!=='boolean')fail(field,'Use a boolean');
 if(input.routeEnabled&&!input.enabled)fail('routeEnabled','Enable the model before enabling routing');
 if(input.stream&&!['chat','document','safety'].includes(input.adapter))fail('stream','This adapter does not support streaming');
 safeJson('requestDefaults',input.requestDefaults,12000);
 if(Object.keys(input.requestDefaults).some(k=>forbidden.has(k.toLowerCase())))fail('requestDefaults','Request parameters cannot override model, messages, stream or credentials');
 if(input.probeSpec!==null) {
  const p=input.probeSpec;
  if(!object(p)||!CAPABILITIES.includes(p.capability)||!['chat','embedding','json'].includes(p.response))fail('probeSpec','Invalid test request');
  safeJson('probeSpec',p.body,12000);
  if(p.capability==='vision'&&!JSON.stringify(p.body).includes('\"image_url\"'))fail('probeSpec','A vision test must include image input');
  if(p.body.model!==undefined&&p.body.model!==input.modelId)fail('probeSpec','Test model must match the configured model ID');
  if(['endpoint','url'].some(k=>k in p.body))fail('probeSpec','Tests cannot override the API URL');
 }
 for(const field of ['documentationUrl','notes'] as const)
  if(input[field]!==null&&(typeof input[field]!=='string'||input[field]!.length>2000))fail(field,'Maximum 2000 characters');
 if(input.documentationUrl)checkApiUrl(input.documentationUrl,'documentationUrl');
 if(input.endpointOverride!==null&&(typeof input.endpointOverride!=='string'||!input.endpointOverride.trim()))fail('endpointOverride','Enter an HTTPS API URL or null');
 const base=checkApiUrl(connection.baseUrl,'baseUrl');
 const url=input.endpointOverride?checkApiUrl(input.endpointOverride,'endpointOverride'):base;
 // Credentials belong to one origin. Model URLs may change path, never host.
 if(url.origin!==base.origin)fail('endpointOverride','Model endpoint must share the connection origin');
 checkModelPolicy(input,connection,url);
 if(input.routeEnabled&&['special','unconfigured'].includes(input.adapter))fail('adapter','Configure a supported adapter before enabling routing');
}
