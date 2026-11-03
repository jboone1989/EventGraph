import {useState} from 'react';
import type {ProviderManagement,ProviderConnection,RegisteredModel,ConnectionInput,ModelInput} from '@aihot/contracts/providers';
import {Button,ButtonLink,Input,Select,Textarea,Card,Badge,DataTable} from './ui';
import {useAdminAction} from './action';

type Problem={detail:string;fieldErrors?:Record<string,string>;dependencies?:Array<{kind:string;id:string;name:string}>};
type ModelEditor={model:RegisteredModel|null;providerId:string;readOnly:boolean};
type TestResult={status:string;elapsedMs:number;detail:string};
const vendors=[['deepseek','DeepSeek'],['openai','OpenAI'],['anthropic','Anthropic'],['nvidia','NVIDIA'],['zhipu','智谱 AI'],['custom','自定义厂商']] as const;
const vendorLabel=(id:string)=>vendors.find(v=>v[0]===id)?.[1]??id;
const defaultUrl=(id:string)=>{
 if(id==='deepseek')return 'https://api.deepseek.com';
 if(id==='openai')return 'https://api.openai.com/v1';
 if(id==='anthropic')return 'https://api.anthropic.com';
 if(id==='nvidia')return 'https://integrate.api.nvidia.com/v1';
 if(id==='zhipu')return 'https://open.bigmodel.cn/api/paas/v4';
 return '';
};
const defaultProtocol=(id:string):ConnectionInput['protocol']=>id==='anthropic'?'anthropic-compatible':'openai-compatible';
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
const makeModel=(providerId:string,modelId:string):ModelInput=>({
 providerId,modelId,adapter:'chat',endpointOverride:null,timeoutOverrideMs:null,
 capabilities:['text'],requestDefaults:{},probeSpec:probeFor('chat'),stream:false,
 complexity:'medium',documentationUrl:null,notes:null,enabled:true,routeEnabled:false
});

