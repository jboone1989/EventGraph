import type {Route} from "./+types/model-bindings";
import type {AdminModelBindings} from "@aihot/contracts/admin";
import {SITE} from "@aihot/site";
import {useState} from "react";
import {adminGet} from "../../lib/admin.server";
import {useAdminAction} from "../../features/admin/action";
import {AdminPage,Button,ButtonLink,Card,DataTable,Select,Badge} from "../../features/admin/ui";

export async function loader({request}:Route.LoaderArgs){
 return adminGet<AdminModelBindings>(request,"/api/admin/model-bindings");
}
export const meta:Route.MetaFunction=()=>[{title:"工作流模型绑定 · "+SITE.name+" 后台"}];
type Step=AdminModelBindings["steps"][number];
type Choice=AdminModelBindings["choices"][number];

function usable(choice:Choice,step:Step){
 return choice.adapter==="chat"&&(!step.vision||choice.vision);
}
function titleFor(choice:Choice){
 return choice.modelId+" · "+choice.provider+" · "+({free:"免费",paid:"收费",trial:"免费试用",unknown:"费用未知"}[choice.priceKind]);
}
function ModelBinding({step,choices}:{step:Step;choices:Choice[]}){
 const {run,busy}=useAdminAction();
 const original=step.current.source==="admin"?step.current.model:"";
 const [selected,setSelected]=useState(original);
 const [error,setError]=useState("");
 const [freeOnly,setFreeOnly]=useState(false);
 const chosen=choices.find(c=>c.key===selected);
 const canSave=selected!==original&&(!selected||!!chosen&&usable(chosen,step)&&(!freeOnly||chosen.priceKind==="free"));
 const save=async()=>{
  setError("");
  const result=await run("POST","/api/admin/models/"+encodeURIComponent(step.key),{
   model:selected||null,reason:"后台工作流模型绑定："+step.key+" → "+(selected||"继承默认")
  },{success:"已更新："+step.label.split("（")[0],onError:problem=>setError(problem.detail)});
  if(!result&& !error) return;
 };
 return <div className="min-w-[280px] space-y-1.5">
  <div className="flex items-center gap-2">
   <Select aria-label={"为"+step.label.split("（")[0]+"选择模型"} value={selected}
    disabled={busy} onChange={e=>{setSelected(e.target.value);setError("");}}>
    <option value="">不绑定（使用运行环境默认）</option>
    {selected&&!chosen&&<option value={selected} disabled>{selected}（旧配置，仅保留当前值）</option>}
    {choices.filter(choice=>!freeOnly||choice.priceKind==="free"||choice.key===selected).map(choice=>{
     const ok=usable(choice,step)&&(!freeOnly||choice.priceKind==="free");
     const suffix=!ok?(choice.adapter!=="chat"?"（非对话模型）":"（不支持图像）"):"";
     return <option key={choice.key} value={choice.key} disabled={!ok}>
      {titleFor(choice)}{suffix}
     </option>;
    })}
   </Select>
   <Button size="sm" disabled={busy||!canSave} onClick={save}>保存</Button>
  </div>
  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={freeOnly} onChange={e=>setFreeOnly(e.target.checked)}/>仅筛选已确认免费的模型（免费试用不计入）</label>
  {selected&&chosen&&!usable(chosen,step)&&<p className="text-xs text-amber">
   此模型不支持当前工作流需要的输入类型。
  </p>}
  {error&&<p role="alert" className="text-xs text-hot">{error}</p>}
 </div>;
}

export default function ModelBindings({loaderData}:Route.ComponentProps){
 const choices=loaderData.choices;
 const display=(key:string)=>{
  const choice=choices.find(c=>c.key===key);
  return choice?titleFor(choice):key||"未绑定";
 };
 return <AdminPage title="工作流模型绑定"
  subtitle="直接选择模型管理中的模型；新增或删除后重新进入此页即可看到最新数据。"
  actions={<ButtonLink to="/admin/models">模型管理</ButtonLink>}>
  <Card title={"处理阶段（"+loaderData.steps.length+"）"}>
   <DataTable rows={loaderData.steps} rowKey={s=>s.key} columns={[
    {key:"stage",label:"工作流阶段",render:s=><div className="max-w-xs">
     <div className="font-medium text-ink">{s.label.split("（")[0]}</div>
     {s.label.includes("（")&&<div className="text-xs text-ink-4">{s.label.slice(s.label.indexOf("（"))}</div>}
    </div>},
    {key:"current",label:"绑定模型",render:s=><span className="block max-w-[200px] break-all font-mono text-xs">
     {display(s.current.model)}</span>},
    {key:"source",label:"来源",render:s=><Badge tone={s.current.source==="admin"?"accent":"muted"}>
     {s.current.source==="admin"?"已绑定":"未绑定"}
    </Badge>},
    {key:"select",label:"更改绑定",render:s=><ModelBinding
     key={s.key+":"+s.current.source+":"+s.current.model} step={s} choices={choices}/>},
   ]}/>
   <p className="mt-4 text-xs text-ink-4">
    候选模型直接来自模型管理表。取消绑定后运行时使用环境默认值；能否实际调用取决于模型连接及启用状态。
   </p>
  </Card>
 </AdminPage>;
}
