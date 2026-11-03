import assert from "node:assert/strict";
import {createServer} from "node:http";
import {test} from "node:test";
import {chromium,expect} from "@playwright/test";
import {startWebServer} from "./web-server.ts";
import type {ProviderConnection,ProviderManagement,RegisteredModel} from "@aihot/contracts/providers";

test("connections, models and workflow bindings stay in independent CRUD pages",async()=>{
 const data:ProviderManagement={providers:[],models:[],protocols:["openai-compatible","anthropic-compatible"],workflows:[]};
 const writes:Array<{method:string;path:string;body:Record<string,any>}>=[];
 const api=createServer(async(req,res)=>{
  const path=new URL(req.url!,"http://api.local").pathname;
  res.setHeader("content-type","application/json");
  if(path==="/api/admin/me")return res.end(JSON.stringify({name:"Admin test",csrf:"fixture",dev:true}));
  if(path==="/api/admin/nav-counts")return res.end("{}");
  if(path==="/api/site/meta")return res.end(JSON.stringify({changelogVersion:null}));
  if(path==="/api/admin/providers"&&req.method==="GET")return res.end(JSON.stringify(data));
  let raw="";for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):{};
  writes.push({method:req.method!,path,body});
  if(path==="/api/admin/providers"&&req.method==="POST"){
   const c:ProviderConnection={id:"11111111-1111-4111-a111-111111111111",name:body.name,vendor:body.vendor,
    protocol:body.protocol,baseUrl:body.baseUrl,timeoutMs:body.timeoutMs,enabled:body.enabled,
    policy:"none",credential:{configured:true},version:1,updatedAt:new Date().toISOString()};
   data.providers.push(c);return res.end(JSON.stringify(c));
  }
  if(path.startsWith("/api/admin/providers/")&&req.method==="PATCH"){
   const c=data.providers[0]!;
   Object.assign(c,{vendor:body.vendor,baseUrl:body.baseUrl,protocol:body.protocol,enabled:body.enabled,
    version:c.version+1});
   return res.end(JSON.stringify(c));
  }
  if(path.startsWith("/api/admin/providers/")&&req.method==="DELETE"){
   if(data.models.length){res.statusCode=409;return res.end(JSON.stringify({detail:"Models exist"}));}
   data.providers.splice(0);return res.end(JSON.stringify({deleted:true}));
  }
  if(path.endsWith("/models")&&req.method==="POST"){
   const {reason:_,...input}=body;
   const model:RegisteredModel={...input,id:"22222222-2222-4222-a222-222222222222",
    version:1,checks:[],updatedAt:new Date().toISOString(),upstreamMetadata:{},
    routing:{eligibleCapabilities:[],reasons:[]}};
   data.models.push(model);return res.end(JSON.stringify(model));
  }
  if(path.endsWith("/test")&&req.method==="POST"){
   return res.end(JSON.stringify({status:"verified",elapsedMs:25,detail:"OK"}));
  }
  if(path.startsWith("/api/admin/provider-models/")&&req.method==="PATCH"){
   const m=data.models[0]!;
   const {reason:_,version:__,...input}=body;Object.assign(m,input,{version:m.version+1});
   return res.end(JSON.stringify(m));
  }
  if(path.startsWith("/api/admin/provider-models/")&&req.method==="DELETE"){
   data.models.splice(0);return res.end(JSON.stringify({deleted:true}));
  }
  res.statusCode=404;res.end("{}");
 });
 const web=await startWebServer(api);
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  browser=await chromium.launch({channel:"chromium"});
  const page=await browser.newPage();
  await page.goto(web.origin+"/admin/connections");
  await expect(page.getByRole("heading",{name:"厂商连接",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"＋ 新增连接"})).toBeVisible();
  await expect(page.getByRole("button",{name:"＋ 新增模型"})).toHaveCount(0);
  await page.getByRole("button",{name:"＋ 新增连接"}).click();
  const connection=page.getByRole("dialog");
  await connection.getByLabel("API Key").fill("test-secret-not-for-dom");
  await connection.getByRole("button",{name:"保存连接"}).click();
  await expect(connection).toHaveCount(0);
  assert.equal(data.providers.length,1);
  assert.equal(data.models.length,0,"saving a provider never auto-creates models");
  const create=writes.find(x=>x.path==="/api/admin/providers"&&x.method==="POST")!;
  assert.equal(create.body.vendor,"deepseek");
  assert.equal(create.body.baseUrl,"https://api.deepseek.com");
  assert.equal(create.body.credential.action,"replace");
  assert.ok(!(await page.locator("body").innerText()).includes("test-secret-not-for-dom"));
  await page.getByRole("button",{name:"编辑"}).click();
  await expect(page.getByRole("dialog").getByLabel("API Key")).toHaveValue("");
  await page.getByRole("dialog").getByRole("button",{name:"保存连接"}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(writes.filter(x=>x.method==="PATCH"&&x.path.includes("/providers/")).at(-1)!.body.credential.action,"keep");

  await page.goto(web.origin+"/admin/models");
  await expect(page.getByRole("heading",{name:"模型管理"})).toBeVisible();
  await expect(page.getByRole("button",{name:"＋ 新增连接"})).toHaveCount(0);
  await page.getByRole("button",{name:"＋ 新增模型"}).click();
  const model=page.getByRole("dialog");
  await expect(model.getByLabel("厂商连接")).toHaveValue(data.providers[0]!.id);
  await model.getByLabel("模型 ID").fill("deepseek-chat");
  await model.getByRole("button",{name:"保存模型"}).click();
  await expect(model).toHaveCount(0);
  assert.equal(data.models.length,1);
  assert.equal(data.models[0]!.providerId,data.providers[0]!.id);
  await page.getByRole("button",{name:"测试",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"25 ms · OK"})).toBeVisible();
  assert.equal(data.models[0]!.routeEnabled,false,"testing must not mutate a model or workflow binding");
  assert.equal(writes.filter(x=>x.path.endsWith("/test")).length,1);
  await page.getByRole("button",{name:"编辑"}).click();
  await page.getByRole("dialog").getByLabel("模型 ID").fill("deepseek-chat-edited");
  await page.getByRole("dialog").getByRole("button",{name:"保存模型"}).click();
  await expect(page.getByText("deepseek-chat-edited",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"删除"}).click();
  await page.getByRole("dialog").getByRole("button",{name:"确认删除"}).click();
  await expect(page.getByText("deepseek-chat-edited",{exact:true})).toHaveCount(0);
  await page.goto(web.origin+"/admin/connections");
  await page.getByRole("button",{name:"删除"}).click();
  await page.getByRole("dialog").getByRole("button",{name:"确认删除"}).click();
  assert.equal(data.providers.length,0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole("heading",{name:"厂商连接",exact:true})).toBeVisible();
 }finally{await browser?.close();await web.stop();}
});

