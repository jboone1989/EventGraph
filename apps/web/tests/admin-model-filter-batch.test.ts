import assert from "node:assert/strict";
import {createServer} from "node:http";
import {test} from "node:test";
import {chromium,expect} from "@playwright/test";
import {startWebServer} from "./web-server.ts";
import type {ProviderManagement,RegisteredModel} from "@aihot/contracts/providers";

test("model filters, paging and batch tests reuse independent model probes",async()=>{
 const providerId="11111111-1111-4111-a111-111111111111";
 const otherId="11111111-1111-4111-a111-111111111112";
 const models:RegisteredModel[]=Array.from({length:26},(_,i)=>({
  id:`22222222-2222-4222-a222-${String(i+1).padStart(12,"0")}`,
  providerId:i===25?otherId:providerId,modelId:`demo-model-${String(i+1).padStart(2,"0")}`,
  adapter:i===25?"embedding":"chat",endpointOverride:null,timeoutOverrideMs:null,
  capabilities:i===25?["embedding"]:["text"],requestDefaults:{},
  probeSpec:i===24?null:{capability:i===25?"embedding":"text",body:{messages:[{role:"user",content:"OK"}]},response:"chat"},
  stream:false,complexity:i%2?"light":"medium",billing:i===25?"paid":"free",
  documentationUrl:null,notes:null,enabled:i%3!==0,routeEnabled:false,upstreamMetadata:{},
  checks:[],routing:{eligibleCapabilities:[],reasons:[]},version:1,updatedAt:new Date().toISOString()
 }));
 const data:ProviderManagement={providers:[
  {id:providerId,name:"Groq primary",vendor:"groq",protocol:"openai-compatible",baseUrl:"https://api.groq.com/openai/v1",
   timeoutMs:60000,enabled:true,policy:"none",credential:{configured:true},version:1,updatedAt:new Date().toISOString()},
  {id:otherId,name:"Other paid",vendor:"custom",protocol:"openai-compatible",baseUrl:"https://example.com/v1",
   timeoutMs:60000,enabled:true,policy:"none",credential:{configured:true},version:1,updatedAt:new Date().toISOString()}
 ],models,protocols:["openai-compatible"],workflows:[]};
 let active=0,maxActive=0;
 const requests:string[]=[];
 const api=createServer(async(req,res)=>{
  const path=new URL(req.url!,"http://api.local").pathname;
  res.setHeader("content-type","application/json");
  if(path==="/api/admin/me")return res.end(JSON.stringify({name:"Admin",csrf:"fixture",dev:true}));
  if(path==="/api/admin/nav-counts")return res.end("{}");
  if(path==="/api/site/meta")return res.end(JSON.stringify({changelogVersion:null}));
  if(path==="/api/admin/providers"&&req.method==="GET")return res.end(JSON.stringify(data));
  if(path.endsWith("/test")&&req.method==="POST"){
   const id=path.split("/")[4]!;
   requests.push(id);active++;maxActive=Math.max(maxActive,active);
   await new Promise(resolve=>setTimeout(resolve,30));
   active--;
   return res.end(JSON.stringify({status:id===models[1]!.id?"failed":"verified",elapsedMs:30,
    detail:id===models[1]!.id?"Provider HTTP 429":"Valid chat response"}));
  }
  res.statusCode=404;res.end("{}");
 });
 const web=await startWebServer(api);
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  browser=await chromium.launch({channel:"chromium"});
  const page=await browser.newPage();
  await page.goto(web.origin+"/admin/models");
  await expect(page.getByText("匹配 26 / 共 26 个模型")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await page.getByRole("button",{name:"下一页"}).click();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(page.getByText("demo-model-26")).toBeVisible();
  await page.getByLabel("费用").selectOption("free");
  await expect(page.getByText("匹配 25 / 共 26 个模型")).toBeVisible();
  await expect(page.getByText("第 1 / 2 页")).toBeVisible();
  await page.getByLabel("厂商连接").selectOption(otherId);
  await expect(page.getByText("匹配 0 / 共 26 个模型")).toBeVisible();
  await page.getByRole("button",{name:"清空筛选"}).click();
  await page.getByLabel("费用").selectOption("paid");
  page.once("dialog",dialog=>dialog.dismiss());
  await page.getByRole("button",{name:/一键测试筛选结果/}).click();
  assert.equal(requests.length,0,"cancel paid confirmation without network requests");
  await page.getByRole("button",{name:"清空筛选"}).click();
  await page.getByLabel("费用").selectOption("free");
  await page.getByRole("button",{name:/一键测试筛选结果/}).click();
  await expect(page.getByText(/批量测试：25\/25/)).toBeVisible({timeout:15000});
  assert.equal(requests.length,24,"test all filtered rows across pages, skip missing probe");
  assert.ok(maxActive<=2,`max concurrent probes was ${maxActive}`);
  await expect(page.getByText(/通过 23 · 失败 1 · 跳过 1/)).toBeVisible();
  await page.getByLabel("测试结果").selectOption("failed");
  await expect(page.getByText("匹配 1 / 共 26 个模型")).toBeVisible();
  await expect(page.getByText("demo-model-02")).toBeVisible();
  await page.getByRole("button",{name:"清空筛选"}).click();
  await page.getByLabel("模型类型").selectOption("embedding");
  await page.getByLabel("模型档位").selectOption("light");
  await expect(page.getByText("匹配 1 / 共 26 个模型")).toBeVisible();
  await page.getByLabel("启用状态").selectOption("disabled");
  await expect(page.getByText("匹配 0 / 共 26 个模型")).toBeVisible();
 }finally{await browser?.close();await web.stop();}
});
