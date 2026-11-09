import type {Route} from "./+types/models";
import {useState} from "react";
import type {ProviderManagement} from "@aihot/contracts/providers";
import {SITE} from "@aihot/site";
import {adminGet} from "../../lib/admin.server";
import {AdminPage,Button,Select} from "../../features/admin/ui";
import {useAdminAction} from "../../features/admin/action";
import {RegisteredModelsAdmin} from "../../features/admin/ProviderConnectionsAdmin";
export async function loader({request}:Route.LoaderArgs){
 return adminGet<ProviderManagement>(request,"/api/admin/providers");
}
export const meta:Route.MetaFunction=()=>[{title:"模型管理 · "+SITE.name+" 后台"}];
export default function ModelsAdmin({loaderData}:Route.ComponentProps){
 const {run,busy}=useAdminAction();
 const [selectedId,setSelectedId]=useState(loaderData.providers[0]?.id??"");
 const [feedback,setFeedback]=useState("");
 const selected=loaderData.providers.find(p=>p.id===selectedId)??loaderData.providers[0];
 const supportsCatalog=selected ? ["openrouter","groq","gemini","zai","cloudflare"].includes(selected.vendor.toLowerCase()) : false;
 async function importSelected(){
  if(!selected||!supportsCatalog)return;
  const vendor=selected.vendor.toLowerCase();
  if(vendor==="openrouter"){
   const result=await run<{catalogTotal:number;freeCatalog:number;chat:number;embedding:number;other:number;invalid:number;total:number;added:number;noLongerFree:number;removed:number}>(
    "POST","/api/admin/providers/"+selected.id+"/openrouter-free/sync",{});
   if(result)setFeedback(selected.name+"：官方目录 "+result.catalogTotal+" 个，免费 "+result.freeCatalog+" 个，已登记 "+result.total+" 个，本次新增 "+result.added+" 个，失去免费资格 "+result.noLongerFree+" 个（已清理 "+(result.removed??0)+" 个）。");
   return;
  }
  const confirmed=vendor==="zai"||window.confirm("请确认所选连接使用免费套餐或免费额度；部分厂商的付费套餐可能产生费用。导入后模型默认禁用，需要手动开启。");
  if(!confirmed)return;
  const result=await run<{total:number;added:number;existing:number}>(
   "POST","/api/admin/providers/"+selected.id+"/free-catalog/sync",{confirmFreeTier:confirmed});
  if(result)setFeedback(selected.name+"：候选 "+result.total+" 个，新增 "+result.added+" 个，已有 "+result.existing+" 个。新导入模型默认禁用。");
 }
 return <AdminPage title="模型管理" subtitle="模型关联独立厂商连接，支持筛选、测试与管理。"
  actions={<Button disabled={busy} onClick={()=>void run("POST","/api/admin/provider-models/cache/refresh",{},
   {success:"已清空本服务的模型缓存"})}>刷新模型</Button>}>
  <section aria-label="免费模型导入" className="mb-4 rounded-panel bg-surface p-4 ring-1 ring-line">
   <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
    <label className="min-w-0 flex-1 space-y-1 text-sm">
     <span className="block font-medium">免费模型导入 · 选择厂商连接</span>
     <Select aria-label="导入模型的厂商连接" value={selected?.id??""} disabled={busy||!selected}
      onChange={e=>{setSelectedId(e.target.value);setFeedback("");}}>
      {loaderData.providers.map(p=><option key={p.id} value={p.id}>{p.name+" · "+p.vendor+" · "+p.id.slice(-8)}</option>)}
     </Select>
    </label>
    <Button disabled={busy||!selected||!supportsCatalog} onClick={()=>void importSelected()}>导入所选连接的免费模型</Button>
   </div>
   {!selected&&<p role="status" className="mt-2 text-sm text-ink-3">尚未配置厂商连接，请先前往「厂商连接」添加连接，然后刷新本页。</p>}
   {selected&&!supportsCatalog&&<p role="status" className="mt-2 text-sm text-ink-3">当前连接不支持一键导入，可手动新增模型。</p>}
   <p className="mt-2 text-xs leading-relaxed text-ink-4">连接来自厂商连接配置，按连接 ID 分别导入，不会合并同厂商的不同账户。仅已支持免费目录的厂商可一键导入；其他模型可通过下方“新增模型”添加。导入的模型默认禁用，不会自动参与路由。</p>
   {feedback&&<p role="status" className="mt-2 text-sm text-ink-2">{feedback}</p>}
  </section>
  <RegisteredModelsAdmin data={loaderData}/>
 </AdminPage>;
}
