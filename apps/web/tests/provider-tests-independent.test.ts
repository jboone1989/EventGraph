import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {chromium,expect} from '@playwright/test';
import {startWebServer} from './web-server.ts';
import type {ProviderManagement,RegisteredModel} from '@aihot/contracts/providers';

test('two NVIDIA model rows can probe concurrently and keep independent results',async()=>{
 const providerId='11111111-1111-4111-a111-111111111111';
 const model=(suffix:string,id:string):RegisteredModel=>({
  id,providerId,modelId:suffix,adapter:'chat',endpointOverride:null,timeoutOverrideMs:null,
  capabilities:['text'],requestDefaults:{},
  probeSpec:{capability:'text',body:{messages:[{role:'user',content:'OK'}]},response:'chat'},
  stream:false,complexity:'medium',documentationUrl:null,notes:null,enabled:false,routeEnabled:false,
  upstreamMetadata:{},checks:[],routing:{eligibleCapabilities:[],reasons:[]},version:1,updatedAt:new Date().toISOString()
 });
 const first=model('nvidia/first','22222222-2222-4222-a222-000000000001');
 const second=model('nvidia/second','22222222-2222-4222-a222-000000000002');
 const data:ProviderManagement={
  providers:[{id:providerId,name:'NVIDIA',vendor:'nvidia',protocol:'openai-compatible',
   baseUrl:'https://integrate.api.nvidia.com/v1',timeoutMs:60000,enabled:true,policy:'nvidia-free-trial',
   credential:{configured:true},version:1,updatedAt:new Date().toISOString()}],
  models:[first,second],protocols:['openai-compatible'],workflows:[]
 };
 let releaseFirst:()=>void=()=>{};
 const firstGate=new Promise<void>(resolve=>{releaseFirst=resolve;});
 const requests:string[]=[];
 const api=createServer(async(req,res)=>{
  const path=new URL(req.url!,'http://api.local').pathname;
  res.setHeader('content-type','application/json');
  if(path==='/api/admin/me')return res.end(JSON.stringify({name:'Probes test',csrf:'fixture',dev:true}));
  if(path==='/api/admin/nav-counts')return res.end('{}');
  if(path==='/api/site/meta')return res.end(JSON.stringify({changelogVersion:null}));
  if(path==='/api/admin/providers'&&req.method==='GET')return res.end(JSON.stringify(data));
  if(path.endsWith('/test')&&req.method==='POST'){
   const id=path.split('/')[4]!;
   requests.push(id);
   if(id===first.id)await firstGate;
   return res.end(JSON.stringify(id===first.id
    ?{status:'verified',elapsedMs:450,detail:'Valid chat response'}
    :{status:'failed',elapsedMs:35,detail:'Provider HTTP 429'}));
  }
  res.statusCode=404;res.end('{}');
 });
 const web=await startWebServer(api);
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  browser=await chromium.launch({channel:'chromium'});
  const page=await browser.newPage();
  await page.goto(web.origin+'/admin/models');
  const a=page.locator('tr').filter({hasText:'nvidia/first'});
  const b=page.locator('tr').filter({hasText:'nvidia/second'});
  await a.getByRole('button',{name:'测试',exact:true}).click();
  await expect(a.getByRole('button',{name:'测试中…'})).toBeVisible();
  await expect(b.getByRole('button',{name:'测试',exact:true})).toBeEnabled();
  await expect(b.getByRole('button',{name:'编辑'})).toBeEnabled();
  await expect(b.getByRole('button',{name:'删除'})).toBeEnabled();
  await b.getByRole('button',{name:'测试',exact:true}).click();
  await expect(b.getByRole('status')).toContainText('Provider HTTP 429');
  await expect(a.getByRole('button',{name:'测试中…'})).toBeVisible();
  releaseFirst();
  await expect(a.getByRole('status')).toContainText('Valid chat response');
  await expect(b.getByRole('status')).toContainText('Provider HTTP 429');
  assert.deepEqual([...requests].sort(),[first.id,second.id].sort());
 }finally{releaseFirst();await browser?.close();await web.stop();}
});
