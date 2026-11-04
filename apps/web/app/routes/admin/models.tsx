import type {Route} from "./+types/models";
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
 return <AdminPage title="模型管理" subtitle="模型 CRUD：模型 ID 关联厂商连接；每行单独测试。"
  actions={<div className="flex flex-wrap gap-2">
   {loaderData.providers.filter(p=>p.vendor.toLowerCase()==="openrouter").map(p=>
    <Button key={p.id} disabled={busy} onClick={()=>void run("POST","/api/admin/providers/"+p.id+"/openrouter-free/sync",{},
     {success:"已同步 OpenRouter 免费模型与价格"})}>同步免费模型及价格</Button>)}
   <Button disabled={busy} onClick={()=>void run("POST","/api/admin/provider-models/cache/refresh",{},
    {success:"已清空本服务的模型缓存"})}>刷新模型</Button>
  </div>}>
  <RegisteredModelsAdmin data={loaderData}/>
 </AdminPage>;
}
