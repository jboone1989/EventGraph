import type {Route} from "./+types/model-bindings";
import type {AdminModelBindings} from "@aihot/contracts/admin";
import {SITE} from "@aihot/site";
import {useEffect,useState} from "react";
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
 // The inventory can change in another tab or session while this page is open.
 // Reset only stale unsaved selections; never erase the active legacy binding.
 useEffect(()=>{
  if(selected&&selected!==original&&!chosen)setSelected(original);
 },[selected,original,chosen]);
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
    {selected&&!chosen&&<option value={selected} disabled>{selected}（旧配置，仅保留当前值）</option>}
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
   此模型不能用于当前流程：{chosen.reasons.join("；")||"模型类型或能力不兼容"}。请先到模型管理页测试并启用路由。
  </p>}
  {error&&<p role="alert" className="text-xs text-hot">{error}</p>}
 </div>;
}

export default function ModelBindings({loaderData}:Route.ComponentProps){
 const revalidator=useRevalidator();
 // Always query the same live registry as model CRUD: when returning to the tab
 // and periodically while visible, with no operator-driven refresh button.
 useEffect(()=>{
  const sync=()=>{
   if(document.visibilityState==="visible"&&revalidator.state==="idle")revalidator.revalidate();
  };
  window.addEventListener("focus",sync);
  document.addEventListener("visibilitychange",sync);
  const poll=window.setInterval(sync,15_000);
  return ()=>{
   window.removeEventListener("focus",sync);
   document.removeEventListener("visibilitychange",sync);
   window.clearInterval(poll);
  };
 },[revalidator.revalidate,revalidator.state]);
 const choices=loaderData.choices;
 const display=(key:string)=>{
  const choice=choices.find(c=>c.key===key);
  return choice?titleFor(choice):key;
 };
 return <AdminPage title="工作流模型绑定"
  subtitle="绑定模型与模型管理实时共享数据。新增或删除模型后，返回此页即自动同步；已打开的页面也会自动更新。"
  actions={<ButtonLink to="/admin/models">厂商与模型</ButtonLink>}>
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
    下拉列表与模型管理页使用相同的已注册模型数据。未通过测试、未启用或不符合能力要求的模型会显示但不可绑定；旧系统预设仅保留为继承默认或当前配置。
   </p>
  </Card>
 </AdminPage>;
}
