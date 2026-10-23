export {PROTOCOLS} from '@aihot/contracts/providers';
export type {ConnectionInput,ProviderConnection,RegisteredModel,ModelInput,Dependency,CredentialEdit} from '@aihot/contracts/providers';
import type {Dependency} from '@aihot/contracts/providers';

export class ProviderConfigError extends Error {
 readonly statusCode:number;
 readonly fieldErrors:Record<string,string>;
 readonly dependencies:Dependency[];
 constructor(message:string,field?:string,statusCode=400,dependencies:Dependency[]=[]) {
  super(message);this.name='ProviderConfigError';this.statusCode=statusCode;
  this.fieldErrors=field?{[field]:message}:{};this.dependencies=dependencies;
 }
}
