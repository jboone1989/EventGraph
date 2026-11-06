import assert from "node:assert/strict";
import {createServer} from "node:http";
import {test} from "node:test";
import {chromium,expect} from "@playwright/test";
import {startWebServer} from "./web-server.ts";
import type {ProviderConnection,ProviderManagement,RegisteredModel} from "@aihot/contracts/providers";

test("same-name models on separate Groq connections remain distinguishable and searchable",async()=>{
 const firstId="11111111-1111-4111-a111-111111111111";
 const secondId="22222222-2222-4222-a222-222222222222";
 const modelA="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
 const modelB="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
 const connection=(id:string,name:string):ProviderConnection=>({
  id,name,vendor:"groq",protocol:"openai-compatible",baseUrl:"https://api.groq.com/openai/v1",
  timeoutMs:60000,enabled:true,policy:"none",credential:{configured:true},version:1,
  updatedAt:new Date().toISOString()
 });
 const model=(id:string,providerId:string):RegisteredModel=>({
  id,providerId,modelId:"openai/gpt-oss-120b",adapter:"chat",endpointOverride:null,timeoutOverrideMs:null,
  capabilities:["text"],requestDefaults:{},probeSpec:null,stream:false,complexity:"medium",billing:"free",
  documentationUrl:null,notes:null,enabled:true,routeEnabled:true,upstreamMetadata:{},
  routing:{eligibleCapabilities:["text"],reasons:[]},checks:[],version:1,updatedAt:new Date().toISOString()
 });
 const data:ProviderManagement={
  providers:[connection(firstId,"Groq-A"),connection(secondId,"Groq-B")],
  models:[model(modelA,firstId),model(modelB,secondId)],
  protocols:["openai-compatible"],workflows:[]
 };
 const api=createServer(async(req,res)=>{
  const url=new URL(req.url!,"http://test.local");
  res.setHeader("content-type","application/json");
  if(url.pathname==="/api/admin/me")return res.end(JSON.stringify({name:"Test",csrf:"fixture",dev:true}));
  if(url.pathname==="/api/admin/nav-counts")return res.end("{}");
  if(url.pathname==="/api/site/meta")return res.end(JSON.stringify({changelogVersion:null}));
  if(url.pathname==="/api/admin/providers"&&req.method==="GET")return res.end(JSON.stringify(data));
  if(url.pathname==="/api/admin/providers/"+firstId&&req.method==="PATCH"){
   let raw="";for await(const chunk of req)raw+=chunk;
   const input=JSON.parse(raw) as {name:string};
   data.providers[0]={...data.providers[0]!,name:input.name,version:2};
   return res.end(JSON.stringify(data.providers[0]));
  }
  res.statusCode=404;res.end("{}");
 });
 const web=await startWebServer(api);
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try {
  browser=await chromium.launch({channel:"chromium"});
  const page=await browser.newPage();
  await page.goto(web.origin+"/admin/models");
  await expect(page.getByText(modelA,{exact:true})).toBeVisible();
  await expect(page.getByText(modelB,{exact:true})).toBeVisible();
  await expect(page.getByText("Groq-A · Groq",{exact:true})).toBeVisible();
  await expect(page.getByText("Groq-B · Groq",{exact:true})).toBeVisible();
  const search=page.getByLabel("搜索模型");
  await search.fill("Groq-B");
  await expect(page.getByText(modelB,{exact:true})).toBeVisible();
  await expect(page.getByText(modelA,{exact:true})).toHaveCount(0);
  await search.fill(modelA);
  await expect(page.getByText(modelA,{exact:true})).toBeVisible();
  await expect(page.getByText(modelB,{exact:true})).toHaveCount(0);
  await search.fill("");
  await page.getByRole("button",{name:"＋ 新增模型"}).click();
  const options=await page.getByRole("dialog").getByLabel("厂商连接").locator("option").allTextContents();
  assert.ok(options.some(x=>x.includes("Groq-A · Groq")));
  assert.ok(options.some(x=>x.includes("Groq-B · Groq")));
  await page.goto(web.origin+"/admin/connections");
  await expect(page.getByText("Groq-A",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"编辑"}).first().click();
  await page.getByRole("dialog").getByLabel("连接名称").fill("Groq-Production");
  await page.getByRole("dialog").getByRole("button",{name:"保存连接"}).click();
  assert.equal(data.providers[0]!.name,"Groq-Production");
  assert.equal(data.providers[1]!.name,"Groq-B");
 } finally {await browser?.close();await web.stop();}
});
