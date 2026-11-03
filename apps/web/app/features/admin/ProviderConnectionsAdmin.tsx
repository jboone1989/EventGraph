import {useState} from 'react';
import type {ProviderManagement,ProviderConnection,RegisteredModel,ConnectionInput,ModelInput} from '@aihot/contracts/providers';
import {Button,Input,Select,Textarea,Card,Badge,DataTable} from './ui';
import {useAdminAction} from './action';

type Problem={detail:string;fieldErrors?:Record<string,string>;dependencies?:Array<{kind:string;id:string;name:string}>};
type Editor={model:RegisteredModel|null;readOnly:boolean};
type TestResult={status:string;elapsedMs:number;detail:string};
const PAGE_SIZE=20;
const NEW_CONNECTION='__new__';
const probeFor=(adapter:ModelInput['adapter']):RegisteredModel['probeSpec']=>{
 if(adapter==='chat')return {capability:'text',body:{messages:[{role:'user',content:'Reply OK'}]},response:'chat'};
 if(adapter==='embedding')return {capability:'embedding',body:{input:'sample'},response:'embedding'};
 return null;
};
const capabilitiesFor=(adapter:ModelInput['adapter']):ModelInput['capabilities']=>{
 if(adapter==='embedding')return ['embedding'];
 if(adapter==='document')return ['document'];
 if(adapter==='safety')return ['safety'];
 return adapter==='chat'?['text']:[];
};

export function ProviderConnectionsAdmin({data}:{data:ProviderManagement}) {
 const {run,busy}=useAdminAction();
 const [search,setSearch]=useState(''),[page,setPage]=useState(1);
 const [editor,setEditor]=useState<Editor|null>(null);
 const [createdConnectionId,setCreatedConnectionId]=useState<string|null>(null);
 const [deleting,setDeleting]=useState<RegisteredModel|null>(null);
 const [problem,setProblem]=useState<Problem|null>(null),[notice,setNotice]=useState('');
 const [testing,setTesting]=useState<string|null>(null);
 const [testResults,setTestResults]=useState<Record<string,TestResult>>({});
 const command=async<T,>(method:'POST'|'PATCH'|'DELETE',path:string,body?:unknown)=>{
  setProblem(null);
  return run<T>(method,path,body,{onError:setProblem});
 };
 const open=(model:RegisteredModel|null,readOnly=false)=>{
  setProblem(null);setCreatedConnectionId(null);setEditor({model,readOnly});
 };
 const filtered=data.models.filter(m=>{
  const connection=data.providers.find(c=>c.id===m.providerId);
  return (m.modelId+' '+(connection?.name??'')+' '+(connection?.vendor??'')).toLowerCase().includes(search.trim().toLowerCase());
 });
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
 const current=Math.min(page,pages);
 const visible=filtered.slice((current-1)*PAGE_SIZE,current*PAGE_SIZE);
 const errors=problem&&<div role="alert" className="space-y-1 text-sm text-hot">
  <p>{problem.detail}</p>
  {problem.dependencies?.map(d=><p key={d.kind+d.id}>{d.name} 正在引用此模型</p>)}
 </div>;

 async function saveModel(input:ModelInput,reason:string,newConnection:ConnectionInput|null) {
  let providerId=input.providerId;
  if(newConnection) {
   providerId=createdConnectionId??'';
   if(!providerId){
    const created=await command<ProviderConnection>('POST','/api/admin/providers',{...newConnection,reason:'新增模型连接：'+input.modelId});
    if(!created)return;
    providerId=created.id;
    setCreatedConnectionId(providerId);
   }
  }
  const existing=editor?.model;
  const path=existing?'/api/admin/provider-models/'+existing.id:'/api/admin/providers/'+providerId+'/models';
  const result=await command<RegisteredModel>(existing?'PATCH':'POST',path,{
   ...input,providerId,reason,...(existing?{version:existing.version}:{})
  });
  if(result){setEditor(null);setCreatedConnectionId(null);setNotice((existing?'已更新：':'已添加：')+input.modelId);}
 }

 async function testModel(m:RegisteredModel) {
  setProblem(null);
  if(!m.probeSpec){
   setNotice(m.modelId+' 尚未配置测试请求；请在编辑模型的「测试配置」中填写。');
   return;
  }
  setTesting(m.id);
  try {
   const result=await command<TestResult>('POST','/api/admin/provider-models/'+m.id+'/test',{capability:m.probeSpec.capability});
   if(result){
    setTestResults(old=>({...old,[m.id]:result}));
    setNotice(m.modelId+'：'+(result.status==='verified'?'通过':'失败')+' · '+result.elapsedMs+' ms · '+result.detail);
   }
  } finally {setTesting(null);}
 }

 return <div className="space-y-4">
  {notice&&<p role="status" className="break-words text-sm">{notice}</p>}
  {!editor&&!deleting&&errors}
  <Card title={'模型列表（'+filtered.length+'）'} right={<Button disabled={busy} onClick={()=>open(null)}>新增模型</Button>}>
   <div className="mb-4 max-w-md"><Input aria-label="搜索模型" placeholder="搜索模型 ID 或厂商" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></div>
   <DataTable rows={visible} rowKey={m=>m.id} empty="暂无模型，点击「新增模型」开始。" columns={[
    {key:'model',label:'模型 ID',render:m=><span className="break-all font-mono text-xs">{m.modelId}</span>},
    {key:'provider',label:'厂商',render:m=><span className="text-xs">{data.providers.find(c=>c.id===m.providerId)?.name??'未知连接'}</span>},
    {key:'type',label:'类型',render:m=><span className="text-xs">{m.adapter}</span>},
    {key:'state',label:'状态',render:m=><Badge tone={m.enabled?'ok':'muted'}>{m.enabled?'启用':'停用'}</Badge>},
    {key:'actions',label:'操作',render:m=>{
     const check=m.checks.find(c=>c.capability===m.probeSpec?.capability);
     const latest=testResults[m.id];
     const status=latest?.status??check?.status;
     return <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" disabled={busy||testing!==null} onClick={()=>open(m,true)}>查看</Button>
      <Button size="sm" disabled={busy||testing!==null} onClick={()=>open(m)}>编辑</Button>
      <Button size="sm" disabled={busy||testing!==null} onClick={()=>testModel(m)}>{testing===m.id?'测试中…':'测试'}</Button>
      {status&&<Badge tone={status==='verified'?'ok':status==='unverified'?'muted':'bad'}>{status==='verified'?'通过':status==='unverified'?'待测试':'失败'}</Badge>}
      <Button size="sm" disabled={busy||testing!==null} onClick={()=>{setProblem(null);setDeleting(m)}}>删除</Button>
     </div>;
    }},
   ]}/>
   <div className="mt-3 flex items-center gap-3">
    <Button size="sm" disabled={current<=1} onClick={()=>setPage(current-1)}>上一页</Button>
    <span className="text-xs">{current} / {pages}</span>
    <Button size="sm" disabled={current>=pages} onClick={()=>setPage(current+1)}>下一页</Button>
   </div>
  </Card>
  {editor&&<ModelDialog key={(editor.model?.id??'new')+(editor.readOnly?'view':'edit')} editor={editor}
   providers={data.providers} busy={busy||testing!==null} problem={problem}
   onClose={()=>setEditor(null)} onSave={saveModel}/>}
  {deleting&&<Modal title={'删除模型：'+deleting.modelId} busy={busy} onClose={()=>setDeleting(null)}>
   <p className="text-sm">确定删除这个模型吗？此操作不可撤销。已启用或被工作流引用的模型，后端会阻止删除。</p>
   {errors}
   <div className="flex gap-2">
    <Button disabled={busy} onClick={async()=>{
     const result=await command('DELETE','/api/admin/provider-models/'+deleting.id,{
      version:deleting.version,reason:'后台删除模型：'+deleting.modelId
     });
     if(result){setDeleting(null);setNotice('已删除：'+deleting.modelId);}
    }}>确认删除</Button>
    <Button tone="secondary" disabled={busy} onClick={()=>setDeleting(null)}>取消</Button>
   </div>
  </Modal>}
 </div>;
}

