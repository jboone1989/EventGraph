import type {Route} from "./+types/model-bindings";
import type {AdminModelBindings} from "@aihot/contracts/admin";
import {SITE} from "@aihot/site";
import {useState} from "react";
import {useRevalidator} from "react-router";
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
 if(choice.kind==="preset")return !step.vision||choice.vision;
 return choice.adapter==="chat"&&(step.vision?choice.visionReady:choice.textReady);
}
function titleFor(choice:Choice){
 return choice.modelId+" · "+choice.provider;
}
function ModelBinding({step,choices}:{step:Step;choices:Choice[]}){
 const {run,busy}=useAdminAction();
 const original=step.current.source==="admin"?step.current.model:"";
 const [selected,setSelected]=useState(original);
 const [error,setError]=useState("");
 const chosen=choices.find(c=>c.key===selected);
 const canSave=selected!==original&&(!selected||!!chosen&&usable(chosen,step));
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
    <option value="">继承环境／系统默认</option>
    {choices.map(choice=>{
     const ok=usable(choice,step);
     const suffix=!ok?(choice.adapter!=="chat"?"（非对话模型）":
      step.vision&&!choice.vision?"（不支持图像）":"（尚未通过测试或启用路由）"):"";
     return <option key={choice.key} value={choice.key} disabled={!ok}>
      {titleFor(choice)}{suffix}
     </option>;
    })}
   </Select>
   <Button size="sm" disabled={busy||!canSave} onClick={save}>保存</Button>
  </div>
  {selected&&chosen&&!usable(chosen,step)&&<p className="text-xs text-amber">
   模型尚不可用于此流程；请先在模型管理中测试并启用工作流调用。
  </p>}
  {error&&<p role="alert" className="text-xs text-hot">{error}</p>}
 </div>;
}

export default function ModelBindings({loaderData}:Route.ComponentProps){
 const revalidator=useRevalidator();
 const choices=loaderData.choices;
 const display=(key:string)=>{
  const choice=choices.find(c=>c.key===key);
  return choice?titleFor(choice):key;
 };
 return <AdminPage title="工作流模型绑定"
  subtitle="每个处理阶段可独立指定模型。新增模型后返回此页或刷新即可看到；切换仅影响后续任务。"
  actions={<>
   <ButtonLink to="/admin/models">模型管理</ButtonLink>
   <Button disabled={revalidator.state!=="idle"} busy={revalidator.state!=="idle"}
    onClick={()=>revalidator.revalidate()}>刷新模型</Button>
  </>}>
  <Card title={"处理阶段（"+loaderData.steps.length+"）"}>
   <DataTable rows={loaderData.steps} rowKey={s=>s.key} columns={[
    {key:"stage",label:"工作流阶段",render:s=><div className="max-w-xs">
     <div className="font-medium text-ink">{s.label.split("（")[0]}</div>
     {s.label.includes("（")&&<div className="text-xs text-ink-4">{s.label.slice(s.label.indexOf("（"))}</div>}
    </div>},
    {key:"current",label:"当前生效模型",render:s=><span className="block max-w-[200px] break-all font-mono text-xs">
     {display(s.current.model)}</span>},
    {key:"source",label:"来源",render:s=><Badge tone={s.current.source==="admin"?"accent":"muted"}>
     {s.current.source==="admin"?"后台绑定":s.current.source==="env"?"环境变量":"系统默认"}
    </Badge>},
    {key:"select",label:"更改绑定",render:s=><ModelBinding
     key={s.key+":"+s.current.source+":"+s.current.model} step={s} choices={choices}/>},
   ]}/>
   <p className="mt-4 text-xs text-ink-4">
    下拉列表包含新增模型。未通过测试或未开启工作流调用的模型会显示但不可选择。
   </p>
  </Card>
 </AdminPage>;
}
