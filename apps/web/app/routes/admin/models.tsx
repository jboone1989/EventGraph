import type {Route} from "./+types/models";
import type {ProviderManagement} from "@aihot/contracts/providers";
import {SITE} from "@aihot/site";
import {adminGet} from "../../lib/admin.server";
import {AdminPage} from "../../features/admin/ui";
import {ProviderConnectionsAdmin} from "../../features/admin/ProviderConnectionsAdmin";

export async function loader({request}:Route.LoaderArgs){
 return adminGet<ProviderManagement>(request,"/api/admin/providers");
}
export const meta:Route.MetaFunction=()=>[{title:"厂商与模型 · "+SITE.name+" 后台"}];
export default function ModelsAdmin({loaderData}:Route.ComponentProps){
 return <AdminPage title="厂商与模型" subtitle="一个厂商配置 API Key 与多个模型。测试通过后可在工作流绑定页面选择。"
  >
  <ProviderConnectionsAdmin data={loaderData}/>
 </AdminPage>;
}
