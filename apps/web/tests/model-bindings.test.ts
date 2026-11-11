import assert from "node:assert/strict";
import {createServer} from "node:http";
import {test} from "node:test";
import {chromium,expect} from "@playwright/test";
import type {AdminModelBindings} from "@aihot/contracts/admin";
import {startWebServer} from "./web-server.ts";

test("workflow bindings list new models, gate unverified choices, and save per-stage",async()=>{
 const modelKey="model:22222222-2222-4222-a222-222222222222";
 const embeddingKey="model:33333333-3333-4333-a333-333333333333";
 const data:AdminModelBindings={
  defaultModel:{model:"",source:"default"},
  steps:[{key:"prefilter",label:"精选预筛（宽召回）",vision:false,autoTier:"light",
   current:{model:"default",source:"default"},effective:{model:"default",source:"default"}},
   {key:"graphitiEmbedding",label:"Graphiti 向量生成",vision:false,embedding:true,autoTier:null,
    current:{model:embeddingKey,source:"admin"},effective:{model:embeddingKey,source:"admin"}}],
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
  if((path==="/api/admin/models/prefilter"||path==="/api/admin/models/apply-default")&&req.method==="POST"){
   let body="";for await(const c of req)body+=c;
   const parsed=JSON.parse(body) as {model:string|null;reason:string};
   writes.push({path,body:parsed});
   if(failure){res.statusCode=409;return res.end(JSON.stringify({detail:"模型暂不可用"}));}
   const current=parsed.model?
    {model:parsed.model,source:"admin" as const}:{model:"",source:"default" as const};
   if(path.endsWith('/apply-default')){
    data.defaultModel=current;
    data.steps[0]!.current={model:"",source:"default"};
    data.steps[0]!.effective={model:current.model,source:current.model?"admin":"default"};
    // A chat default never overwrites the embedding model binding.
    assert.equal(data.steps[1]!.current.model,embeddingKey);
   }else{
    data.steps[0]!.current=current;
    data.steps[0]!.effective=current;
   }
   return res.end(JSON.stringify({after:current}));
  }
  res.statusCode=404;res.end("{}");
 });
 const web=await startWebServer(api);
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  browser=await chromium.launch({channel:"chromium"});
  const page=await browser.newPage();
  await page.goto(web.origin+"/admin/model-bindings");
  await page.getByText(/高级设置 · 为各工作流单独指定模型/).click();
  const picker=page.getByRole("combobox",{name:"为精选预筛选择模型"});
  await expect(page.getByText("工作流模型绑定",{exact:true}).first()).toBeVisible();
  await expect(picker).toHaveValue("");
  const defaultPicker=page.getByRole("combobox",{name:"为默认模型选择模型"});
  await expect(defaultPicker).toHaveValue("");
  await expect(page.getByRole("status").filter({hasText:"暂无已注册的聊天模型"})).toContainText("暂无已注册的聊天模型");
  await expect(page.getByRole("button",{name:"一键应用到全部流程"})).toBeEnabled();

  await expect(picker.locator('option[value="default"]')).toHaveCount(0);
  await expect(picker.locator('option')).toHaveCount(5);
  await expect(picker.locator('option[value="auto"]')).toHaveText(/自动.*按流程复杂度/);
  await expect(defaultPicker.locator('option[value="auto"]')).toHaveText(/自动.*按流程复杂度.*推荐/);
  for(const tier of ["light","medium","heavy"]){
   await expect(defaultPicker.locator('option[value="auto:'+tier+'"]')).toHaveCount(0);
   await expect(picker.locator('option[value="auto:'+tier+'"]')).toHaveCount(1);
  }
  await expect(page.getByText("独立向量模型",{exact:true})).toBeVisible();
  await expect(picker.locator('option[value="auto:heavy"]')).toHaveText(/高级模型/);
  data.choices.push({key:modelKey,modelId:"fresh-model",provider:"New provider",
   adapter:"chat",vision:false});
  await page.reload();
  await expect(page.getByRole("status").filter({hasText:"暂无已注册的聊天模型"})).toHaveCount(0);
  await page.getByText(/高级设置 · 为各工作流单独指定模型/).click();
  await expect(picker.locator('option[value="'+modelKey+'"]')).toBeEnabled();
  await expect(picker.locator('option[value="'+modelKey+'"]')).toContainText("fresh-model");
  await defaultPicker.selectOption(modelKey);
  await page.getByRole("button",{name:"一键应用到全部流程"}).click();
  assert.equal(writes.at(-1)?.path,"/api/admin/models/apply-default");
  assert.match(writes.at(-1)!.body.reason,/默认模型/);
  assert.equal(writes.at(-1)?.body.model,modelKey);
  await expect(page.getByText("继承默认",{exact:true}).first()).toBeVisible();
  await expect(page.getByRole("combobox",{name:"为Graphiti 向量生成选择模型"})).toHaveValue(embeddingKey);
  // Bulk update revalidates the page loader and remounts keyed selector controls.
  // Do not race that revalidation with a per-stage override.
  await page.waitForLoadState("networkidle");
  await picker.selectOption(modelKey);
  await expect(picker).toHaveValue(modelKey);
  await expect(page.getByRole("button",{name:"保存"}).first()).toBeEnabled();
  await page.getByRole("button",{name:"保存"}).first().click();
  await expect(page.getByText("单独指定",{exact:true}).first()).toBeVisible();
  // Reapplying an unchanged default still resets a previously saved stage override.
  await page.getByRole("button",{name:"一键应用到全部流程"}).click();
  assert.equal(writes.at(-1)?.path,"/api/admin/models/apply-default");
  await expect(page.getByText("继承默认",{exact:true}).first()).toBeVisible();
  await expect(page.getByRole("combobox",{name:"为Graphiti 向量生成选择模型"})).toHaveValue(embeddingKey);
  // Advanced stage editing remains supported after a bulk default apply.
  await picker.selectOption(modelKey);
  await page.getByRole("button",{name:"保存"}).first().click();
  await expect(page.getByText("单独指定",{exact:true}).first()).toBeVisible();
  assert.equal(writes.at(-1)?.body.model,modelKey);
  assert.match(writes.at(-1)!.body.reason,/prefilter/);
  // The successful save revalidates the loader and remounts the keyed selector.
  // Wait for that refresh before choosing the next value, or the in-flight refresh
  // can overwrite the user's selection and leave a disabled Save button.
  await page.waitForLoadState("networkidle");
  await expect(picker).toHaveValue(modelKey);
  await picker.selectOption("");
  await expect(picker).toHaveValue("");
  await expect(page.getByRole("button",{name:"保存"}).first()).toBeEnabled();
  failure=true;
  await page.getByRole("button",{name:"保存"}).first().click();
  await expect(page.getByRole("alert")).toContainText("模型暂不可用");
  failure=false;
  await page.getByRole("button",{name:"保存"}).first().click();
  await expect(page.getByText("继承默认",{exact:true}).first()).toHaveText("继承默认");
  assert.equal(writes.at(-1)?.body.model,null);
  // The default apply is also a valid "restore deployment default" action.
  await defaultPicker.selectOption("");
  await page.getByRole("button",{name:"一键应用到全部流程"}).click();
  assert.equal(writes.at(-1)?.path,"/api/admin/models/apply-default");
  assert.equal(writes.at(-1)?.body.model,null);
  await expect(defaultPicker).toHaveValue("");
  await expect(page.getByRole("combobox",{name:"为Graphiti 向量生成选择模型"})).toHaveValue(embeddingKey);
  // Failed bulk updates do not change the saved default or the advanced rows.
  await defaultPicker.selectOption("auto");
  failure=true;
  await page.getByRole("button",{name:"一键应用到全部流程"}).click();
  await expect(page.getByRole("alert")).toContainText("模型暂不可用");
  assert.equal(data.defaultModel.model,"");
  assert.equal(data.steps[1]!.current.model,embeddingKey);
  failure=false;
  // A successful one-click auto reset shows the actual stage tier, not a generic "auto" badge.
  await page.getByRole("button",{name:"一键应用到全部流程"}).click();
  assert.equal(writes.at(-1)?.body.model,"auto");
  await expect(page.getByText("轻量",{exact:true})).toBeVisible();
  await expect(page.getByText("独立向量模型",{exact:true})).toBeVisible();
  // An existing global pinned tier is kept visible but cannot be chosen anew.
  data.defaultModel={model:"auto:heavy",source:"admin"};
  await page.reload();
  await expect(defaultPicker).toHaveValue("auto:heavy");
  await expect(defaultPicker.locator('option[value="auto:heavy"]')).toContainText("旧全局等级");
  await expect(page.getByText(/当前是旧全局固定等级/)).toBeVisible();
  await defaultPicker.selectOption("auto");
  await page.getByRole("button",{name:"一键应用到全部流程"}).click();
  assert.equal(writes.at(-1)?.body.model,"auto");
  data.choices.splice(0,1);
  await page.reload();
  await expect(picker.locator('option[value="'+modelKey+'"]')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole("button",{name:"刷新模型"})).toHaveCount(0);
 }finally{await browser?.close();await web.stop();}
});
