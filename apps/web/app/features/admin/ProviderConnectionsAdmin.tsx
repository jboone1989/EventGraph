import {useRef,useState} from "react";
import {complexityFromModelId} from "@aihot/contracts/providers";
import type {ProviderManagement,ProviderConnection,RegisteredModel,ConnectionInput,ModelInput} from "@aihot/contracts/providers";
import {Button,ButtonLink,Input,Select,Textarea,Card,Badge,DataTable} from "./ui";
import {useAdminAction} from "./action";

type Problem={detail:string;fieldErrors?:Record<string,string>;dependencies?:Array<{kind:string;id:string;name:string}>};
type TestResult={status:string;elapsedMs:number;detail:string};
const vendors=[["deepseek","DeepSeek"],["openai","OpenAI"],["anthropic","Anthropic"],["nvidia","NVIDIA"],["zhipu","智谱 AI"],["openrouter","OpenRouter"],["groq","Groq"],["gemini","Google Gemini"],["zai","Z.AI"],["cloudflare","Cloudflare Workers AI"],["custom","自定义"]] as const;
const vendorLabel=(id:string)=>vendors.find(v=>v[0]===id)?.[1]??id;
const connectionLabel=(connection:ProviderConnection)=>connection.name+" · "+vendorLabel(connection.vendor);
const defaultUrl=(id:string)=>({
 deepseek:"https://api.deepseek.com",openai:"https://api.openai.com/v1",
 anthropic:"https://api.anthropic.com",nvidia:"https://integrate.api.nvidia.com/v1",
 zhipu:"https://open.bigmodel.cn/api/paas/v4",openrouter:"https://openrouter.ai/api/v1",
  groq:"https://api.groq.com/openai/v1",gemini:"https://generativelanguage.googleapis.com/v1beta/openai",
  zai:"https://api.z.ai/api/paas/v4",cloudflare:"https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1"
} as Record<string,string>)[id]??"";
const defaultProtocol=(id:string):ConnectionInput["protocol"]=>id==="anthropic"?"anthropic-compatible":"openai-compatible";
const capabilitiesFor=(adapter:ModelInput["adapter"]):ModelInput["capabilities"]=>({
 chat:["text"],embedding:["embedding"],document:["document"],safety:["safety"]
} as Partial<Record<ModelInput["adapter"],ModelInput["capabilities"]>>)[adapter]??[];
const probeFor=(adapter:ModelInput["adapter"]):ModelInput["probeSpec"]=>
 adapter==="chat"?{capability:"text",body:{messages:[{role:"user",content:"Reply OK"}]},response:"chat"}:
 adapter==="embedding"?{capability:"embedding",body:{input:"sample"},response:"embedding"}:null;
const officialOutput=(m:RegisteredModel):string=>{
 const data=m.upstreamMetadata?.openrouterFreeSync as {outputModalities?:unknown;endpoints?:unknown}|undefined;
 const output=Array.isArray(data?.outputModalities)?data.outputModalities.filter((v):v is string=>typeof v==='string'):[];
 if(output.length)return output.join(' / ');
 const endpoints=Array.isArray(data?.endpoints)?data.endpoints.filter((v):v is string=>typeof v==='string'):[];
 if(endpoints.length)return endpoints.join(' / ');
 return ({chat:'chat',embedding:'embedding',document:'document',safety:'safety'} as Record<string,string>)[m.adapter]??'未标注';
};
const modelTestSpec=(m:RegisteredModel)=>m.probeSpec??probeFor(m.adapter);
const modelInput=(m:RegisteredModel):ModelInput=>({
 providerId:m.providerId,modelId:m.modelId,adapter:m.adapter,endpointOverride:m.endpointOverride,
 timeoutOverrideMs:m.timeoutOverrideMs,capabilities:m.capabilities,requestDefaults:m.requestDefaults,
 probeSpec:m.probeSpec,stream:m.stream,complexity:m.complexity,billing:m.billing,documentationUrl:m.documentationUrl,
 notes:m.notes,enabled:m.enabled,routeEnabled:m.routeEnabled
});
function Modal({title,busy,onClose,children}:{title:string;busy:boolean;onClose:()=>void;children:React.ReactNode}){
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
  <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-panel bg-surface p-5">
   <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{title}</h3>
    <Button disabled={busy} onClick={onClose}>关闭</Button></div>{children}
  </section>
 </div>;
}
function ErrorMessage({problem}:{problem:Problem|null}){
 return problem&&<div role="alert" className="space-y-1 text-sm text-hot">
  <p>{problem.detail}</p>
  {problem.dependencies?.map(x=><p key={x.kind+x.id}>{x.name} 仍在使用此记录</p>)}
 </div>;
}