export function ProviderConnectionsAdmin({data}:{data:ProviderManagement}) {
 const {run,busy}=useAdminAction();
 const [search,setSearch]=useState('');
 const [modelEditor,setModelEditor]=useState<ModelEditor|null>(null);
 // undefined: closed; null: adding a provider; ProviderConnection: editing it.
 const [providerEditor,setProviderEditor]=useState<ProviderConnection|null|undefined>();
 const [deleting,setDeleting]=useState<RegisteredModel|null>(null);
 const [problem,setProblem]=useState<Problem|null>(null),[notice,setNotice]=useState('');
 const [testing,setTesting]=useState<string|null>(null);
 const [testResults,setTestResults]=useState<Record<string,TestResult>>({});
 const command=async<T,>(method:'POST'|'PATCH'|'DELETE',path:string,body?:unknown)=>{
  setProblem(null);
  return run<T>(method,path,body,{onError:setProblem});
 };
 const openModel=(providerId:string,model:RegisteredModel|null=null,readOnly=false)=>{
  setProblem(null);setModelEditor({providerId,model,readOnly});
 };
 const errors=problem&&<div role="alert" className="space-y-1 text-sm text-hot">
  <p>{problem.detail}</p>
  {problem.dependencies?.map(d=><p key={d.kind+d.id}>{d.name} 正在引用此模型</p>)}
 </div>;

 async function saveProvider(input:ConnectionInput,modelIds:string[]):Promise<void> {
  const existing=providerEditor??null;
  const result=await command<ProviderConnection>(existing?'PATCH':'POST',
   existing?'/api/admin/providers/'+existing.id:'/api/admin/providers',{
    ...input,reason:'后台'+(existing?'修改':'新增')+'厂商：'+input.vendor,...(existing?{version:existing.version}:{})
   });
  if(!result)return;
  const failed:string[]=[];
  for(const id of modelIds){
   const created=await command<RegisteredModel>('POST','/api/admin/providers/'+result.id+'/models',{
    ...makeModel(result.id,id),reason:'后台登记模型：'+id
   });
   if(!created)failed.push(id);
  }
  setProviderEditor(undefined);
  setNotice(failed.length?'已保存厂商，但这些模型未保存：'+failed.join('、')+'。请检查错误后逐个添加。':
   '已保存 '+vendorLabel(result.vendor)+(modelIds.length?'，并添加 '+modelIds.length+' 个模型':''));
 }
 async function saveModel(input:ModelInput,reason:string){
  const old=modelEditor?.model;
  const result=await command<RegisteredModel>(old?'PATCH':'POST',
   old?'/api/admin/provider-models/'+old.id:'/api/admin/providers/'+input.providerId+'/models',{
    ...input,reason,...(old?{version:old.version}:{})
   });
  if(result){setModelEditor(null);setNotice((old?'已更新模型：':'已添加模型：')+result.modelId);}
 }
 async function testModel(m:RegisteredModel){
  setProblem(null);
  if(!m.probeSpec){setNotice(m.modelId+' 尚未配置测试请求。请编辑该模型的高级测试配置。');return;}
  setTesting(m.id);
  try {
   const result=await command<TestResult>('POST','/api/admin/provider-models/'+m.id+'/test',{capability:m.probeSpec.capability});
   if(!result)return;
   setTestResults(old=>({...old,[m.id]:result}));
   if(result.status==='verified'&&m.enabled&&m.adapter==='chat'&&!m.routeEnabled){
    const enabled=await command<RegisteredModel>('PATCH','/api/admin/provider-models/'+m.id,{
     ...modelInput(m),routeEnabled:true,version:m.version,reason:'测试通过后允许工作流选择模型：'+m.modelId
    });
    setNotice(enabled?m.modelId+' 测试通过，已可在工作流绑定页面选择。':
     m.modelId+' 测试通过，但启用工作流路由失败，请编辑模型检查。');
   }else{
    setNotice(m.modelId+'：'+(result.status==='verified'?'测试通过':'测试失败')+
     ' · '+result.elapsedMs+' ms · '+result.detail);
   }
  }finally{setTesting(null);}
 }
 const matching=data.providers.filter(c=>{
  const models=data.models.filter(m=>m.providerId===c.id);
  return (c.vendor+' '+c.name+' '+models.map(m=>m.modelId).join(' ')).toLowerCase().includes(search.trim().toLowerCase());
 });
 return <div className="space-y-4">
  {notice&&<p role="status" className="break-words text-sm">{notice}</p>}
  {!modelEditor&&providerEditor===undefined&&!deleting&&errors}
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div className="w-full max-w-sm"><Input aria-label="搜索厂商或模型" placeholder="搜索厂商或模型 ID" value={search}
    onChange={e=>setSearch(e.target.value)}/></div>
   <div className="flex flex-wrap gap-2">
    <ButtonLink to="/admin/model-bindings">工作流模型绑定</ButtonLink>
    <Button disabled={busy} onClick={()=>{setProblem(null);setProviderEditor(null);}}>＋ 新增厂商</Button>
   </div>
  </div>
  {matching.map(c=>{
   const models=data.models.filter(m=>m.providerId===c.id);
   return <Card key={c.id} title={<span>{vendorLabel(c.vendor)} <span className="text-xs font-normal text-ink-3">
    {c.name!==c.vendor?' · '+c.name:''}</span></span>}
    right={<div className="flex flex-wrap gap-2">
     <Badge tone={c.credential.configured?'ok':'warn'}>{c.credential.configured?'已配置密钥':'未配置密钥'}</Badge>
     <Button size="sm" disabled={busy} onClick={()=>{setProblem(null);setProviderEditor(c);}}>配置厂商</Button>
     <Button size="sm" disabled={busy} onClick={()=>openModel(c.id)}>＋ 添加模型</Button>
    </div>}>
    <DataTable rows={models} rowKey={m=>m.id} empty="暂无模型，点击「添加模型」进行配置。" columns={[
     {key:'model',label:'模型 ID',render:m=><span className="break-all font-mono text-xs">{m.modelId}</span>},
     {key:'state',label:'状态',render:m=><div className="flex flex-wrap gap-1">
      <Badge tone={m.enabled?'ok':'muted'}>{m.enabled?'启用':'停用'}</Badge>
      <Badge tone={m.routing.eligibleCapabilities.length?'accent':m.routeEnabled?'warn':'muted'}>
       {m.routing.eligibleCapabilities.length?'可用于工作流':m.routeEnabled?'需重新测试':'未启用路由'}</Badge>
     </div>},
     {key:'actions',label:'操作',render:m=>{
      const receipt=m.checks.find(x=>x.capability===m.probeSpec?.capability);
      const status=testResults[m.id]?.status??receipt?.status;
      return <div className="flex flex-wrap items-center gap-1">
       <Button size="sm" disabled={busy||testing!==null} onClick={()=>openModel(c.id,m)}>编辑</Button>
       <Button size="sm" disabled={busy||testing!==null} onClick={()=>testModel(m)}>
        {testing===m.id?'测试中…':'测试'}
       </Button>
       {status&&<Badge tone={status==='verified'?'ok':status==='unverified'?'muted':'bad'}>
        {status==='verified'?'通过':status==='unverified'?'待测试':'失败'}</Badge>}
       <Button size="sm" disabled={busy||testing!==null} onClick={()=>{setProblem(null);setDeleting(m)}}>删除</Button>
      </div>;
     }}
    ]}/>
   </Card>;
  })}
  {!matching.length&&<Card><p className="text-sm text-ink-3">
   {data.providers.length?'未找到匹配的厂商或模型。':'还没有厂商，点击「新增厂商」同时配置 API Key 和模型。'}
  </p></Card>}
  {providerEditor!==undefined&&<ProviderDialog key={providerEditor?.id??'new'} connection={providerEditor}
   connections={data.providers} busy={busy} problem={problem} onClose={()=>setProviderEditor(undefined)} onSave={saveProvider}/>}
  {modelEditor&&<ModelDialog key={modelEditor.model?.id??'new-'+modelEditor.providerId}
   editor={modelEditor} busy={busy||testing!==null} problem={problem} onClose={()=>setModelEditor(null)} onSave={saveModel}/>}
  {deleting&&<Modal title={'删除模型：'+deleting.modelId} busy={busy} onClose={()=>setDeleting(null)}>
   <p className="text-sm">确定删除这个模型吗？已启用或被工作流引用的模型会被后端阻止删除。</p>
   {errors}
   <div className="flex gap-2">
    <Button disabled={busy} onClick={async()=>{
     const deleted=await command('DELETE','/api/admin/provider-models/'+deleting.id,{
      version:deleting.version,reason:'后台删除模型：'+deleting.modelId
     });
     if(deleted){setDeleting(null);setNotice('已删除模型：'+deleting.modelId);}
    }}>确认删除</Button>
    <Button tone="secondary" disabled={busy} onClick={()=>setDeleting(null)}>取消</Button>
   </div>
  </Modal>}
 </div>;
}

