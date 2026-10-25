import {useState} from 'react';
import {useRevalidator} from 'react-router';
import type {ProviderManagement,ProviderConnection,RegisteredModel,ConnectionInput,ModelInput,ModelCapability} from '@aihot/contracts/providers';
import {Button,Input,Select,Textarea,Card,Badge,Time} from './ui';
import {workflowStageStatus} from './workflow-status';
import {useAdminAction} from './action';

type Problem={detail:string;fieldErrors?:Record<string,string>;dependencies?:Array<{kind:string;id:string;name:string}>};
type Editor={kind:'connection';value:ProviderConnection|null;readOnly?:boolean}|{kind:'model';value:RegisteredModel|null;providerId:string;readOnly?:boolean};
const caps:ModelCapability[]=['text','reasoning','vision','embedding','embedding_vision','document','safety','translation','coding','video','reward'];
const defaultProbe={capability:'text',body:{messages:[{role:'user',content:'Reply OK'}]},response:'chat'};

export function ProviderConnectionsAdmin({data}:{data:ProviderManagement}) {
 const {run,busy:actionBusy}=useAdminAction();
 const revalidator=useRevalidator();
 const [bulkTesting,setBulkTesting]=useState(false);
 const [batchResults,setBatchResults]=useState<Array<{model:string;status:string;detail:string}>>([]);
 const busy=actionBusy||bulkTesting;
 const [editor,setEditor]=useState<Editor|null>(null),[problem,setProblem]=useState<Problem|null>(null);
 const [provider,setProvider]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const [notice,setNotice]=useState(''),[reason,setReason]=useState('');
 const [deleting,setDeleting]=useState<{kind:'connection'|'model';id:string;version:number;name:string}|null>(null);
 const [discovery,setDiscovery]=useState<{id:string;models:Array<{modelId:string;status:string}>}|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [workflow,setWorkflow]=useState<{key:string;model:string}|null>(null);
 const command=async<T,>(method:'POST'|'PATCH'|'DELETE',path:string,body?:unknown)=>{
  setProblem(null);return run<T>(method,path,body,{onError:setProblem});
 };
 const open=(e:Editor)=>{setProblem(null);setEditor(e)};
 const models=data.models.filter(m=>(!provider||m.providerId===provider)&&(!search||[m.modelId,data.providers.find(c=>c.id===m.providerId)?.name??'',...m.capabilities].join(' ').toLowerCase().includes(search.toLowerCase())));
 const pages=Math.max(1,Math.ceil(models.length/20)),current=Math.min(page,pages);
 const visibleModels=models.slice((current-1)*20,current*20);
 const testableModels=models.filter(m=>m.enabled&&m.probeSpec);
 async function testPage() {
  if(bulkTesting||!testableModels.length)return;
  setBulkTesting(true);
  setBatchResults([]);
  try {
   // Existing authenticated API performs the capability probe and saves the result.
   // These are independent requests, not a new testing worker or an invented shared timeout.
   const results=await Promise.all(testableModels.map(async m=>{
    const response=await run<{status:string;elapsedMs:number;detail:string}>(
      'POST','/api/admin/provider-models/'+m.id+'/test',
      {capability:m.probeSpec!.capability},
      {label:'batch-probe-'+m.id,revalidate:false});
    return {model:m.modelId,status:response?.status??'failed',
      detail:response?response.elapsedMs+' ms · '+response.detail:'测试失败，请查看具体请求或审计记录'};
   }));
   setBatchResults(results);
   setNotice('已完成 '+results.length+' 项独立能力测试；逐项结果见下方。');
   revalidator.revalidate();
  } finally {setBulkTesting(false);}
 }

 async function discover(c:ProviderConnection) {
  const result=await command<{models:Array<{modelId:string;status:string}>}>('POST','/api/admin/providers/'+c.id+'/discover');
  if(result){setSelected([]);setReason('');setDiscovery({id:c.id,models:result.models})}
 }
 const errors=problem&&<div role="alert" className="space-y-1 text-sm text-hot"><p>{problem.detail}</p>{problem.dependencies?.map(d=><p key={d.kind+d.id}>{d.kind==='model'?'模型':'工作流'}：{d.name}</p>)}</div>;
 return <div className="space-y-5">
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  {!editor&&!deleting&&!discovery&&!workflow&&errors}
  <Card title="工作流路由 · 当前实际选择" right={<span className="text-xs text-ink-3">绑定 ≠ 可用 · 按阶段独立验证</span>}>
   <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
    模型已添加、已启用、允许路由及完成有效能力测试是不同状态。点击“测试”会实际调用该 Provider；
    选择模型前先看不可路由原因，不会自动替你切换到其他服务商。
   </p>
   <div className="mb-3 flex flex-wrap gap-3 text-[12px] text-ink-3">
    <span>阶段 {data.workflows.length}</span>
    <span className="text-ok">可用 {data.workflows.filter(w=>workflowStageStatus(w,data).kind==='ready').length}</span>
    <span className="text-hot">需处理 {data.workflows.filter(w=>workflowStageStatus(w,data).kind==='problem').length}</span>
    <span>待核验 {data.workflows.filter(w=>workflowStageStatus(w,data).kind==='unverified').length}</span>
   </div>
   <div className="divide-y divide-line-soft">
    {data.workflows.map(w=>{
     const health=workflowStageStatus(w,data);
     const model=health.model;
     const provider=health.provider;
     return <div key={w.key} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center">
      <div className="min-w-0 space-y-1">
       <p className="text-[13.5px] font-semibold text-ink">{w.label}</p>
       <p className="text-[11.5px] text-ink-4">{w.source==='admin'?'后台绑定':w.source==='env'?'环境变量':'默认配置'} · {w.key}</p>
      </div>
      <div className="min-w-0 space-y-1.5">
       <div className="flex flex-wrap items-center gap-2">
        <Badge tone={health.kind==='ready'?'ok':health.kind==='problem'?'bad':'warn'}>
         {health.kind==='ready'?'可路由':health.kind==='problem'?'不可路由':'待核验'}
        </Badge>
        <span className="break-all font-mono text-[12px] text-ink-2">{model?.modelId ?? w.model ?? '未分配'}</span>
       </div>
       <p className="break-words text-[12px] text-ink-3">{provider?provider.name+' · '+provider.vendor+' · ':''}{health.reason}</p>
       {health.check&&<p className="text-[11px] text-ink-4">
        文本测试 {health.check.status} · <Time at={health.check.verifiedAt}/> {health.check.latencyMs!=null?' · '+health.check.latencyMs+' ms':''}
       </p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
       {model&&<Button size="sm" disabled={busy||!health.canTest} title={!health.canTest?'此模型未配置文本测试或连接不可用':undefined} onClick={async()=>{
        const r=await command<{status:string;elapsedMs:number;detail:string}>('POST','/api/admin/provider-models/'+model.id+'/test',{capability:'text'});
        if(r)setNotice(model.modelId+'：'+r.status+' · '+r.elapsedMs+' ms · '+r.detail);
       }}>测试</Button>}
       <Button size="sm" tone={health.kind==='problem'?'primary':'secondary'} disabled={busy}
        onClick={()=>{setProblem(null);setReason('');setWorkflow({key:w.key,model:w.model})}}>选择模型</Button>
      </div>
     </div>;
    })}
   </div>
  </Card>
  <Card title="厂商连接" right={<Button disabled={busy} onClick={()=>open({kind:'connection',value:null})}>添加连接</Button>}>
   <div className="space-y-3">{data.providers.length===0&&<p>暂无连接，请先添加厂商的 API 地址和凭据。</p>}
   {data.providers.map(c=><div key={c.id} className="space-y-2 border-b border-line pb-3">
    <div><strong>{c.name}</strong> <span className="text-xs text-ink-3">{c.vendor} · {c.enabled?'启用':'停用'} · {c.credential.configured?'已配置凭据':'缺少凭据'} · {c.timeoutMs} ms</span></div>
    <p className="break-all text-xs text-ink-3">{c.baseUrl} · {c.protocol}{c.policy!=='none'?' · 免费试用白名单保护':''}</p>
    <div className="flex flex-wrap gap-2">
     <Button size="sm" disabled={busy} onClick={()=>open({kind:'connection',value:c,readOnly:true})}>查看</Button>
     <Button size="sm" disabled={busy} onClick={()=>open({kind:'connection',value:c})}>编辑</Button>
     <Button size="sm" disabled={busy} onClick={async()=>{const r=await command<{detail:string}>('POST','/api/admin/providers/'+c.id+'/test');if(r)setNotice(r.detail)}}>测试连接</Button>
     <Button size="sm" disabled={busy} onClick={()=>discover(c)}>发现模型</Button>
     <Button size="sm" disabled={busy} onClick={()=>open({kind:'model',value:null,providerId:c.id})}>手动添加模型</Button>
     <Button size="sm" disabled={busy} onClick={()=>{setReason('');setProblem(null);setDeleting({kind:'connection',id:c.id,version:c.version,name:c.name})}}>删除</Button>
    </div>
   </div>)}</div>
  </Card>
  <Card title={'模型（'+models.length+'）'}
   right={<Button size="sm" disabled={busy||!testableModels.length} onClick={testPage}>
    {bulkTesting?'正在并发测试…':'并发测试筛选结果（'+testableModels.length+'）'}
   </Button>}>
   <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
    仅测试当前筛选结果中已启用、配置了测试请求的模型；并发发出独立请求、分别保存回执与耗时；
    可能产生 API 调用费用，不会自动修改工作流路由。
   </p>
   {batchResults.length>0&&<details role="status" open className="mb-3 rounded-control bg-bg-sunk p-3 text-[12px] text-ink-2">
    <summary className="cursor-pointer font-medium">本次能力测试 · {batchResults.filter(r=>r.status==='verified').length} / {batchResults.length} 通过 · 展开逐项耗时</summary>
    <div className="mt-2 grid max-h-64 gap-1 overflow-auto sm:grid-cols-2">
     {batchResults.map((r,i)=><p key={i} className="break-all">
      <span className={r.status==='verified'?'text-ok':'text-hot'}>{r.status==='verified'?'通过':'失败'}</span>
      {' · '+r.model+' · '+r.detail}
     </p>)}
    </div>
   </details>}
   <div className="mb-4 flex flex-wrap gap-2"><Select aria-label="按连接筛选" value={provider} onChange={e=>{setProvider(e.target.value);setPage(1)}}><option value="">全部连接</option>{data.providers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.id.slice(0,8)}</option>)}</Select>
    <Input aria-label="搜索模型" placeholder="搜索模型或能力" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></div>
   <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>连接 / 模型</th><th>能力</th><th>启用 / 路由开关 / 当前资格</th><th>操作</th></tr></thead><tbody>
    {visibleModels.map(m=><tr key={m.id} className="border-t border-line">
     <td className="p-2"><div>{data.providers.find(c=>c.id===m.providerId)?.name} · {m.providerId.slice(0,8)}</div><div className="break-all font-mono text-xs">{m.modelId}</div></td>
     <td className="p-2 text-xs">{m.capabilities.join(', ')||'未配置'}</td>
     <td className="p-2"><p>{m.enabled?'启用':'停用'} / {m.routeEnabled?'开启':'关闭'} / {m.routing.eligibleCapabilities.length?'可用：'+m.routing.eligibleCapabilities.join(', '):'不可用'}</p>
      <p className="max-w-sm text-xs text-ink-3">{m.routing.reasons.join('；')}</p><p className="text-xs">{m.checks.map(c=>c.capability+': '+c.status+(c.latencyMs==null?'':' · '+c.latencyMs+' ms')).join('；')}</p></td>
     <td className="p-2"><div className="flex flex-wrap gap-1">
      <Button size="sm" disabled={busy} onClick={()=>open({kind:'model',value:m,providerId:m.providerId,readOnly:true})}>查看</Button>
      <Button size="sm" disabled={busy} onClick={()=>open({kind:'model',value:m,providerId:m.providerId})}>编辑</Button>
      <Button size="sm" disabled={busy||!m.probeSpec} onClick={async()=>{const r=await command<{status:string;elapsedMs:number;detail:string}>('POST','/api/admin/provider-models/'+m.id+'/test',{capability:m.probeSpec?.capability});if(r)setNotice(m.modelId+'：'+r.status+' · '+r.elapsedMs+' ms · '+r.detail)}}>测试（消耗配额）</Button>
      <Button size="sm" disabled={busy} onClick={()=>{setProblem(null);setReason('');setDeleting({kind:'model',id:m.id,version:m.version,name:m.modelId})}}>删除</Button>
     </div></td>
    </tr>)}
   </tbody></table>{!models.length&&<p className="p-3">暂无匹配模型；可以从连接下手动添加。</p>}</div>
   <div className="mt-3 flex items-center gap-3"><Button size="sm" disabled={current<=1} onClick={()=>setPage(current-1)}>上一页</Button><span>{current} / {pages}</span><Button size="sm" disabled={current>=pages} onClick={()=>setPage(current+1)}>下一页</Button></div>
  </Card>
  {editor&&<ConfigurationDialog key={editor.kind+(editor.value?.id??'new')} editor={editor} providers={data.providers} busy={busy} problem={problem} onClose={()=>setEditor(null)} onSubmit={async(input,why)=>{
   const e=editor,id=e.value?.id;
   const path=e.kind==='connection'?'/api/admin/providers'+(id?'/'+id:''):id?'/api/admin/provider-models/'+id:'/api/admin/providers/'+e.providerId+'/models';
   const result=await command(id?'PATCH':'POST',path,{...input,...(id?{version:e.value!.version}:{}),reason:why});if(result)setEditor(null);
  }}/>}
  {deleting&&<Modal title={'删除 '+deleting.name} busy={busy} close={()=>setDeleting(null)}><p>请先停用；仍被模型或工作流引用时不能删除。</p>{errors}<Input aria-label="删除原因" placeholder="删除原因" value={reason} onChange={e=>setReason(e.target.value)}/><Button disabled={busy||!reason.trim()} onClick={async()=>{const r=await command('DELETE',(deleting.kind==='connection'?'/api/admin/providers/':'/api/admin/provider-models/')+deleting.id,{version:deleting.version,reason});if(r)setDeleting(null)}}>确认删除</Button></Modal>}
  {discovery&&<Modal title="选择导入模型" busy={busy} close={()=>setDiscovery(null)}><p className="text-xs">未被本次列表返回的模型保留原配置。发现接口不可用时，可手动添加。</p>{errors}<div className="max-h-80 overflow-y-auto">{discovery.models.map(m=><label className="block break-all text-sm" key={m.modelId}><input type="checkbox" disabled={m.status!=='new'||busy} checked={selected.includes(m.modelId)} onChange={e=>setSelected(e.target.checked?[...selected,m.modelId]:selected.filter(x=>x!==m.modelId))}/> {m.modelId} · {m.status==='new'?'新增':m.status==='existing'?'已存在':'本次未发现'}</label>)}</div><Input aria-label="导入原因" placeholder="导入原因" value={reason} onChange={e=>setReason(e.target.value)}/><Button disabled={busy||!selected.length||!reason.trim()} onClick={async()=>{const r=await command('POST','/api/admin/providers/'+discovery.id+'/models:import',{modelIds:selected,reason});if(r)setDiscovery(null)}}>导入所选（默认停用）</Button></Modal>}
  {workflow&&<Modal title="切换工作流模型" busy={busy} close={()=>setWorkflow(null)}>{errors}<Select aria-label="工作流模型" value={workflow.model} onChange={e=>setWorkflow({...workflow,model:e.target.value})}><option value="">使用环境或默认配置</option>{!data.models.some(m=>'model:'+m.id===workflow.model)&&workflow.model&&<option value={workflow.model}>{workflow.model}</option>}{data.models.map(m=><option key={m.id} value={'model:'+m.id}>{data.providers.find(c=>c.id===m.providerId)?.name} · {m.modelId} · {m.id.slice(0,8)}</option>)}</Select><Input aria-label="切换原因" placeholder="切换原因" value={reason} onChange={e=>setReason(e.target.value)}/><Button disabled={busy||!reason.trim()} onClick={async()=>{const r=await command('POST','/api/admin/models/'+workflow.key,{model:workflow.model||null,reason});if(r)setWorkflow(null)}}>保存选择</Button></Modal>}
 </div>;
}
function Modal({title,busy,close,children}:{title:string;busy:boolean;close:()=>void;children:React.ReactNode}) {
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-panel bg-surface p-5"><div className="flex items-center justify-between"><h3>{title}</h3><Button disabled={busy} onClick={close}>关闭</Button></div>{children}</section></div>;
}
function ConfigurationDialog({editor,providers,busy,problem,onClose,onSubmit}:{editor:Editor;providers:ProviderConnection[];busy:boolean;problem:Problem|null;onClose:()=>void;onSubmit:(input:ConnectionInput|ModelInput,reason:string)=>Promise<void>}) {
 const c=editor.kind==='connection'?editor.value:null,m=editor.kind==='model'?editor.value:null,readOnly=!!editor.readOnly;
 const [values,setValues]=useState<Record<string,string>>({name:c?.name??'',vendor:c?.vendor??'',protocol:c?.protocol??'openai-compatible',baseUrl:c?.baseUrl??'',timeoutMs:String(c?.timeoutMs??60000),credentialAction:'keep',credential:'',
  providerId:editor.kind==='model'?editor.providerId:'',modelId:m?.modelId??'',adapter:m?.adapter??'chat',endpointOverride:m?.endpointOverride??'',timeoutOverrideMs:m?.timeoutOverrideMs==null?'':String(m.timeoutOverrideMs),complexity:m?.complexity??'medium',
  requestDefaults:JSON.stringify(m?.requestDefaults??{},null,2),probeSpec:JSON.stringify(m?m.probeSpec:defaultProbe,null,2),documentationUrl:m?.documentationUrl??'',notes:m?.notes??''});
 const [enabled,setEnabled]=useState(c?.enabled??m?.enabled??false),[route,setRoute]=useState(m?.routeEnabled??false),[stream,setStream]=useState(m?.stream??false),[capabilities,setCapabilities]=useState<ModelCapability[]>(m?.capabilities??['text']),[reason,setReason]=useState(''),[error,setError]=useState('');
 const value=(key:string)=>values[key]??'',change=(key:string,v:string)=>setValues({...values,[key]:v});
 const field=(key:string,label:string,node?:React.ReactNode)=><label className="block space-y-1 text-sm"><span>{label}</span>{node??<Input disabled={readOnly||busy} value={value(key)} onChange={e=>change(key,e.target.value)}/>} {problem?.fieldErrors?.[key]&&<span role="alert" className="block text-xs text-hot">{problem.fieldErrors[key]}</span>}</label>;
 async function save(){
  setError('');try {
   const input:ConnectionInput|ModelInput=editor.kind==='connection'?{name:value('name'),vendor:value('vendor'),protocol:'openai-compatible',baseUrl:value('baseUrl'),timeoutMs:Number(value('timeoutMs')),enabled,
    credential:value('credentialAction')==='replace'?{action:'replace',value:value('credential')}:{action:value('credentialAction') as 'keep'|'clear'}}:
    {providerId:value('providerId'),modelId:value('modelId'),adapter:value('adapter') as ModelInput['adapter'],endpointOverride:value('endpointOverride')||null,timeoutOverrideMs:value('timeoutOverrideMs')?Number(value('timeoutOverrideMs')):null,
     capabilities,requestDefaults:JSON.parse(value('requestDefaults')),probeSpec:JSON.parse(value('probeSpec')),stream,complexity:value('complexity') as ModelInput['complexity'],documentationUrl:value('documentationUrl')||null,notes:value('notes')||null,enabled,routeEnabled:route};
   await onSubmit(input,reason);
  }catch{setError('请求参数或测试请求必须是有效 JSON；空测试请求请填 null。')}
 }
 return <Modal title={(readOnly?'查看':editor.value?'编辑':'添加')+(editor.kind==='connection'?'连接':'模型')} busy={busy} close={onClose}>
  {editor.kind==='connection'?<>
   {field('name','连接名称')}{field('vendor','厂商标签')}{field('protocol','调用协议',<Select disabled value="openai-compatible"><option>openai-compatible</option></Select>)}
   {field('baseUrl','API Base URL（完整路径前缀）')}{field('timeoutMs','连接超时（毫秒）')}
   <p className="text-xs">凭据状态：{c?.credential.configured?'已配置':'未配置'}；密钥不会回显。</p>
   {!readOnly&&<>{field('credentialAction','凭据操作',<Select disabled={busy} value={value('credentialAction')} onChange={e=>change('credentialAction',e.target.value)}><option value="keep">保留</option><option value="replace">替换</option><option value="clear">清除</option></Select>)}
    {value('credentialAction')==='replace'&&field('credential','新 API Key',<Input type="password" autoComplete="new-password" disabled={busy} value={value('credential')} onChange={e=>change('credential',e.target.value)}/>)}</>}
  </>:<>
   {field('providerId','所属连接',<Select disabled={readOnly||busy} value={value('providerId')} onChange={e=>change('providerId',e.target.value)}>{providers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.id.slice(0,8)}</option>)}</Select>)}
   {field('modelId','上游模型 ID')}{field('adapter','模型类型',<Select disabled={readOnly||busy} value={value('adapter')} onChange={e=>change('adapter',e.target.value)}>{['chat','embedding','document','safety','special','unconfigured'].map(x=><option key={x}>{x}</option>)}</Select>)}
   {field('endpointOverride','独立 Endpoint（留空沿用连接）')}{field('timeoutOverrideMs','独立超时（毫秒，留空沿用连接）')}
   <fieldset disabled={readOnly||busy}><legend className="text-sm">能力</legend><div className="flex flex-wrap gap-3">{caps.map(cap=><label key={cap} className="text-xs"><input type="checkbox" checked={capabilities.includes(cap)} onChange={e=>setCapabilities(e.target.checked?[...capabilities,cap]:capabilities.filter(x=>x!==cap))}/> {cap}</label>)}</div>{problem?.fieldErrors?.capabilities&&<p role="alert">{problem.fieldErrors.capabilities}</p>}</fieldset>
   {field('complexity','复杂度',<Select disabled={readOnly||busy} value={value('complexity')} onChange={e=>change('complexity',e.target.value)}>{['light','medium','heavy'].map(x=><option key={x}>{x}</option>)}</Select>)}
   {field('requestDefaults','请求默认参数（JSON）',<Textarea rows={4} disabled={readOnly||busy} value={value('requestDefaults')} onChange={e=>change('requestDefaults',e.target.value)}/>)}
   {field('probeSpec','能力测试请求（JSON，null 表示未配置）',<Textarea rows={5} disabled={readOnly||busy} value={value('probeSpec')} onChange={e=>change('probeSpec',e.target.value)}/>)}
   {field('documentationUrl','文档地址')}{field('notes','备注',<Textarea disabled={readOnly||busy} value={value('notes')} onChange={e=>change('notes',e.target.value)}/>)}
   <label className="block text-sm"><input type="checkbox" disabled={readOnly||busy} checked={stream} onChange={e=>setStream(e.target.checked)}/> 流式输出</label>
   <label className="block text-sm"><input type="checkbox" disabled={readOnly||busy||!enabled} checked={route} onChange={e=>setRoute(e.target.checked)}/> 路由开关（测试通过后才能从关闭切换为开启）{problem?.fieldErrors?.routeEnabled&&<span role="alert" className="block text-xs text-hot">{problem.fieldErrors.routeEnabled}</span>}</label>
   {m&&<p className="text-xs">当前资格：{m.routing.eligibleCapabilities.join(', ')||m.routing.reasons.join('；')}</p>}
  </>}
  <label className="block text-sm"><input type="checkbox" disabled={readOnly||busy} checked={enabled} onChange={e=>{setEnabled(e.target.checked);if(!e.target.checked)setRoute(false)}}/> 启用</label>
  {!readOnly&&<label className="block text-sm">修改原因<Input disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/>{problem?.fieldErrors?.reason&&<p role="alert">{problem.fieldErrors.reason}</p>}</label>}
  {(error||problem)&&<p role="alert" className="text-sm text-hot">{error||problem?.detail}</p>}
  {!readOnly&&<Button disabled={busy||!reason.trim()} onClick={save}>保存</Button>}
 </Modal>;
}