/** Table 1: provider_connections. Does not create, edit, or test models. */
export function ProviderConnectionsAdmin({data}:{data:ProviderManagement}){
 const {run,busy}=useAdminAction();
 const [editor,setEditor]=useState<ProviderConnection|null|undefined>();
 const [deleting,setDeleting]=useState<ProviderConnection|null>(null);
 const [problem,setProblem]=useState<Problem|null>(null);
 const [notice,setNotice]=useState("");
 async function save(input:ConnectionInput){
  setProblem(null);
  const old=editor??null;
  const result=await run<ProviderConnection>(old?"PATCH":"POST",
   old?"/api/admin/providers/"+old.id:"/api/admin/providers",
   {...input,...(old?{version:old.version}:{}),reason:"后台"+(old?"修改":"新增")+"厂商连接："+input.vendor},
   {onError:setProblem});
  if(result){setEditor(undefined);setNotice("已保存厂商连接："+result.name);}
 }
 async function remove(){
  if(!deleting)return;
  setProblem(null);
  const result=await run<{deleted:true}>("DELETE","/api/admin/providers/"+deleting.id,
   {version:deleting.version,reason:"后台删除厂商连接："+deleting.id},{onError:setProblem});
  if(result){setNotice("已删除厂商连接："+deleting.id);setDeleting(null);}
 }
 return <div className="space-y-4">
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  <div className="flex flex-wrap items-center justify-between gap-2">
   <p className="text-sm text-ink-3">仅管理 API 连接与密钥；模型在独立页面维护。</p>
   <Button disabled={busy} onClick={()=>{setProblem(null);setEditor(null);}}>＋ 新增连接</Button>
  </div>
  <Card title={"厂商连接（"+data.providers.length+"）"}>
   <DataTable rows={data.providers} rowKey={c=>c.id} empty="尚无厂商连接" columns={[
    {key:"vendor",label:"厂商",render:c=>vendorLabel(c.vendor)},
    {key:"name",label:"连接名称",render:c=>c.name},
    {key:"id",label:"连接 ID",render:c=><span className="break-all font-mono text-xs">{c.id}</span>},
    {key:"url",label:"API 地址",render:c=><span className="break-all text-xs">{c.baseUrl}</span>},
    {key:"key",label:"密钥",render:c=><Badge tone={c.credential.configured?"ok":"warn"}>{c.credential.configured?"已配置":"未配置"}</Badge>},
    {key:"state",label:"状态",render:c=><Badge tone={c.enabled?"ok":"muted"}>{c.enabled?"启用":"停用"}</Badge>},
    {key:"ops",label:"操作",render:c=><div className="flex gap-1">
     <Button size="sm" disabled={busy} onClick={()=>{setProblem(null);setEditor(c);}}>编辑</Button>
     <Button size="sm" disabled={busy} onClick={()=>{setProblem(null);setDeleting(c);}}>删除</Button>
    </div>}
   ]}/>
  </Card>
  {editor!==undefined&&<ConnectionDialog key={editor?.id??"new"} connection={editor}
   connections={data.providers} busy={busy} problem={problem} onClose={()=>setEditor(undefined)} onSave={save}/>}
  {deleting&&<Modal title={"删除连接："+deleting.id} busy={busy} onClose={()=>setDeleting(null)}>
   <p className="text-sm">删除连接前，需要先删除关联的模型。不会连带删除模型。</p>
   <ErrorMessage problem={problem}/>
   <div className="flex gap-2"><Button disabled={busy} onClick={remove}>确认删除</Button>
    <Button disabled={busy} onClick={()=>setDeleting(null)}>取消</Button></div>
  </Modal>}
 </div>;
}
function ConnectionDialog({connection,connections,busy,problem,onClose,onSave}:{
 connection:ProviderConnection|null;connections:ProviderConnection[];busy:boolean;problem:Problem|null;
 onClose:()=>void;onSave:(input:ConnectionInput)=>Promise<void>;
}){
 const known=vendors.some(v=>v[0]===connection?.vendor&&v[0]!=="custom");
 const [vendor,setVendor]=useState(connection?(known?connection.vendor:"custom"):"deepseek");
 const [customVendor,setCustomVendor]=useState(connection&&!known?connection.vendor:"");
 const [name,setName]=useState(connection?.name??"");
 const [baseUrl,setBaseUrl]=useState(connection?.baseUrl??defaultUrl("deepseek"));
 const [protocol,setProtocol]=useState<ConnectionInput["protocol"]>(connection?.protocol??defaultProtocol("deepseek"));
 const [timeout,setTimeout]=useState(String(connection?.timeoutMs??60000));
 const [enabled,setEnabled]=useState(connection?.enabled??true);
 const [apiKey,setApiKey]=useState("");
 const [error,setError]=useState("");
 function switchVendor(v:string){setVendor(v);setBaseUrl(defaultUrl(v));setProtocol(defaultProtocol(v));}
 async function save(){
  setError("");
  const id=vendor==="custom"?customVendor.trim():vendor;
  if(!id||!baseUrl.trim()||!Number.isInteger(Number(timeout))||Number(timeout)<1000){
   setError("请填写厂商、有效 API 地址及超时时间");return;
  }
  if(!connection&&!apiKey.trim()){setError("请输入 API Key");return;}
  let chosenName=name.trim();
  if(!chosenName){chosenName=id;let i=2;while(connections.some(c=>c.id!==connection?.id&&c.name===chosenName)){chosenName=id+"-"+i++;}}
  if(connections.some(c=>c.id!==connection?.id&&c.name===chosenName)){setError("连接名称已存在，请给不同账户取不同名称");return;}
  await onSave({name:chosenName,vendor:id,protocol,baseUrl:baseUrl.trim(),timeoutMs:Number(timeout),enabled,
   credential:apiKey.trim()?{action:"replace",value:apiKey.trim()}:{action:"keep"}});
 }
 return <Modal title={connection?"编辑厂商连接":"新增厂商连接"} busy={busy} onClose={onClose}>
  <label className="block space-y-1 text-sm">厂商
   <Select aria-label="厂商" value={vendor} disabled={busy} onChange={e=>switchVendor(e.target.value)}>
    {vendors.map(([id,label])=><option key={id} value={id}>{label}</option>)}
   </Select>
  </label>
  <label className="block space-y-1 text-sm">连接名称
   <Input aria-label="连接名称" disabled={busy} value={name} onChange={e=>setName(e.target.value)} placeholder="Groq-账号A（留空自动生成）"/>
  </label>
  {vendor==="custom"&&<label className="block space-y-1 text-sm">自定义厂商标识
   <Input value={customVendor} disabled={busy} onChange={e=>setCustomVendor(e.target.value)} placeholder="siliconflow"/>
  </label>}
  <label className="block space-y-1 text-sm">API Key
   <Input aria-label="API Key" type="password" autoComplete="new-password" disabled={busy} value={apiKey}
    placeholder={connection?"留空保持原密钥":"输入 API Key"} onChange={e=>setApiKey(e.target.value)}/>
  </label>
  <label className="block space-y-1 text-sm">API Base URL
   <Input aria-label="API Base URL" disabled={busy} value={baseUrl} onChange={e=>setBaseUrl(e.target.value)}/>
   {vendor==="cloudflare"&&<span className="text-xs text-ink-4">请将 ACCOUNT_ID 换成 Cloudflare 的 32 位账户 ID，使用 Workers Free 套餐以避免超额扣费。</span>}
   {vendor==="gemini"&&<span className="text-xs text-ink-4">Gemini 仅 Free Tier 请求免费，付费项目按量收费。</span>}
  </label>
  <label className="block space-y-1 text-sm">API 协议
   <Select aria-label="API 协议" disabled={busy} value={protocol} onChange={e=>setProtocol(e.target.value as ConnectionInput["protocol"])}>
    <option value="openai-compatible">OpenAI Compatible</option>
    <option value="anthropic-compatible">Anthropic Compatible</option>
   </Select>
  </label>
  <details className="space-y-2 text-sm"><summary className="cursor-pointer">高级设置</summary>
   <label className="mt-2 block space-y-1">超时（毫秒）
    <Input aria-label="超时" type="number" disabled={busy} value={timeout} onChange={e=>setTimeout(e.target.value)}/>
   </label>
   <label className="flex items-center gap-2"><input aria-label="启用连接" type="checkbox" checked={enabled}
    disabled={busy} onChange={e=>setEnabled(e.target.checked)}/>启用连接</label>
  </details>
  {error&&<p role="alert" className="text-sm text-hot">{error}</p>}
  <ErrorMessage problem={problem}/>
  <Button disabled={busy} onClick={save}>保存连接</Button>
 </Modal>;
}