function modelInput(m:RegisteredModel):ModelInput {
 return {providerId:m.providerId,modelId:m.modelId,adapter:m.adapter,endpointOverride:m.endpointOverride,
  timeoutOverrideMs:m.timeoutOverrideMs,capabilities:m.capabilities,requestDefaults:m.requestDefaults,
  probeSpec:m.probeSpec,stream:m.stream,complexity:m.complexity,documentationUrl:m.documentationUrl,
  notes:m.notes,enabled:m.enabled,routeEnabled:m.routeEnabled};
}
function Modal({title,busy,onClose,children}:{title:string;busy:boolean;onClose:()=>void;children:React.ReactNode}){
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
  <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-panel bg-surface p-5">
   <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{title}</h3>
    <Button disabled={busy} onClick={onClose}>关闭</Button></div>{children}
  </section>
 </div>;
}

function ProviderDialog({connection,connections,busy,problem,onClose,onSave}:{
 connection:ProviderConnection|null;connections:ProviderConnection[];busy:boolean;problem:Problem|null;
 onClose:()=>void;onSave:(input:ConnectionInput,models:string[])=>Promise<void>;
}){
 const known=vendors.some(v=>v[0]===connection?.vendor&&v[0]!=='custom');
 const [vendor,setVendor]=useState(connection?(known?connection.vendor:'custom'):'deepseek');
 const [customVendor,setCustomVendor]=useState(connection&&!known?connection.vendor:'');
 const [protocol,setProtocol]=useState<ConnectionInput['protocol']>(connection?.protocol??defaultProtocol('deepseek'));
 const [baseUrl,setBaseUrl]=useState(connection?.baseUrl??defaultUrl('deepseek'));
 const [apiKey,setApiKey]=useState('');
 const [modelsText,setModelsText]=useState(connection?'':'deepseek-chat\ndeepseek-reasoner');
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const changeVendor=(v:string)=>{
  setVendor(v);setBaseUrl(defaultUrl(v));setProtocol(defaultProtocol(v));
  if(!connection)setModelsText(v==='deepseek'?'deepseek-chat\ndeepseek-reasoner':'');
 };
 async function save(){
  setError('');
  const name=vendor==='custom'?customVendor.trim():vendor;
  const models=connection?[]:Array.from(new Set(modelsText.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean)));
  if(!name||!baseUrl.trim()||(!connection&&!apiKey.trim())){setError('请选择厂商并填写有效 API Key 和地址');return;}
  if(models.some(x=>x.length>240)){setError('模型 ID 不能超过 240 个字符');return;}
  const count=connections.filter(x=>x.vendor===name).length;
  const connectionName=connection?.name??(count?name+'-'+(count+1):name);
  const credential:ConnectionInput['credential']=apiKey.trim()?{action:'replace',value:apiKey.trim()}:{action:'keep'};
  setSaving(true);
  try{
   await onSave({name:connectionName,vendor:name,protocol,baseUrl:baseUrl.trim(),
    timeoutMs:connection?.timeoutMs??60000,enabled:connection?.enabled??true,credential},models);
  }finally{setSaving(false);}
 }
 return <Modal title={connection?'配置厂商 · '+vendorLabel(connection.vendor):'新增厂商及模型'} busy={busy||saving} onClose={onClose}>
  <label className="block space-y-1 text-sm">厂商
   <Select aria-label="厂商" disabled={busy||saving} value={vendor} onChange={e=>changeVendor(e.target.value)}>
    {vendors.map(v=><option key={v[0]} value={v[0]}>{v[1]}</option>)}
   </Select>
  </label>
  {vendor==='custom'&&<label className="block space-y-1 text-sm">厂商标识
   <Input disabled={busy||saving} value={customVendor} onChange={e=>setCustomVendor(e.target.value)}
    placeholder="例如 siliconflow"/>
  </label>}
  <label className="block space-y-1 text-sm">API Key
   <Input type="password" autoComplete="new-password" aria-label="API Key" disabled={busy||saving}
    placeholder={connection?'留空则保持原有密钥':'输入 API Key'} value={apiKey} onChange={e=>setApiKey(e.target.value)}/>
   {problem?.fieldErrors?.credential&&<span className="text-xs text-hot">{problem.fieldErrors.credential}</span>}
  </label>
  {!connection&&<label className="block space-y-1 text-sm">模型 ID（每行一个）
   <Textarea aria-label="模型 ID（每行一个）" rows={4} disabled={busy||saving} value={modelsText}
    onChange={e=>setModelsText(e.target.value)} placeholder="输入厂商提供的模型 ID"/>
   <span className="text-xs text-ink-3">保存时一次登记这些模型，之后可以随时添加或删除。模型测试通过后才能用于工作流。</span>
  </label>}
  <details className="text-sm"><summary className="cursor-pointer text-ink-3">高级设置：API 地址与协议</summary>
   <div className="mt-2 space-y-3">
    <label className="block space-y-1">API Base URL
     <Input aria-label="API Base URL" disabled={busy||saving} value={baseUrl} onChange={e=>setBaseUrl(e.target.value)}/>
    </label>
    <label className="block space-y-1">API 协议
     <Select aria-label="API 协议" disabled={busy||saving} value={protocol}
      onChange={e=>setProtocol(e.target.value as ConnectionInput['protocol'])}>
      <option value="openai-compatible">OpenAI Compatible</option>
      <option value="anthropic-compatible">Anthropic Compatible</option>
     </Select>
    </label>
   </div>
  </details>
  {error&&<p role="alert" className="text-sm text-hot">{error}</p>}
  {problem&&<p role="alert" className="text-sm text-hot">{problem.detail}</p>}
  <Button disabled={busy||saving} onClick={save}>{saving?'保存中…':'保存厂商及模型'}</Button>
 </Modal>;
}

