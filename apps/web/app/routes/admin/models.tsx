import type {Route} from "./+types/models";
import type {ProviderManagement} from "@aihot/contracts/providers";
import {SITE} from "@aihot/site";
import {adminGet} from "../../lib/admin.server";
import {AdminPage} from "../../features/admin/ui";
import {ProviderConnectionsAdmin} from "../../features/admin/ProviderConnectionsAdmin";

export async function loader({request}:Route.LoaderArgs){
 return adminGet<ProviderManagement>(request,"/api/admin/providers");
}
export const meta:Route.MetaFunction=()=>[{title:"Provider 管理 · "+SITE.name+" 后台"}];
export default function ModelsAdmin({loaderData}:Route.ComponentProps){
 return <AdminPage title="Provider 管理" subtitle="管理厂商连接与模型；「工作流路由」视图查看各阶段实际选择与可用状态。"
  >
  <ProviderConnectionsAdmin data={loaderData}/>
 </AdminPage>;
}
