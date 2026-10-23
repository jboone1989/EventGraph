import {isVerifiedFreeTrialProvider} from './types.ts';
import {ProviderConfigError,type ProviderConnection,type ModelInput} from './connection-types.ts';

const hosts=new Set(['integrate.api.nvidia.com','ai.api.nvidia.com']);
const host=(url:URL)=>url.hostname.toLowerCase().replace(/\.$/,'');
const protectedHost=(url:URL)=>host(url)==='nvidia.com'||host(url).endsWith('.nvidia.com');
export function connectionPolicy(baseUrl:string,previous?:ProviderConnection['policy']):ProviderConnection['policy'] {
 return previous==='nvidia-free-trial'||protectedHost(new URL(baseUrl))?'nvidia-free-trial':'none';
}
export function checkConnectionPolicy(baseUrl:string,policy:ProviderConnection['policy']):void {
 const url=new URL(baseUrl);
 if(policy==='nvidia-free-trial'&&(!hosts.has(host(url))||url.port||!/^\/v1(?:\/|$)/.test(url.pathname)))
  throw new ProviderConfigError('NVIDIA free trial connections must retain an approved NVIDIA API endpoint','baseUrl');
}
export function checkModelPolicy(input:ModelInput,connection:Pick<ProviderConnection,'policy'>,url:URL):void {
 if(connection.policy!=='nvidia-free-trial'&&!protectedHost(url))return;
 if(!hosts.has(host(url))||url.port||!/^\/v1(?:\/|$)/.test(url.pathname))
  throw new ProviderConfigError('The NVIDIA free trial connection must use an approved NVIDIA API endpoint','endpointOverride');
 if((input.enabled||input.routeEnabled)&&!isVerifiedFreeTrialProvider(input.modelId))
  throw new ProviderConfigError('Only officially confirmed NVIDIA free trial API models can be enabled','modelId');
}
