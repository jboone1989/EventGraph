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
 const [summary,setSummary]=useState<{name:string;catalogTotal:number;freeCatalog:number;chat:number;embedding:number;other:number;invalid:number;total:number;added:number;noLongerFree:number}|null>(null);
 async function sync(name:string,id:string){
  const result=await run<Omit<NonNullable<typeof summary>,"name">>("POST","/api/admin/providers/"+id+"/openrouter-free/sync",{});
  if(result)setSummary({name,...result});
 }
 return <AdminPage title="模型管理" subtitle="模型 CRUD：模型 ID 关联厂商连接；每行单独测试。"
  actions={<div className="flex flex-wrap gap-2">
   {loaderData.providers.filter(p=>p.vendor.toLowerCase()==="openrouter").map(p=>
    <Button key={p.id} disabled={busy} onClick={()=>void sync(p.name,p.id)}>同步 OpenRouter 免费模型</Button>)}
   <Button disabled={busy} onClick={()=>void run("POST","/api/admin/provider-models/cache/refresh",{},
    {success:"已清空本服务的模型缓存"})}>刷新模型</Button>
  </div>}>
  {summary&&<p role="status" className="mb-3 text-sm">OpenRouter（{summary.name}）：官方目录 {summary.catalogTotal} 个，免费 {summary.freeCatalog} 个（聊天 {summary.chat}、向量 {summary.embedding}、其他 {summary.other}），已登记 {summary.total} 个（含 openrouter/free），本次新增 {summary.added} 个，失去免费资格 {summary.noLongerFree} 个{summary.invalid?`，无效 ID ${summary.invalid} 个`:""}。</p>}
  <RegisteredModelsAdmin data={loaderData}/>
 </AdminPage>;
}
