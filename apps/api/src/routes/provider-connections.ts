import {capabilities,modelSources} from '@aihot/backend/editorial/models';
import type {FastifyInstance} from 'fastify';
import {actorOf} from '@aihot/backend/admin/auth';
import {listConnections,loadConnection,connectionView,createConnection,updateConnection,deleteConnection,
 listRegisteredModels,createRegisteredModel,getRegisteredModel,updateRegisteredModel,deleteRegisteredModel} from '@aihot/backend/providers/registry/connections';
import type {ConnectionInput,ModelInput} from '@aihot/backend/providers/registry/connection-types';
import {discoverModels,testConnection,testRegisteredModel} from '@aihot/backend/providers/registry/runtime';
import {importModels} from '@aihot/backend/providers/registry/import';
import {adminHandler} from './admin-auth.ts';
import {body,param} from './admin.ts';

export function registerProviderConnections(app:FastifyInstance) {
 app.get('/api/admin/providers',adminHandler(async()=>{
  const sources=await modelSources();return {providers:await listConnections(),models:await listRegisteredModels(),protocols:['openai-compatible'],
   workflows:Object.entries(capabilities()).map(([key,c])=>({key,label:c.label,...sources[key]!}))};
 }));
 app.post('/api/admin/providers',adminHandler(async(req,_reply,admin)=>{
  const {reason,...input}=body<ConnectionInput&{reason:string}>(req);return createConnection(input,reason,actorOf(admin));
 }));
 app.get('/api/admin/providers/:id',adminHandler(async req=>connectionView(await loadConnection(param(req,'id')))));
 app.patch('/api/admin/providers/:id',adminHandler(async(req,_reply,admin)=>{
  const {version,reason,...input}=body<ConnectionInput&{version:number;reason:string}>(req);
  return updateConnection(param(req,'id'),input,version,reason,actorOf(admin));
 }));
 app.delete('/api/admin/providers/:id',adminHandler(async(req,_reply,admin)=>{
  const b=body<{version:number;reason:string}>(req);return deleteConnection(param(req,'id'),b.version,b.reason,actorOf(admin));
 }));
 app.post('/api/admin/providers/:id/test',adminHandler(async req=>testConnection(param(req,'id'))));
 app.post('/api/admin/providers/:id/discover',adminHandler(async req=>discoverModels(param(req,'id'))));
 app.post('/api/admin/providers/:id/models::import',adminHandler(async(req,_reply,admin)=>{
  const b=body<{modelIds:unknown;reason:string}>(req);return importModels(param(req,'id'),b.modelIds,b.reason,actorOf(admin));
 }));
 app.get('/api/admin/providers/:id/models',adminHandler(async req=>{
  const id=param(req,'id');await loadConnection(id);return {models:(await listRegisteredModels()).filter(m=>m.providerId===id)};
 }));
 app.post('/api/admin/providers/:id/models',adminHandler(async(req,_reply,admin)=>{
  const {reason,...input}=body<ModelInput&{reason:string}>(req);
  return createRegisteredModel({...input,providerId:param(req,'id')},reason,actorOf(admin));
 }));
 app.get('/api/admin/provider-models/:id',adminHandler(async req=>getRegisteredModel(param(req,'id'))));
 app.patch('/api/admin/provider-models/:id',adminHandler(async(req,_reply,admin)=>{
  const {version,reason,...input}=body<ModelInput&{version:number;reason:string}>(req);
  return updateRegisteredModel(param(req,'id'),input,version,reason,actorOf(admin));
 }));
 app.delete('/api/admin/provider-models/:id',adminHandler(async(req,_reply,admin)=>{
  const b=body<{version:number;reason:string}>(req);return deleteRegisteredModel(param(req,'id'),b.version,b.reason,actorOf(admin));
 }));
 app.post('/api/admin/provider-models/:id/test',adminHandler(async(req,_reply,admin)=>
  testRegisteredModel(param(req,'id'),body<{capability:string}>(req).capability,actorOf(admin))));
}