/** Table 2: registered_models. The provider FK is selected from the live connection table. */
export function RegisteredModelsAdmin({data}:{data:ProviderManagement}){
 const {run,busy}=useAdminAction();
 const [search,setSearch]=useState("");
 const [providerFilter,setProviderFilter]=useState("");
 const [billingFilter,setBillingFilter]=useState("");
 const [adapterFilter,setAdapterFilter]=useState("");
 const [complexityFilter,setComplexityFilter]=useState("");
 const [enabledFilter,setEnabledFilter]=useState("");
 const [testFilter,setTestFilter]=useState("");
 const [page,setPage]=useState(1);
 const [editor,setEditor]=useState<RegisteredModel|null|undefined>();
 const [deleting,setDeleting]=useState<RegisteredModel|null>(null);
 const [problem,setProblem]=useState<Problem|null>(null);
 const [notice,setNotice]=useState("");
 const [testing,setTesting]=useState<Record<string,boolean>>({});
 const [testResults,setTestResults]=useState<Record<string,TestResult>>({});
 const [batch,setBatch]=useState<{total:number;completed:number;passed:number;failed:number;skipped:number}|null>(null);
 const [batchRunning,setBatchRunning]=useState(false);
 const batchLock=useRef(false);
 const activeTests=useRef(new Set<string>());
 const names=new Map(data.providers.map(c=>[c.id,connectionLabel(c)]));
 const testStatus=(m:RegisteredModel)=>{
  const status=testResults[m.id]?.status??m.checks.find(c=>c.capability===modelTestSpec(m)?.capability)?.status;
  return status==="verified"?"passed":status&&status!=="unverified"?"failed":"untested";
 };
 const matching=data.models.filter(m=>
  [m.modelId,m.id,m.providerId,names.get(m.providerId)??""].join(" ").toLowerCase().includes(search.trim().toLowerCase())&&
  (!providerFilter||m.providerId===providerFilter)&&(!billingFilter||m.billing===billingFilter)&&
  (!adapterFilter||officialOutput(m)===adapterFilter)&&(!complexityFilter||m.complexity===complexityFilter)&&
  (!enabledFilter||(enabledFilter==="enabled" ? m.enabled : !m.enabled))&&
  (!testFilter||testStatus(m)===testFilter)
 );
 const PAGE_SIZE=20;
 const pageCount=Math.max(1,Math.ceil(matching.length/PAGE_SIZE));
 const currentPage=Math.min(page,pageCount);
 const visible=matching.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
 const paidCount=matching.filter(m=>m.billing==="paid"&&modelTestSpec(m)).length;
 function resetPage(set:(value:string)=>void,value:string){set(value);setPage(1);}
 function clearFilters(){
  setSearch("");setProviderFilter("");setBillingFilter("");setAdapterFilter("");
  setComplexityFilter("");setEnabledFilter("");setTestFilter("");setPage(1);
 }
 async function save(input:ModelInput){
  setProblem(null);
  const old=editor??null;
  const result=await run<RegisteredModel>(old?"PATCH":"POST",
   old?"/api/admin/provider-models/"+old.id:"/api/admin/providers/"+input.providerId+"/models",
   {...input,...(old?{version:old.version}:{}),reason:"后台"+(old?"修改":"新增")+"模型："+input.modelId},
   {onError:setProblem});
  if(result){setEditor(undefined);setNotice("已保存模型："+result.modelId);}
 }
 async function remove(){
  if(!deleting)return;
  setProblem(null);
  const result=await run<{deleted:true}>("DELETE","/api/admin/provider-models/"+deleting.id,
   {version:deleting.version,reason:"后台删除模型："+deleting.modelId},{onError:setProblem});
  if(result){setDeleting(null);setNotice("已删除模型："+deleting.modelId);}
 }
 async function testModel(m:RegisteredModel):Promise<TestResult|null>{
  if(activeTests.current.has(m.id))return null;
  if(!modelTestSpec(m)){
   const missing={status:"failed",elapsedMs:0,detail:"此模型的上游 API 尚未接入测试适配器。"};
   setTestResults(prev=>({...prev,[m.id]:missing}));return missing;
  }
  activeTests.current.add(m.id);
  setTesting(prev=>({...prev,[m.id]:true}));
  let failure="网络请求失败，未收到测试结果";
  try{
   const result=await run<TestResult>("POST","/api/admin/provider-models/"+m.id+"/test",
    {capability:modelTestSpec(m)!.capability},{label:"probe:"+m.id,background:true,revalidate:false,quietError:true,
     onError:p=>{failure=p.detail;}});
   const finalResult=result??{status:"failed",elapsedMs:0,detail:failure};
   setTestResults(prev=>({...prev,[m.id]:finalResult}));
   return finalResult;
  }finally{activeTests.current.delete(m.id);setTesting(prev=>({...prev,[m.id]:false}));}
 }
 async function testFiltered(){
  if(batchLock.current||!matching.length)return;
  const targets=[...matching];
  const countPaid=targets.filter(m=>m.billing==="paid"&&modelTestSpec(m)).length;
  if(countPaid&&!window.confirm("将测试 "+targets.length+" 个匹配模型，其中 "+countPaid+" 个标为付费，真实 API 请求可能产生费用。确认继续？"))return;
  batchLock.current=true;setBatchRunning(true);
  const stats={total:targets.length,completed:0,passed:0,failed:0,skipped:0};
  setBatch({...stats});
  let cursor=0;
  async function worker(){
   while(cursor<targets.length){
    const model=targets[cursor++];
    if(!model)break;
    if(!modelTestSpec(model)||activeTests.current.has(model.id)){
     stats.skipped++;stats.completed++;setBatch({...stats});continue;
    }
    try{
     const result=await testModel(model);
     if(result?.status==="verified")stats.passed++;
     else if(result)stats.failed++;
     else stats.skipped++;
    }catch{stats.failed++;}
    stats.completed++;setBatch({...stats});
   }
  }
  try{await Promise.all([worker(),worker()]);}
  finally{batchLock.current=false;setBatchRunning(false);}
 }
 const filters=[
  {label:"厂商连接",value:providerFilter,change:setProviderFilter,options:data.providers.map(p=>({value:p.id,label:p.name+" · "+vendorLabel(p.vendor)}))},
  {label:"费用",value:billingFilter,change:setBillingFilter,options:[{value:"free",label:"免费"},{value:"paid",label:"付费"}]},
  {label:"模型类型",value:adapterFilter,change:setAdapterFilter,options:[...new Set(data.models.map(officialOutput))].map(v=>({value:v,label:v}))},
  {label:"模型档位",value:complexityFilter,change:setComplexityFilter,options:[{value:"light",label:"轻量"},{value:"medium",label:"标准"},{value:"heavy",label:"高级"}]},
  {label:"启用状态",value:enabledFilter,change:setEnabledFilter,options:[{value:"enabled",label:"启用"},{value:"disabled",label:"停用"}]},
  {label:"测试结果",value:testFilter,change:setTestFilter,options:[{value:"passed",label:"通过"},{value:"failed",label:"失败"},{value:"untested",label:"未测试"}]}
 ];
 return <div className="space-y-4">
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  <div className="flex flex-wrap items-center justify-between gap-2">
   <Input aria-label="搜索模型" className="max-w-sm" placeholder="模型 ID / UUID / 连接名称" value={search} onChange={e=>resetPage(setSearch,e.target.value)}/>
   <div className="flex gap-2">
    <ButtonLink to="/admin/connections">厂商连接</ButtonLink>
    <Button disabled={busy||!data.providers.length} onClick={()=>{setProblem(null);setEditor(null);}}>＋ 新增模型</Button>
   </div>
  </div>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
   {filters.map(f=><label key={f.label} className="min-w-0 space-y-1 text-xs text-ink-3">{f.label}
    <Select aria-label={f.label} value={f.value} onChange={e=>resetPage(f.change,e.target.value)}>
     <option value="">全部</option>
     {f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
   </label>)}
  </div>
  <div className="flex flex-wrap items-center gap-2 text-sm">
   <span role="status">匹配 {matching.length} / 共 {data.models.length} 个模型</span>
   <Button size="sm" onClick={clearFilters}>清空筛选</Button>
   <Button size="sm" disabled={batchRunning||!matching.length} onClick={()=>void testFiltered()}>
    {batchRunning?"批量测试中…":"一键测试筛选结果（"+matching.length+"）"}
   </Button>
   {paidCount>0&&<span className="text-xs text-ink-3">其中可测试付费模型 {paidCount} 个</span>}
  </div>
  {batch&&<p role="status" className="text-sm">批量测试：{batch.completed}/{batch.total} · 通过 {batch.passed} · 失败 {batch.failed} · 跳过 {batch.skipped}{batchRunning?" · 进行中":" · 已结束"}</p>}
  <Card title={"模型（"+matching.length+" / "+data.models.length+"）"}>
   <DataTable rows={visible} rowKey={m=>m.id} empty="没有匹配的模型，请调整筛选条件或清空筛选。" columns={[
    {key:"id",label:"模型 ID",render:m=><div className="space-y-1"><span className="block break-all font-mono text-xs">{m.modelId}</span><span className="block break-all font-mono text-xs text-ink-4" title="EventGraph 内部模型 UUID">{m.id}</span></div>},
    {key:"provider",label:"厂商连接",render:m=>names.get(m.providerId)??m.providerId},
    {key:"adapter",label:"上游模型类型",render:m=><span title={JSON.stringify((m.upstreamMetadata?.openrouterFreeSync as {endpoints?:unknown}|undefined)?.endpoints??[])}>{officialOutput(m)}</span>},
    {key:"billing",label:"计费",render:m=>m.billing==="free"?"免费":"付费"},
    {key:"complexity",label:"档位",render:m=>({light:"轻量",medium:"标准",heavy:"高级"})[m.complexity]},
    {key:"status",label:"状态",render:m=><Badge tone={m.enabled?"ok":"muted"}>{m.enabled?"启用":"停用"}</Badge>},
    {key:"ops",label:"操作",render:m=>{
     const latest=testResults[m.id],record=m.checks.find(c=>c.capability===modelTestSpec(m)?.capability);
     const status=latest?.status??record?.status;
     return <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" disabled={busy||!!testing[m.id]} onClick={()=>{setProblem(null);setEditor(m);}}>编辑</Button>
      <Button size="sm" disabled={!modelTestSpec(m)||!!testing[m.id]} onClick={()=>void testModel(m)}>{testing[m.id]?"测试中…":!modelTestSpec(m)?"尚未接入测试":"测试"}</Button>
      {status&&<Badge tone={status==="verified"?"ok":status==="unverified"?"muted":"bad"}>
       {status==="verified"?"通过":status==="unverified"?"待测":"失败"}</Badge>}
      <Button size="sm" disabled={busy||!!testing[m.id]} onClick={()=>{setProblem(null);setDeleting(m);}}>删除</Button>
      {latest&&<span role="status" className={"block max-w-sm break-words text-xs "+(latest.status==="verified"?"text-ink-3":"text-hot")}>
       {latest.elapsedMs} ms · {latest.detail}</span>}
     </div>;
    }}
   ]}/>
   <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
    <span>第 {currentPage} / {pageCount} 页 · 每页 {PAGE_SIZE} 条</span>
    <div className="flex gap-2">
     <Button size="sm" disabled={currentPage===1} onClick={()=>setPage(n=>Math.max(1,n-1))}>上一页</Button>
     <Button size="sm" disabled={currentPage===pageCount} onClick={()=>setPage(n=>Math.min(pageCount,n+1))}>下一页</Button>
    </div>
   </div>
  </Card>
  {editor!==undefined&&<ModelDialog key={editor?.id??"new"} model={editor} providers={data.providers} busy={busy}
   problem={problem} onClose={()=>setEditor(undefined)} onSave={save}/>}
  {deleting&&<Modal title={"删除模型："+deleting.modelId} busy={busy} onClose={()=>setDeleting(null)}>
   <p className="text-sm">删除该模型将同时解除它的工作流绑定，不影响其他模型。</p>
   <ErrorMessage problem={problem}/>
   <div className="flex gap-2"><Button disabled={busy} onClick={remove}>确认删除</Button>
    <Button disabled={busy} onClick={()=>setDeleting(null)}>取消</Button></div>
  </Modal>}
 </div>;
}
function ModelDialog({model,providers,busy,problem,onClose,onSave}:{
 model:RegisteredModel|null;providers:ProviderConnection[];busy:boolean;problem:Problem|null;
 onClose:()=>void;onSave:(input:ModelInput)=>Promise<void>;
}){
 const [providerId,setProviderId]=useState(model?.providerId??providers[0]?.id??"");
 const [modelId,setModelId]=useState(model?.modelId??"");
 const [adapter,setAdapter]=useState<ModelInput["adapter"]>(model?.adapter??"chat");
 const [complexity,setComplexity]=useState<ModelInput["complexity"]>(model?.complexity??"medium");
 const [billing,setBilling]=useState<"free"|"paid">(model?.billing??"paid");
 const inferBilling=(id:string,selectedId=providerId):"free"|"paid"=>{
  const c=providers.find(p=>p.id===selectedId);
  return (c?.vendor.toLowerCase()==="openrouter"&&(id.endsWith(":free")||id==="openrouter/free"))||(c?.vendor.toLowerCase()==="nvidia"&&c.policy==="nvidia-free-trial")?"free":"paid";
 };
 const [enabled,setEnabled]=useState(model?.enabled??true);
 const [routeEnabled,setRouteEnabled]=useState(model?.routeEnabled??false);
 const [vision,setVision]=useState(model?.capabilities.includes("vision")??false);
 const [notes,setNotes]=useState(model?.notes??"");
 const [endpoint,setEndpoint]=useState(model?.endpointOverride??"");
 const [timeout,setTimeout]=useState(model?.timeoutOverrideMs?.toString()??"");
 const [probe,setProbe]=useState(JSON.stringify(model?.probeSpec??probeFor(model?.adapter??"chat"),null,2));
 const [error,setError]=useState("");
 function selectAdapter(value:ModelInput["adapter"]){
  setAdapter(value);setVision(false);
  if(!model||value!==model.adapter)setProbe(JSON.stringify(probeFor(value),null,2));
 }
 async function save(){
  setError("");
  if(!providerId||!modelId.trim()){setError("请选择厂商连接并输入模型 ID");return;}
  let probeSpec:ModelInput["probeSpec"];
  try{probeSpec=JSON.parse(probe) as ModelInput["probeSpec"];}
  catch{setError("测试配置必须为有效 JSON");return;}
  if(timeout&&(!Number.isInteger(Number(timeout))||Number(timeout)<1)){
   setError("超时时间必须为正整数");return;
  }
  const capabilities=model&&model.adapter===adapter?[...model.capabilities]:capabilitiesFor(adapter);
  if(adapter==="chat"){
   if(!capabilities.includes("text"))capabilities.push("text");
   if(vision&&!capabilities.includes("vision"))capabilities.push("vision");
   if(!vision){const i=capabilities.indexOf("vision");if(i>=0)capabilities.splice(i,1);}
  }
  await onSave({
   ...(model?modelInput(model):{
    providerId,modelId,adapter,endpointOverride:null,timeoutOverrideMs:null,
    capabilities,requestDefaults:{},probeSpec,stream:false,complexity:"medium" as const,billing,
    documentationUrl:null,notes:null,enabled,routeEnabled:false
   }),
   providerId,modelId:modelId.trim(),adapter,complexity,billing,enabled,routeEnabled:enabled&&routeEnabled,
   capabilities,probeSpec,endpointOverride:endpoint.trim()||null,
   timeoutOverrideMs:timeout?Number(timeout):null,notes:notes.trim()||null
  });
 }
 return <Modal title={model?"编辑模型":"新增模型"} busy={busy} onClose={onClose}>
  <label className="block space-y-1 text-sm">厂商连接
   <Select aria-label="厂商连接" disabled={busy} value={providerId} onChange={e=>{setProviderId(e.target.value);setBilling(inferBilling(modelId,e.target.value));}}>
    {providers.map(c=><option key={c.id} value={c.id}>{connectionLabel(c)} · {c.id}</option>)}
   </Select>
  </label>
  <label className="block space-y-1 text-sm">模型 ID
   <Input aria-label="模型 ID" disabled={busy} value={modelId} onChange={e=>{setModelId(e.target.value);if(!model)setComplexity(complexityFromModelId(e.target.value));setBilling(inferBilling(e.target.value));}} placeholder="填入官方模型 ID"/>
  </label>
  {model&&<p className="text-xs text-ink-4">上游输出类型：{officialOutput(model)}（不等同于调用适配器）</p>}
  <label className="block space-y-1 text-sm">调用适配器
   <Select aria-label="调用适配器" disabled={busy} value={adapter} onChange={e=>selectAdapter(e.target.value as ModelInput["adapter"])}>
    {["chat","embedding","document","safety","unconfigured"].map(x=><option key={x} value={x}>{x}</option>)}
   </Select>
  </label>
  {adapter==="chat"&&<label className="flex items-center gap-2 text-sm">
   <input type="checkbox" checked={vision} disabled={busy} onChange={e=>setVision(e.target.checked)}/>支持图像输入
  </label>}
  <label className="block space-y-1 text-sm">计费方式
   <Select aria-label="计费方式" disabled={busy} value={billing} onChange={e=>setBilling(e.target.value as "free"|"paid")}>
    <option value="free">免费</option><option value="paid">付费</option>
   </Select>
  </label>
  {adapter==="chat"&&<label className="block space-y-1 text-sm">模型能力等级
   <Select aria-label="模型能力等级" disabled={busy} value={complexity}
    onChange={e=>setComplexity(e.target.value as ModelInput["complexity"])}>
    <option value="light">轻量 · 预筛、摘要、用词</option>
    <option value="medium">标准 · 翻译、评分、事实抽取</option>
    <option value="heavy">高级 · 深度理解、事件关系、日报</option>
   </Select>
  </label>}
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={busy}
   onChange={e=>setEnabled(e.target.checked)}/>启用模型</label>
  <label className="block space-y-1 text-sm">备注
   <Textarea rows={2} disabled={busy} value={notes} onChange={e=>setNotes(e.target.value)}/>
  </label>
  <details className="space-y-2 text-sm"><summary className="cursor-pointer">高级设置（可选）</summary>
   <div className="mt-2 space-y-3">
    <label className="block space-y-1">模型 API 地址覆盖
     <Input disabled={busy} value={endpoint} onChange={e=>setEndpoint(e.target.value)}/>
    </label>
    <label className="block space-y-1">模型超时覆盖（毫秒）
     <Input type="number" disabled={busy} value={timeout} onChange={e=>setTimeout(e.target.value)}/>
    </label>
    <label className="block space-y-1">测试配置（JSON）
     <Textarea rows={5} disabled={busy} value={probe} onChange={e=>setProbe(e.target.value)}/>
    </label>
    <label className="flex items-center gap-2"><input type="checkbox" disabled={busy||!enabled}
     checked={routeEnabled} onChange={e=>setRouteEnabled(e.target.checked)}/>允许自动路由（实际请求决定可用性）</label>
   </div>
  </details>
  {error&&<p role="alert" className="text-sm text-hot">{error}</p>}
  <ErrorMessage problem={problem}/>
  <Button disabled={busy} onClick={save}>保存模型</Button>
 </Modal>;
}