function Modal({title,busy,onClose,children}:{title:string;busy:boolean;onClose:()=>void;children:React.ReactNode}) {
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
  <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-panel bg-surface p-5">
   <div className="flex items-center justify-between gap-2"><h3>{title}</h3><Button disabled={busy} onClick={onClose}>关闭</Button></div>
   {children}
  </section>
 </div>;
}

function ModelDialog({editor,providers,busy,problem,onClose,onSave}:{
 editor:Editor;providers:ProviderConnection[];busy:boolean;problem:Problem|null;
 onClose:()=>void;onSave:(input:ModelInput,reason:string,connection:ConnectionInput|null)=>Promise<void>;
}) {
 const m=editor.model,readOnly=editor.readOnly;
 const [providerId,setProviderId]=useState(m?.providerId??providers[0]?.id??NEW_CONNECTION);
 const [modelId,setModelId]=useState(m?.modelId??'');
 const [adapter,setAdapter]=useState<ModelInput['adapter']>(m?.adapter??'chat');
 const [enabled,setEnabled]=useState(m?.enabled??true);
 const [notes,setNotes]=useState(m?.notes??'');
 const [probeText,setProbeText]=useState(JSON.stringify(m?.probeSpec??probeFor(m?.adapter??'chat'),null,2));
 const [connectionName,setConnectionName]=useState(''),[vendor,setVendor]=useState('');
 const [baseUrl,setBaseUrl]=useState(''),[apiKey,setApiKey]=useState('');
 const [error,setError]=useState('');
 const fieldError=(key:string)=>problem?.fieldErrors?.[key]&&<span role="alert" className="text-xs text-hot">{problem.fieldErrors[key]}</span>;
 const changeAdapter=(value:ModelInput['adapter'])=>{
  setAdapter(value);
  if(!m||value!==m.adapter)setProbeText(JSON.stringify(probeFor(value),null,2));
 };
 async function save(){
  setError('');
  if(!modelId.trim()){setError('请输入模型 ID');return;}
  if(providerId===NEW_CONNECTION&&(!connectionName.trim()||!vendor.trim()||!baseUrl.trim()||!apiKey.trim())){
   setError('请填写新连接的名称、厂商、API 地址及 API Key');return;
  }
  try {
   const probeSpec=JSON.parse(probeText) as ModelInput['probeSpec'];
   const sameAdapter=!!m&&m.adapter===adapter;
   const input:ModelInput={
    providerId,modelId:modelId.trim(),adapter,
    endpointOverride:m?.endpointOverride??null,timeoutOverrideMs:m?.timeoutOverrideMs??null,
    capabilities:sameAdapter?m.capabilities:capabilitiesFor(adapter),
    requestDefaults:m?.requestDefaults??{},probeSpec,
    stream:sameAdapter?(m?.stream??false):false,complexity:m?.complexity??'medium',
    documentationUrl:m?.documentationUrl??null,notes:notes||null,enabled,
    routeEnabled:enabled&&sameAdapter&&providerId===m?.providerId?(m?.routeEnabled??false):false
   };
   const connection:ConnectionInput|null=providerId===NEW_CONNECTION?{
    name:connectionName.trim(),vendor:vendor.trim(),protocol:'openai-compatible',
    baseUrl:baseUrl.trim(),timeoutMs:60000,enabled:true,
    credential:{action:'replace',value:apiKey}
   }:null;
   await onSave(input,(m?'后台编辑模型：':'后台新增模型：')+modelId.trim(),connection);
  }catch{setError('测试配置必须是有效 JSON 对象或 null');}
 }
 const disabled=busy||readOnly;
 return <Modal title={(readOnly?'查看':m?'编辑':'新增')+'模型'} busy={busy} onClose={onClose}>
  <label className="block space-y-1 text-sm">模型 ID
   <Input disabled={disabled} value={modelId} onChange={e=>setModelId(e.target.value)}/>
   {fieldError('modelId')}
  </label>
  <label className="block space-y-1 text-sm">厂商连接
   <Select disabled={disabled} value={providerId} onChange={e=>setProviderId(e.target.value)}>
    {providers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    {!m&&<option value={NEW_CONNECTION}>＋ 新建连接</option>}
   </Select>
   {fieldError('providerId')}
  </label>
  {providerId===NEW_CONNECTION&&!m&&<div className="space-y-3 rounded-panel bg-bg-sunk p-3">
   <p className="text-xs text-ink-3">此模型没有可用连接时，在这里配置一次即可。</p>
   <label className="block space-y-1 text-sm">连接名称<Input disabled={disabled} value={connectionName} onChange={e=>setConnectionName(e.target.value)}/>{fieldError('name')}</label>
   <label className="block space-y-1 text-sm">厂商名称<Input disabled={disabled} value={vendor} onChange={e=>setVendor(e.target.value)}/>{fieldError('vendor')}</label>
   <label className="block space-y-1 text-sm">API Base URL<Input disabled={disabled} value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1"/>{fieldError('baseUrl')}</label>
   <label className="block space-y-1 text-sm">API Key<Input type="password" autoComplete="new-password" disabled={disabled} value={apiKey} onChange={e=>setApiKey(e.target.value)}/>{fieldError('credential')}</label>
  </div>}
  <label className="block space-y-1 text-sm">模型类型
   <Select disabled={disabled} value={adapter} onChange={e=>changeAdapter(e.target.value as ModelInput['adapter'])}>
    {['chat','embedding','document','safety','special','unconfigured'].map(value=><option key={value} value={value}>{value}</option>)}
   </Select>
   {fieldError('adapter')}
  </label>
  <label className="block space-y-1 text-sm">备注
   <Textarea disabled={disabled} rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/>
  </label>
  <label className="flex items-center gap-2 text-sm">
   <input type="checkbox" disabled={disabled} checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> 启用模型
  </label>
  <details className="text-sm">
   <summary className="cursor-pointer text-ink-3">测试配置（特殊模型可按需修改）</summary>
   <p className="mt-2 text-xs text-ink-3">普通对话和向量模型自动填入测试请求。其他类型可以填写专用请求，或保留 null。</p>
   <Textarea rows={5} disabled={disabled} value={probeText} onChange={e=>setProbeText(e.target.value)}/>
   {fieldError('probeSpec')}
  </details>
  {(error||problem)&&<p role="alert" className="text-sm text-hot">{error||problem?.detail}</p>}
  {!readOnly&&<Button disabled={busy} onClick={save}>保存</Button>}
 </Modal>;
}