function ModelDialog({editor,busy,problem,onClose,onSave}:{
 editor:ModelEditor;busy:boolean;problem:Problem|null;onClose:()=>void;
 onSave:(input:ModelInput,reason:string)=>Promise<void>;
}){
 const m=editor.model;
 const [modelId,setModelId]=useState(m?.modelId??'');
 const [adapter,setAdapter]=useState<ModelInput['adapter']>(m?.adapter??'chat');
 const [enabled,setEnabled]=useState(m?.enabled??true);
 const [notes,setNotes]=useState(m?.notes??'');
 const [probeText,setProbeText]=useState(JSON.stringify(m?.probeSpec??probeFor(m?.adapter??'chat'),null,2));
 const [error,setError]=useState('');
 const changeAdapter=(value:ModelInput['adapter'])=>{
  setAdapter(value);if(!m||value!==m.adapter)setProbeText(JSON.stringify(probeFor(value),null,2));
 };
 async function save(){
  setError('');
  if(!modelId.trim()){setError('请输入模型 ID');return;}
  let probeSpec:ModelInput['probeSpec'];
  try{probeSpec=JSON.parse(probeText) as ModelInput['probeSpec'];}
  catch{setError('测试配置必须是有效 JSON 对象或 null');return;}
  const sameAdapter=!!m&&m.adapter===adapter;
  const input:ModelInput={
   providerId:editor.providerId,modelId:modelId.trim(),adapter,
   endpointOverride:m?.endpointOverride??null,timeoutOverrideMs:m?.timeoutOverrideMs??null,
   capabilities:sameAdapter?m.capabilities:capabilitiesFor(adapter),
   requestDefaults:m?.requestDefaults??{},probeSpec,
   stream:sameAdapter?(m?.stream??false):false,complexity:m?.complexity??'medium',
   documentationUrl:m?.documentationUrl??null,notes:notes||null,enabled,
   routeEnabled:sameAdapter&&enabled?(m?.routeEnabled??false):false
  };
  await onSave(input,(m?'后台编辑模型：':'后台新增模型：')+modelId.trim());
 }
 return <Modal title={(m?'编辑':'添加')+'模型'} busy={busy} onClose={onClose}>
  <label className="block space-y-1 text-sm">模型 ID
   <Input aria-label="模型 ID" disabled={busy} value={modelId} onChange={e=>setModelId(e.target.value)}/>
   {problem?.fieldErrors?.modelId&&<span role="alert" className="text-xs text-hot">{problem.fieldErrors.modelId}</span>}
  </label>
  <label className="block space-y-1 text-sm">模型类型
   <Select disabled={busy} value={adapter} onChange={e=>changeAdapter(e.target.value as ModelInput['adapter'])}>
    {['chat','embedding','document','safety','special','unconfigured'].map(v=><option key={v} value={v}>{v}</option>)}
   </Select>
  </label>
  <label className="block space-y-1 text-sm">备注
   <Textarea disabled={busy} rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/>
  </label>
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy}
   checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> 启用模型</label>
  <p className="text-xs text-ink-3">测试通过后，已启用的对话模型会自动允许在工作流绑定页面选择；不会自动修改现有绑定。</p>
  <details className="text-sm"><summary className="cursor-pointer text-ink-3">高级：模型测试配置</summary>
   <Textarea rows={5} disabled={busy} value={probeText} onChange={e=>setProbeText(e.target.value)}/>
  </details>
  {error&&<p role="alert" className="text-sm text-hot">{error}</p>}
  {problem&&<p role="alert" className="text-sm text-hot">{problem.detail}</p>}
  <Button disabled={busy} onClick={save}>保存模型</Button>
 </Modal>;
}
