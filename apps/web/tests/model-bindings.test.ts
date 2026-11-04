import assert from "node:assert/strict";
import {createServer} from "node:http";
import {test} from "node:test";
import {chromium,expect} from "@playwright/test";
import type {AdminModelBindings} from "@aihot/contracts/admin";
import {startWebServer} from "./web-server.ts";

test("workflow bindings list new models, gate unverified choices, and save per-stage",async()=>{
 const modelKey="model:22222222-2222-4222-a222-222222222222";
 const data:AdminModelBindings={
  steps:[{key:"prefilter",label:"精选预筛（宽召回）",vision:false,
   current:{model:"default",source:"default"}}],
  choices:[],
 };
 let failure=false;
 const writes:Array<{path:string;body:{model:string|null;reason:string}}>= [];
 const api=createServer(async(req,res)=>{
  const path=new URL(req.url!,"http://api.local").pathname;
  res.setHeader("content-type","application/json");
  if(path==="/api/admin/me")return res.end(JSON.stringify({name:"Model test",csrf:"fixture",dev:true}));
  if(path==="/api/admin/nav-counts")return res.end("{}");
  if(path==="/api/site/meta")return res.end(JSON.stringify({changelogVersion:null}));
  if(path==="/api/admin/model-bindings")return res.end(JSON.stringify(data));
  if(path==="/api/admin/models/prefilter"&&req.method==="POST"){
   let body="";for await(const c of req)body+=c;
   const parsed=JSON.parse(body) as {model:string|null;reason:string};
   writes.push({path,body:parsed});
   if(failure){res.statusCode=409;return res.end(JSON.stringify({detail:"模型暂不可用"}));}
   data.steps[0]!.current=parsed.model?
    {model:parsed.model,source:"admin"}:{model:"",source:"default"};
   return res.end(JSON.stringify({after:data.steps[0]!.current}));
  }
  res.statusCode=404;res.end("{}");
 });
 const web=await startWebServer(api);
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  browser=await chromium.launch({channel:"chromium"});
  const page=await browser.newPage();
  await page.goto(web.origin+"/admin/model-bindings");
  const picker=page.getByRole("combobox",{name:"为精选预筛选择模型"});
  await expect(page.getByText("工作流模型绑定",{exact:true}).first()).toBeVisible();
  await expect(picker).toHaveValue("");
  await expect(picker.locator('option[value="default"]')).toHaveCount(0);
  await expect(picker.locator('option')).toHaveCount(1);
  data.choices.push({key:modelKey,modelId:"fresh-model",provider:"New provider",
   adapter:"chat",vision:false});
  await page.reload();
  await expect(picker.locator('option[value="'+modelKey+'"]')).toBeEnabled();
  await expect(picker.locator('option[value="'+modelKey+'"]')).toContainText("fresh-model");
  await picker.selectOption(modelKey);
  await page.getByRole("button",{name:"保存"}).click();
  await expect(page.getByText("已绑定",{exact:true})).toBeVisible();
  assert.equal(writes.at(-1)?.body.model,modelKey);
  assert.match(writes.at(-1)!.body.reason,/prefilter/);
  await picker.selectOption("");
  failure=true;
  await page.getByRole("button",{name:"保存"}).click();
  await expect(page.getByRole("alert")).toContainText("模型暂不可用");
  failure=false;
  await page.getByRole("button",{name:"保存"}).click();
  await expect(page.getByText("未绑定",{exact:true}).first()).toBeVisible();
  assert.equal(writes.at(-1)?.body.model,null);
  data.choices.splice(0,1);
  await page.reload();
  await expect(picker.locator('option[value="'+modelKey+'"]')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole("button",{name:"刷新模型"})).toHaveCount(0);
 }finally{await browser?.close();await web.stop();}
});
