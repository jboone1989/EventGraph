import type {Route} from "./+types/connections";
import type {ProviderManagement} from "@aihot/contracts/providers";
import {SITE} from "@aihot/site";
import {adminGet} from "../../lib/admin.server";
import {AdminPage} from "../../features/admin/ui";
import {ProviderConnectionsAdmin} from "../../features/admin/ProviderConnectionsAdmin";
export async function loader({request}:Route.LoaderArgs){
 return adminGet<ProviderManagement>(request,"/api/admin/providers");
}
export const meta:Route.MetaFunction=()=>[{title:"厂商连接 · "+SITE.name+" 后台"}];
export default function Connections({loaderData}:Route.ComponentProps){
 return <AdminPage title="厂商连接" subtitle="连接 CRUD：厂商、API 地址、协议与密钥。">
  <ProviderConnectionsAdmin data={loaderData}/>
 </AdminPage>;
}
