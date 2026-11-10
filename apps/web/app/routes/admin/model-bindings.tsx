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
 return choice.adapter===(step.embedding?"embedding":"chat")&&(!step.vision||choice.vision);
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
 const isAuto=!step.embedding&&(selected==='auto'||/^auto:(light|medium|heavy)$/.test(selected));
 const applyAll=step.key==="default";
 // Reapplying the current default is meaningful: it clears previously saved advanced overrides.
 const canSave=(applyAll||selected!==original)&&(!selected||isAuto||!!chosen&&usable(chosen,step));
 const save=async()=>{
  setError("");
  const target=applyAll?"/api/admin/models/apply-default":"/api/admin/models/"+encodeURIComponent(step.key);
  await run("POST",target,{
   model:selected||null,
   reason:applyAll?"后台一键应用默认模型到所有聊天流程并重置高级绑定":"后台工作流模型绑定："+step.key+" → "+(selected||(step.embedding?"未绑定":"继承默认"))
  },{success:applyAll?"默认模型已应用到全部聊天流程":"已更新："+step.label.split("（")[0],
    onError:problem=>setError(problem.detail)});
 };
 return <div className="min-w-[280px] space-y-1.5">
  <div className="flex flex-wrap items-center gap-2">
   <Select aria-label={"为"+step.label.split("（")[0]+"选择模型"} value={selected}
    disabled={busy} onChange={e=>{setSelected(e.target.value);setError("");}}>
    <option value="">{step.embedding?"未绑定向量模型":step.key==="default"?"使用部署默认模型":"继承默认模型"}</option>
    {!step.embedding&&<><option value="auto">自动 · 免费模型池（按流程复杂度）</option>
    <option value="auto:light">自动 · 轻量模型</option>
    <option value="auto:medium">自动 · 标准模型</option>
    <option value="auto:heavy">自动 · 高级模型</option></>}
    {selected&&!chosen&&!isAuto&&<option value={selected} disabled>{selected}（旧配置，仅保留当前值）</option>}
    {choices.map(choice=>{
     const ok=usable(choice,step);
     const suffix=!ok?(choice.adapter!==(step.embedding?"embedding":"chat")?"（模型类型不匹配）":"（不支持图像）"):"";
     return <option key={choice.key} value={choice.key} disabled={!ok}>
      {titleFor(choice)}{suffix}
     </option>;
    })}
   </Select>
   <Button size="sm" disabled={busy||!canSave} onClick={save}>{applyAll?"一键应用到全部流程":"保存"}</Button>
  </div>
  {selected&&chosen&&!usable(chosen,step)&&<p className="text-xs text-amber">
   此模型不支持当前工作流需要的输入类型。
  </p>}
  {error&&<p role="alert" className="text-xs text-hot">{error}</p>}
 </div>;
}

export default function ModelBindings({loaderData}:Route.ComponentProps){
 const choices=loaderData.choices;
 const defaultStep:Step={key:"default",label:"默认模型",vision:false,current:loaderData.defaultModel,effective:loaderData.defaultModel};
 const display=(key:string)=>{
  const choice=choices.find(c=>c.key===key);
  const auto:Record<string,string>={auto:"自动 · 免费优先","auto:light":"自动 · 轻量","auto:medium":"自动 · 标准","auto:heavy":"自动 · 高级"};
  return choice?titleFor(choice):auto[key]??(key||"部署默认");
 };
 return <AdminPage title="工作流模型绑定"
  subtitle="一键将默认路由应用到全部聊天流程；高级设置只用于之后单独处理例外。"
  actions={<ButtonLink to="/admin/models">模型管理</ButtonLink>}>
  <Card title="默认模型">
   <p className="mb-3 text-sm text-ink-4">选择默认模型后，点击「一键应用到全部流程」，将同时清除高级设置中的所有聊天流程单独绑定，之后每个流程按默认路由自动选模。有问题的流程再在高级设置单独修改。向量模型使用独立配置，不会被聊天模型覆盖；自动路由只使用免费模型。</p>
   {!choices.some(choice=>choice.adapter==="chat")&&
    <p className="mb-2 text-sm text-amber" role="status">暂无已注册的聊天模型；自动路由需等待配置可用免费模型。仍可选择部署默认，或提前保存自动路由策略。</p>}
   <ModelBinding key={"default:"+loaderData.defaultModel.model} step={defaultStep} choices={choices}/>
   <p className="mt-2 text-xs text-ink-4">当前：{display(loaderData.defaultModel.model)||"部署默认"}</p>
  </Card>
  <details className="mt-4">
   <summary className="cursor-pointer py-3 font-medium">高级设置 · 为各工作流单独指定模型（{loaderData.steps.length}）</summary>
   <Card title="工作流覆盖设置">
    <DataTable rows={loaderData.steps} rowKey={s=>s.key} columns={[
     {key:"stage",label:"工作流阶段",render:s=><div className="max-w-xs">
      <div className="font-medium text-ink">{s.label.split("（")[0]}</div>
      {s.label.includes("（")&&<div className="text-xs text-ink-4">{s.label.slice(s.label.indexOf("（"))}</div>}
     </div>},
     {key:"current",label:"生效模型",render:s=><span className="block max-w-[200px] break-all font-mono text-xs">
      {s.embedding&&!s.effective.model?"未绑定":display(s.effective.model)}</span>},
     {key:"source",label:"来源",render:s=><Badge tone={s.current.source==="admin"?"accent":"muted"}>
      {s.current.source==="admin"?"单独指定":s.effective.source==="env"?"环境变量":s.embedding&&!s.effective.model?"需单独指定":"继承默认"}
     </Badge>},
     {key:"select",label:"更改绑定",render:s=><ModelBinding
      key={s.key+":"+s.current.source+":"+s.current.model} step={s} choices={choices}/>},
    ]}/>
   </Card>
  </details>
 </AdminPage>;
}
