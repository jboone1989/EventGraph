import type {Route} from "./+types/models";
import type {ProviderManagement} from "@aihot/contracts/providers";
import {SITE} from "@aihot/site";
import {adminGet} from "../../lib/admin.server";
import {AdminPage} from "../../features/admin/ui";
import {ProviderConnectionsAdmin} from "../../features/admin/ProviderConnectionsAdmin";

export async function loader({request}:Route.LoaderArgs){
 return adminGet<ProviderManagement>(request,"/api/admin/providers");
}
export const meta:Route.MetaFunction=()=>[{title:"模型管理 · "+SITE.name+" 后台"}];
export default function ModelsAdmin({loaderData}:Route.ComponentProps){
 return <AdminPage title="模型管理" subtitle="查看、添加、编辑、删除模型，并在每个模型上直接测试。"
  >
  <ProviderConnectionsAdmin data={loaderData}/>
 </AdminPage>;
}
