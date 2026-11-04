import type {FastifyInstance,FastifyReply} from 'fastify';
import {graphitiAuthorized,graphitiModelRequest} from '@aihot/backend/providers/graphiti-proxy';
import {ProviderRejectedError,ReceiptUnknownError,BudgetExceededError} from '@aihot/backend/providers/receipts';
import {ProviderConfigError} from '@aihot/backend/providers/registry/connection-types';

function errorReply(reply:FastifyReply,error:unknown) {
 if(error instanceof ProviderRejectedError) {
  return reply.code(error.status===429?429:502).send({error:{message:'Configured model provider rejected the request',type:'provider_rejected'}});
 }
 if(error instanceof BudgetExceededError)return reply.code(429).send({error:{message:'No model capacity available',type:'rate_limit_error'}});
 if(error instanceof ReceiptUnknownError)return reply.code(503).send({error:{message:'Model outcome is unknown; verify receipt before retry',type:'outcome_unknown'}});
 if(error instanceof ProviderConfigError)return reply.code(503).send({error:{message:error.message,type:'configuration_error'}});
 const status=(error as {statusCode?:number})?.statusCode;
 if(status===400)return reply.code(400).send({error:{message:'Invalid Graphiti model request',type:'invalid_request_error'}});
 return reply.code(503).send({error:{message:'Graphiti model route is not available',type:'service_unavailable'}});
}

export function registerGraphitiModelProxy(app:FastifyInstance) {
 for(const [path,kind] of [
  ['/api/internal/graphiti/v1/chat/completions','chat'],
  ['/api/internal/graphiti/v1/embeddings','embedding'],
 ] as const) {
  app.post(path,async(req,reply)=>{
   reply.header('Cache-Control','no-store');
   if(!graphitiAuthorized(req.headers.authorization,process.env.GRAPHITI_MODEL_PROXY_TOKEN))
    return reply.code(401).send({error:{message:'Unauthorized',type:'authentication_error'}});
   try {
    return reply.send(await graphitiModelRequest(kind,req.body));
   }catch(error){
    req.log.warn({kind,errorType:error instanceof Error?error.constructor.name:'unknown',...(error instanceof ProviderConfigError?{message:error.message}:{})},'graphiti model request failed');
    return errorReply(reply,error);
   }
  });
 }
}
