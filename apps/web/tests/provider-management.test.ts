import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {chromium,expect} from '@playwright/test';
import {startWebServer} from './web-server.ts';
import type {ProviderConnection,ProviderManagement,RegisteredModel} from '@aihot/contracts/providers';

test('provider-first setup saves credentials and models, then offers verified models to workflows',async()=>{
 const data:ProviderManagement={providers:[],models:[],protocols:['openai-compatible','anthropic-compatible'],workflows:[]};
 const writes:Array<{method:string;path:string;body:Record<string,any>}>=[];
 const api=createServer(async(req,res)=>{
  const path=new URL(req.url!,'http://api.local').pathname;
  res.setHeader('content-type','application/json');
  if(path==='/api/admin/me')return res.end(JSON.stringify({name:'Provider test',csrf:'fixture',dev:true}));
  if(path==='/api/admin/nav-counts')return res.end('{}');
  if(path==='/api/site/meta')return res.end(JSON.stringify({changelogVersion:null}));
  if(path==='/api/admin/providers'&&req.method==='GET')return res.end(JSON.stringify(data));
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):{};
  writes.push({method:req.method!,path,body});
  if(path==='/api/admin/providers'&&req.method==='POST'){
   const c:ProviderConnection={id:'11111111-1111-4111-a111-111111111111',name:body.name,vendor:body.vendor,
    protocol:body.protocol,baseUrl:body.baseUrl,timeoutMs:body.timeoutMs,enabled:body.enabled,
    policy:'none',credential:{configured:true},version:1,updatedAt:new Date().toISOString()};
   data.providers.push(c);return res.end(JSON.stringify(c));
  }
  if(path.startsWith('/api/admin/providers/')&&req.method==='PATCH'){
   const c=data.providers[0]!;
   Object.assign(c,{name:body.name,vendor:body.vendor,baseUrl:body.baseUrl,protocol:body.protocol,
    version:c.version+1});
   return res.end(JSON.stringify(c));
  }
  if(path.endsWith('/models')&&req.method==='POST'){
   const {reason:_,...input}=body;
   const ordinal=String(data.models.length+1).padStart(12,'0');
   const model:RegisteredModel={...input,id:'22222222-2222-4222-a222-'+ordinal,
    version:1,checks:[],updatedAt:new Date().toISOString(),
    upstreamMetadata:{},routing:{eligibleCapabilities:[],reasons:[]}};
   data.models.push(model);return res.end(JSON.stringify(model));
  }
  if(path.endsWith('/test')&&req.method==='POST'){
   return res.end(JSON.stringify({status:'verified',elapsedMs:25,detail:'OK'}));
  }
  if(path.startsWith('/api/admin/provider-models/')&&req.method==='PATCH'){
   const id=path.split('/')[4]!;
   const model=data.models.find(m=>m.id===id)!;
   const {reason:_,version:__,...patch}=body;
   Object.assign(model,patch,{version:model.version+1});
   if(patch.routeEnabled===true)model.routing={eligibleCapabilities:['text'],reasons:[]};
   return res.end(JSON.stringify(model));
  }
  if(path.startsWith('/api/admin/provider-models/')&&req.method==='DELETE'){
   const id=path.split('/')[4]!;
   data.models.splice(data.models.findIndex(m=>m.id===id),1);
   return res.end(JSON.stringify({deleted:true}));
  }
  res.statusCode=404;res.end('{}');
 });
 const web=await startWebServer(api);
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  browser=await chromium.launch({channel:'chromium'});
  const page=await browser.newPage();
  await page.goto(web.origin+'/admin/models');
  await expect(page.getByRole('button',{name:'＋ 新增厂商'})).toBeVisible();
  await page.getByRole('button',{name:'＋ 新增厂商'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel('API Base URL')).toBeHidden();
  await dialog.getByLabel('API Key').fill('example-secret-not-for-dom');
  await expect(dialog.getByLabel('模型 ID（每行一个）')).toHaveValue('deepseek-chat\ndeepseek-reasoner');
  await dialog.getByRole('button',{name:'保存厂商及模型'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('deepseek-chat',{exact:true})).toBeVisible();
  await expect(page.getByText('deepseek-reasoner',{exact:true})).toBeVisible();
  const created=writes.find(x=>x.path==='/api/admin/providers'&&x.method==='POST')!;
  assert.equal(created.body.name,'deepseek');
  assert.equal(created.body.vendor,'deepseek');
  assert.equal(created.body.protocol,'openai-compatible');
  assert.equal(created.body.baseUrl,'https://api.deepseek.com');
  assert.equal(created.body.credential.action,'replace');
  assert.deepEqual(writes.filter(x=>x.path.endsWith('/models')).map(x=>x.body.modelId),['deepseek-chat','deepseek-reasoner']);
  assert.ok(!(await page.locator('body').innerText()).includes('example-secret-not-for-dom'));

  await page.getByRole('button',{name:'配置厂商'}).click();
  await expect(page.getByRole('dialog').getByLabel('API Key')).toHaveValue('');
  await page.getByRole('dialog').getByRole('button',{name:'保存厂商及模型'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal(writes.filter(x=>x.path==='/api/admin/providers/11111111-1111-4111-a111-111111111111')
   .at(-1)!.body.credential.action,'keep');

  await page.getByRole('button',{name:'测试',exact:true}).first().click();
  await expect(page.getByText('可用于工作流',{exact:true}).first()).toBeVisible();
  assert.equal(data.models[0]!.routeEnabled,true);
  assert.equal(writes.filter(x=>x.path.includes('/test')).at(-1)!.body.capability,'text');

  await page.getByRole('button',{name:'＋ 添加模型'}).click();
  await page.getByRole('dialog').getByLabel('模型 ID').fill('deepseek-extra');
  await page.getByRole('dialog').getByRole('button',{name:'保存模型'}).click();
  await expect(page.getByText('deepseek-extra',{exact:true})).toBeVisible();

  await page.getByRole('button',{name:'编辑'}).first().click();
  await page.getByRole('dialog').getByLabel('启用模型').uncheck();
  await page.getByRole('dialog').getByRole('button',{name:'保存模型'}).click();
  await expect(page.getByText('停用',{exact:true}).first()).toBeVisible();

  await page.getByRole('button',{name:'删除'}).last().click();
  await page.getByRole('dialog').getByRole('button',{name:'确认删除'}).click();
  await expect(page.getByText('deepseek-extra',{exact:true})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('link',{name:'工作流模型绑定'})).toBeVisible();
 }finally{await browser?.close();await web.stop();}
});

test('a model without a probe still exposes test with actionable feedback',async()=>{
 const modelId='22222222-2222-4222-a222-222222222222';
 const data:ProviderManagement={
  providers:[{id:'11111111-1111-4111-a111-111111111111',name:'Custom',vendor:'custom',
   protocol:'openai-compatible',baseUrl:'https://api.example.com/v1',timeoutMs:60000,
   enabled:true,policy:'none',credential:{configured:true},version:1,updatedAt:new Date().toISOString()}],
  models:[{id:modelId,providerId:'11111111-1111-4111-a111-111111111111',modelId:'custom-model',
   adapter:'special',endpointOverride:null,timeoutOverrideMs:null,capabilities:[],
   requestDefaults:{},probeSpec:null,stream:false,complexity:'medium',documentationUrl:null,
   notes:null,enabled:false,routeEnabled:false,upstreamMetadata:{},
   routing:{eligibleCapabilities:[],reasons:[]},version:1,updatedAt:new Date().toISOString(),checks:[]}],
  protocols:['openai-compatible'],workflows:[]
 };
 const api=createServer((req,res)=>{
  res.setHeader('content-type','application/json');
  const path=new URL(req.url!,'http://api.local').pathname;
  if(path==='/api/admin/me')return res.end(JSON.stringify({name:'Model test',csrf:'fixture',dev:true}));
  if(path==='/api/admin/nav-counts')return res.end('{}');
  if(path==='/api/site/meta')return res.end(JSON.stringify({changelogVersion:null}));
  if(path==='/api/admin/providers')return res.end(JSON.stringify(data));
  res.statusCode=404;res.end('{}');
 });
 const web=await startWebServer(api);
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  browser=await chromium.launch({channel:'chromium'});
  const page=await browser.newPage();
  await page.goto(web.origin+'/admin/models');
  await page.getByRole('button',{name:'测试',exact:true}).click();
  await expect(page.locator('p[role="status"]')).toContainText('尚未配置测试请求');
  await expect(page.getByText('custom-model',{exact:true})).toBeVisible();
 }finally{await browser?.close();await web.stop();}
});
