import assert from "node:assert/strict";
import {createServer} from "node:http";
import {test} from "node:test";
import {chromium,expect} from "@playwright/test";
import {startWebServer} from "./web-server.ts";
import type {ProviderConnection,ProviderManagement} from "@aihot/contracts/providers";

test("model import uses each configured connection without squeezing the page heading",async()=>{
 const entry=(id:number,name:string,vendor:string):ProviderConnection=>({
  id:"11111111-1111-4111-a111-"+String(id).padStart(12,"0"),name,vendor,
  protocol:"openai-compatible",baseUrl:"https://api.example.com/v1",
  timeoutMs:60000,enabled:true,policy:"none",credential:{configured:true},
  version:1,updatedAt:new Date().toISOString()
 });
 const providers=[
  entry(1,"Cloudflare","cloudflare"),
  entry(2,"groq","groq"),
  entry(3,"groq-03","groq"),
  entry(4,"groq-2","groq"),
  entry(5,"OpenRouter","openrouter"),
  entry(6,"Another connection","custom")
 ];
 const data:ProviderManagement={providers,models:[],protocols:["openai-compatible"],workflows:[]};
 const requests:Array<{path:string;body:Record<string,unknown>}>=[];
 const api=createServer(async(req,res)=>{
  const path=new URL(req.url!,"http://test.local").pathname;
  res.setHeader("content-type","application/json");
  if(path==="/api/admin/me")return res.end(JSON.stringify({name:"Test",csrf:"fixture",dev:true}));
  if(path==="/api/admin/nav-counts")return res.end("{}");
  if(path==="/api/site/meta")return res.end(JSON.stringify({changelogVersion:null}));
  if(path==="/api/admin/providers"&&req.method==="GET")return res.end(JSON.stringify(data));
  if(req.method==="POST"&&path.includes("/sync")){
   let raw="";for await(const chunk of req)raw+=chunk;
   requests.push({path,body:raw?JSON.parse(raw) as Record<string,unknown>:{}});
   if(path.endsWith("/openrouter-free/sync"))return res.end(JSON.stringify({
    catalogTotal:100,freeCatalog:5,chat:4,embedding:1,other:0,invalid:0,
    total:5,added:5,noLongerFree:0,removed:0
   }));
   return res.end(JSON.stringify({total:3,added:3,existing:0}));
  }
  res.statusCode=404;res.end("{}");
 });
 const web=await startWebServer(api);
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  browser=await chromium.launch({channel:"chromium"});
  const page=await browser.newPage({viewport:{width:1530,height:860}});
  page.on("dialog",dialog=>void dialog.accept());
  await page.goto(web.origin+"/admin/models");
  const heading=page.getByRole("heading",{name:"模型管理",exact:true});
  await expect(heading).toBeVisible();
  const bounds=await heading.boundingBox();
  assert.ok(bounds&&bounds.width>=90,"page title must not be squeezed into a one-character column");
  const select=page.getByLabel("导入模型的厂商连接");
  await expect(select.locator("option")).toHaveCount(providers.length);
  const optionLabels=await select.locator("option").allTextContents();
  for(const connection of providers)assert.ok(optionLabels.some(label=>label.includes(connection.name+" · "+connection.vendor)));
  assert.equal(optionLabels.filter(label=>label.includes(" · groq · ")).length,3,"all three Groq accounts must be selectable");
  assert.equal(await page.getByRole("button",{name:/^导入 groq(?:-03|-2)? 免费模型$/}).count(),0,"no button per connection");
  const groqConnections=providers.filter(p=>p.vendor==="groq");
  for(const [index,connection] of groqConnections.entries()){
   await select.selectOption(connection.id);
   await page.getByRole("button",{name:"导入所选连接的免费模型"}).click();
   await expect(page.getByRole("status").filter({hasText:connection.name+"：候选 3 个"})).toBeVisible();
   assert.equal(requests[index]!.path,"/api/admin/providers/"+connection.id+"/free-catalog/sync");
   assert.deepEqual(requests[index]!.body,{confirmFreeTier:true});
  }
  const previousRequests=requests.length;
  await select.selectOption(providers[4]!.id);
  await page.getByRole("button",{name:"导入所选连接的免费模型"}).click();
  await expect(page.getByRole("status").filter({hasText:"OpenRouter：官方目录"})).toBeVisible();
  assert.equal(requests[previousRequests]!.path,"/api/admin/providers/"+providers[4]!.id+"/openrouter-free/sync");
  await select.selectOption(providers[5]!.id);
  await expect(page.getByRole("button",{name:"导入所选连接的免费模型"})).toBeDisabled();
  await expect(page.getByText("当前连接不支持一键导入，可手动新增模型。")).toBeVisible();
  assert.equal(requests.length,previousRequests+1,"unknown vendor must never send a sync request");
  await page.setViewportSize({width:768,height:844});
  const tabletBounds=await heading.boundingBox();
  assert.ok(tabletBounds&&tabletBounds.width>=90,"tablet title must remain horizontal");
  await page.setViewportSize({width:390,height:844});
  await expect(heading).toBeVisible();
  await expect(select).toBeVisible();
  const mobileBounds=await heading.boundingBox();
  assert.ok(mobileBounds&&mobileBounds.width>=90,"mobile title must remain horizontal");
  providers.push(entry(7,"groq-4","groq"));
  await page.reload();
  await expect(page.getByLabel("导入模型的厂商连接").locator("option")).toHaveCount(7);
  providers.splice(0,providers.length);
  await page.reload();
  await expect(page.getByRole("button",{name:"导入所选连接的免费模型"})).toBeDisabled();
  await expect(page.getByText(/尚未配置厂商连接/)).toBeVisible();
 }finally{await browser?.close();await web.stop();}
});