test("model rows without probe show actionable test feedback without modifying other models",async()=>{
 const data:ProviderManagement={
  providers:[{id:"11111111-1111-4111-a111-111111111111",name:"Custom",vendor:"custom",
   protocol:"openai-compatible",baseUrl:"https://api.example.com/v1",timeoutMs:60000,
   enabled:true,policy:"none",credential:{configured:true},version:1,updatedAt:new Date().toISOString()}],
  models:[{id:"22222222-2222-4222-a222-222222222222",providerId:"11111111-1111-4111-a111-111111111111",
   modelId:"custom-model",adapter:"special",endpointOverride:null,timeoutOverrideMs:null,capabilities:[],
   requestDefaults:{},probeSpec:null,stream:false,complexity:"medium",documentationUrl:null,
   notes:null,enabled:false,routeEnabled:false,upstreamMetadata:{},routing:{eligibleCapabilities:[],reasons:[]},
   version:1,updatedAt:new Date().toISOString(),checks:[]}],
  protocols:["openai-compatible"],workflows:[]
 };
 const api=createServer((req,res)=>{
  res.setHeader("content-type","application/json");
  const path=new URL(req.url!,"http://api.local").pathname;
  if(path==="/api/admin/me")return res.end(JSON.stringify({name:"Test",csrf:"fixture",dev:true}));
  if(path==="/api/admin/nav-counts")return res.end("{}");
  if(path==="/api/site/meta")return res.end(JSON.stringify({changelogVersion:null}));
  if(path==="/api/admin/providers")return res.end(JSON.stringify(data));
  res.statusCode=404;res.end("{}");
 });
 const web=await startWebServer(api);
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  browser=await chromium.launch({channel:"chromium"});
  const page=await browser.newPage();
  await page.goto(web.origin+"/admin/models");
  await page.getByRole("button",{name:"测试",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"未配置测试请求"})).toBeVisible();
  await expect(page.getByText("custom-model",{exact:true})).toBeVisible();
 }finally{await browser?.close();await web.stop();}
});
