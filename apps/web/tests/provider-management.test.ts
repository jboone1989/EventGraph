import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {chromium,expect} from '@playwright/test';
import {startWebServer} from './web-server.ts';
import type {ProviderManagement} from '@aihot/contracts/providers';

test('provider UI supports generic connection creation, field errors and mobile manual model creation',async()=>{
 const data:ProviderManagement={providers:[],models:[],protocols:['openai-compatible'],workflows:[]};
 const writes:Array<{path:string;body:Record<string,unknown>}>=[];
 const api=createServer(async(req,res)=>{
  const path=new URL(req.url!,'http://api.local').pathname;res.setHeader('content-type','application/json');
  if(path==='/api/admin/me')return res.end(JSON.stringify({name:'Provider test',csrf:'fixture',dev:true}));
  if(path==='/api/admin/nav-counts')return res.end('{}');
  if(path==='/api/site/meta')return res.end(JSON.stringify({changelogVersion:null}));
  if(path==='/api/admin/providers'&&req.method==='GET')return res.end(JSON.stringify(data));
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
  const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};writes.push({path,body});
  if(path==='/api/admin/providers'&&req.method==='POST') {
   if(body.baseUrl==='bad') {res.statusCode=400;return res.end(JSON.stringify({detail:'Invalid address',fieldErrors:{baseUrl:'Enter a complete HTTPS API URL'}}))}
   const c={id:'11111111-1111-4111-a111-111111111111',name:body.name,vendor:body.vendor,protocol:'openai-compatible' as const,baseUrl:body.baseUrl,timeoutMs:body.timeoutMs,enabled:body.enabled,policy:'none' as const,credential:{configured:true},version:1,updatedAt:new Date().toISOString()};
   data.providers.push(c);return res.end(JSON.stringify(c));
  }
  if(path.endsWith('/models')&&req.method==='POST')return res.end(JSON.stringify({id:'new-model'}));
  res.statusCode=404;res.end('{}');
 });
 const web=await startWebServer(api);let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try {
  browser=await chromium.launch({channel:'chromium'});
  const page=await browser.newPage();await page.goto(web.origin+'/admin/models');
  await page.getByRole('button',{name:'添加连接',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('连接名称').fill('DeepSeek custom');await dialog.getByLabel('厂商标签').fill('deepseek');
  await dialog.getByLabel('API Base URL（完整路径前缀）').fill('bad');
  await dialog.getByLabel('凭据操作').selectOption('replace');await dialog.getByLabel('新 API Key').fill('new-secret-value');
  await dialog.getByLabel('修改原因').fill('New vendor');await dialog.getByRole('button',{name:'保存',exact:true}).click();
  await expect(dialog.getByText('Enter a complete HTTPS API URL',{exact:true})).toBeVisible();
  await dialog.getByLabel('API Base URL（完整路径前缀）').fill('https://api.deepseek.example/custom/v4');
  await dialog.getByRole('button',{name:'保存',exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(page.getByText('DeepSeek custom',{exact:true})).toBeVisible();
  assert.equal((writes.at(-1)!.body.credential as {action:string}).action,'replace');
  assert.ok(!(await page.locator('body').innerText()).includes('new-secret-value'));
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'手动添加模型',exact:true}).click();
  await page.getByRole('dialog').getByLabel('上游模型 ID').fill('vendor-independent-name');
  await page.getByRole('dialog').getByLabel('vision',{exact:true}).check();
  await page.getByRole('dialog').getByLabel('修改原因').fill('Manual import without discovery');
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal(writes.at(-1)!.body.modelId,'vendor-independent-name');
  assert.deepEqual(writes.at(-1)!.body.capabilities,['text','vision']);
  await page.screenshot({path:'/tmp/eventgraph-provider-mobile.png',fullPage:true});
 } catch(error){console.error(error);throw error;} finally {await browser?.close();await web.stop();}
});
