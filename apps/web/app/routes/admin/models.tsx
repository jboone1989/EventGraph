import type {Route} from "./+types/models";
import type {ProviderManagement} from "@aihot/contracts/providers";
import {SITE} from "@aihot/site";
import {adminGet} from "../../lib/admin.server";
import {AdminPage} from "../../features/admin/ui";
import {RegisteredModelsAdmin} from "../../features/admin/ProviderConnectionsAdmin";
export async function loader({request}:Route.LoaderArgs){
 return adminGet<ProviderManagement>(request,"/api/admin/providers");
}
export const meta:Route.MetaFunction=()=>[{title:"模型管理 · "+SITE.name+" 后台"}];
export default function ModelsAdmin({loaderData}:Route.ComponentProps){
 return <AdminPage title="模型管理" subtitle="模型 CRUD：模型 ID 关联厂商连接；每行单独测试。">
  <RegisteredModelsAdmin data={loaderData}/>
 </AdminPage>;
}
