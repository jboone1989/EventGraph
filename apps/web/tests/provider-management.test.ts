import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {chromium,expect} from '@playwright/test';
import {startWebServer} from './web-server.ts';
import type {ProviderManagement,RegisteredModel} from '@aihot/contracts/providers';

test('model admin is a single CRUD list with a test action on each row',async()=>{
 const data:ProviderManagement={providers:[],models:[],protocols:['openai-compatible'],workflows:[]};
 const writes:Array<{method:string;path:string;body:Record<string,unknown>}>=[];

 const api=createServer(async(req,res)=>{
  const path=new URL(req.url!,'http://api.local').pathname;
  res.setHeader('content-type','application/json');
  if(path==='/api/admin/me')return res.end(JSON.stringify({name:'Model test',csrf:'fixture',dev:true}));
  if(path==='/api/admin/nav-counts')return res.end('{}');
  if(path==='/api/site/meta')return res.end(JSON.stringify({changelogVersion:null}));
  if(path==='/api/admin/providers'&&req.method==='GET')return res.end(JSON.stringify(data));

  const chunks:Buffer[]=[];
  for await(const chunk of req)chunks.push(Buffer.from(chunk));
  const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  writes.push({method:req.method!,path,body});
  if(path==='/api/admin/providers'&&req.method==='POST'){
   const connection={
    id:'11111111-1111-4111-a111-111111111111',name:body.name,vendor:body.vendor,
    protocol:body.protocol,baseUrl:body.baseUrl,timeoutMs:body.timeoutMs,
    enabled:true,policy:'none' as const,credential:{configured:true},version:1,updatedAt:new Date().toISOString()
   };
   data.providers.push(connection);
   return res.end(JSON.stringify(connection));
  }
  if(path.endsWith('/models')&&req.method==='POST'){
   const {reason:_,...model}=body;
   const created={...model,id:'22222222-2222-4222-a222-222222222222',
    version:1,checks:[],updatedAt:new Date().toISOString(),
    upstreamMetadata:{},routing:{eligibleCapabilities:[],reasons:[]}} as RegisteredModel;
   data.models.push(created);
   return res.end(JSON.stringify(created));
  }
  if(path.endsWith('/test')&&req.method==='POST'){
   return res.end(JSON.stringify({status:'verified',elapsedMs:45,detail:'OK'}));
  }
  if(path.startsWith('/api/admin/provider-models/')&&req.method==='PATCH'){
   const {reason:_,version:__,...model}=body;
   data.models[0]={...data.models[0]!,...model,version:data.models[0]!.version+1};
   return res.end(JSON.stringify(data.models[0]));
  }
  if(path.startsWith('/api/admin/provider-models/')&&req.method==='DELETE'){
   data.models.splice(0,1);
   return res.end(JSON.stringify({ok:true}));
  }
  res.statusCode=404;res.end('{}');
 });

 const web=await startWebServer(api);
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try {
  browser=await chromium.launch({channel:'chromium'});
  const page=await browser.newPage();
  await page.goto(web.origin+'/admin/models');
  await expect(page.getByRole('button',{name:'新增模型'})).toBeVisible();
  await expect(page.getByRole('button',{name:'工作流路由'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'并发测试'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'添加连接'})).toHaveCount(0);

  await page.getByRole('button',{name:'新增模型'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('模型 ID').fill('z-ai/example-chat');
  await dialog.getByLabel('连接 ID').fill('nvidia-demo');
  await dialog.getByLabel('厂商',{exact:true}).selectOption('nvidia');
  await dialog.getByLabel('API Key').fill('secret-value');
  await expect(dialog.getByLabel('API Base URL')).toHaveValue('https://integrate.api.nvidia.com/v1');
  await dialog.getByRole('button',{name:'保存连接'}).click();
  await expect(dialog.getByText('连接 ID',{exact:true})).toHaveCount(0);
  assert.equal(data.models.length,0,'saving a connection must not create a model');
  await dialog.getByRole('button',{name:'保存模型'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('z-ai/example-chat',{exact:true})).toBeVisible();

  const connectionWrite=writes.find(w=>w.method==='POST'&&w.path==='/api/admin/providers');
  const modelWrite=writes.find(w=>w.method==='POST'&&w.path.endsWith('/models'));
  assert.ok(connectionWrite);
  assert.equal(connectionWrite.body.name,'nvidia-demo');
  assert.equal(connectionWrite.body.vendor,'nvidia');
  assert.equal(connectionWrite.body.protocol,'openai-compatible');
  assert.ok(modelWrite);
  assert.equal(modelWrite.path,'/api/admin/providers/11111111-1111-4111-a111-111111111111/models');
  assert.equal(modelWrite.body.modelId,'z-ai/example-chat');
  assert.deepEqual(modelWrite.body.capabilities,['text']);
  assert.ok(!(await page.locator('body').innerText()).includes('secret-value'));

  await page.getByRole('button',{name:'测试',exact:true}).click();
  await expect(page.getByText('通过',{exact:true}).first()).toBeVisible();
  assert.equal(writes.at(-1)!.path,'/api/admin/provider-models/22222222-2222-4222-a222-222222222222/test');
  assert.equal(writes.at(-1)!.body.capability,'text');

  await page.getByRole('button',{name:'查看'}).click();
  await expect(page.getByRole('dialog').getByLabel('模型 ID')).toBeDisabled();
  await page.getByRole('dialog').getByRole('button',{name:'关闭'}).click();

  await page.getByRole('button',{name:'编辑'}).click();
  await page.getByRole('dialog').getByLabel('启用模型').uncheck();
  await page.getByRole('dialog').getByRole('button',{name:'保存模型'}).click();
  await expect(page.getByText('停用',{exact:true})).toBeVisible();

  await page.getByRole('button',{name:'删除'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'确认删除'}).click();
  await expect(page.getByText('暂无模型，点击「新增模型」开始。')).toBeVisible();
  assert.equal(data.models.length,0);

  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('button',{name:'新增模型'})).toBeVisible();
 } finally {
  await browser?.close();
  await web.stop();
 }
});

test('models without a probe still show a per-row test button with actionable feedback',async()=>{
 const modelId='22222222-2222-4222-a222-222222222222';
 const data:ProviderManagement={
  providers:[{id:'11111111-1111-4111-a111-111111111111',name:'Custom',vendor:'custom',
   protocol:'openai-compatible',baseUrl:'https://api.example.com/v1',timeoutMs:60000,
   enabled:true,policy:'none',credential:{configured:true},version:1,updatedAt:new Date().toISOString()}],
  models:[{id:modelId,providerId:'11111111-1111-4111-a111-111111111111',modelId:'custom-model',
   adapter:'special',endpointOverride:null,timeoutOverrideMs:null,capabilities:[],
   requestDefaults:{},probeSpec:null,stream:false,complexity:'medium',
   documentationUrl:null,notes:null,enabled:false,routeEnabled:false,
   upstreamMetadata:{},routing:{eligibleCapabilities:[],reasons:[]},
   version:1,updatedAt:new Date().toISOString(),checks:[]}],
  protocols:['openai-compatible'],workflows:[{key:'summarize',label:'摘要',model:'',source:'env'}]
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
 try {
  browser=await chromium.launch({channel:'chromium'});
  const page=await browser.newPage();
  await page.goto(web.origin+'/admin/models');
  await page.getByRole('button',{name:'测试',exact:true}).click();
  await expect(page.locator('p[role="status"]')).toContainText('尚未配置测试请求');
  await expect(page.getByRole('button',{name:'工作流路由'})).toHaveCount(0);
 } finally {
  await browser?.close();
  await web.stop();
 }
});
