import type {Route} from "./+types/models";
import {useState} from "react";
import type {ProviderManagement} from "@aihot/contracts/providers";
import {SITE} from "@aihot/site";
import {adminGet} from "../../lib/admin.server";
import {AdminPage,Button} from "../../features/admin/ui";
import {useAdminAction} from "../../features/admin/action";
import {RegisteredModelsAdmin} from "../../features/admin/ProviderConnectionsAdmin";
export async function loader({request}:Route.LoaderArgs){
 return adminGet<ProviderManagement>(request,"/api/admin/providers");
}
export const meta:Route.MetaFunction=()=>[{title:"模型管理 · "+SITE.name+" 后台"}];
export default function ModelsAdmin({loaderData}:Route.ComponentProps){
 const {run,busy}=useAdminAction();
 const [syncResult,setSyncResult]=useState("");
 async function syncFree(id:string,vendor:string,name:string){
  const confirmed=vendor==="zai"||window.confirm("请确认此 API Key 当前属于免费套餐。Groq、Gemini 和 Cloudflare 的付费套餐可能产生费用；导入后模型默认禁用，需要手动开启。");
  if(!confirmed)return;
  const r=await run<{total:number;added:number;existing:number}>("POST","/api/admin/providers/"+id+"/free-catalog/sync",{confirmFreeTier:confirmed});
  if(r)setSyncResult(name+"：候选 "+r.total+" 个，新增 "+r.added+" 个，已有 "+r.existing+" 个。新导入模型默认禁用，请核对账户套餐后再开启模型和自动路由。");
 }
 return <AdminPage title="模型管理" subtitle="模型 CRUD：模型 ID 关联厂商连接；每行单独测试。"
  actions={<div className="flex flex-wrap gap-2">
   {loaderData.providers.filter(p=>p.vendor.toLowerCase()==="openrouter").map(p=>
    <Button key={p.id} disabled={busy} onClick={()=>void run("POST","/api/admin/providers/"+p.id+"/openrouter-free/sync",{},
     {success:"已同步 OpenRouter 免费模型（包含 openrouter/free）"})}>同步 OpenRouter 免费模型</Button>)}
   {loaderData.providers.filter(p=>["groq","gemini","zai","cloudflare"].includes(p.vendor.toLowerCase())).map(p=>
    <Button key={p.id} disabled={busy} onClick={()=>void syncFree(p.id,p.vendor.toLowerCase(),p.name)}>导入 {p.name} 免费模型</Button>)}
   <Button disabled={busy} onClick={()=>void run("POST","/api/admin/provider-models/cache/refresh",{},
    {success:"已清空本服务的模型缓存"})}>刷新模型</Button>
  </div>}>
  {syncResult&&<p role="status" className="mb-3 text-sm">{syncResult}</p>}
  <p className="mb-3 text-xs text-ink-4">Groq、Gemini、Cloudflare 只有在免费套餐或免费额度内才不会收费。Cloudflare 付费套餐超额后会计费；新模型不会自动参与路由。</p>
  <RegisteredModelsAdmin data={loaderData}/>
 </AdminPage>;
}
