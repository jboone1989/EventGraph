import assert from 'node:assert/strict';
import {test} from 'node:test';
import {classifyOpenRouterFreeCatalog} from '@aihot/backend/providers/registry/openrouter-free-catalog';

const model=(id:string,endpoints:string[],modalities:string[],prompt='0',completion='0')=>({
 id,pricing:{prompt,completion},endpoints,architecture:{input_modalities:['text'],output_modalities:modalities}
});
test('sync includes free chat, embedding, rerank and non-text models without misclassifying them',()=>{
 const data=[
  model('free/chat:free',['/api/v1/chat/completions'],['text']),
  model('free/embed:free',['/api/v1/embeddings'],['embeddings']),
  model('free/rerank:free',['/api/v1/rerank'],['rerank']),
  model('free/image:free',['/api/v1/images'],['image']),
  model('paid/chat',['/api/v1/chat/completions'],['text'],'0.001','0')
 ];
 const r=classifyOpenRouterFreeCatalog(data);
 assert.equal(r.freeCatalog,4);
 assert.equal(r.chat,1);assert.equal(r.embedding,1);assert.equal(r.other,2);
 assert.equal(r.models.length,5); // includes OpenRouter's free chat router
 assert.deepEqual(r.models.map(m=>m.adapter),['chat','embedding','special','special','chat']);
 assert.equal(r.models[1]?.probe?.response,'embedding');
 assert.equal(r.models[2]?.probe,null);
});
test('request/image/audio charges exclude models that are not genuinely free',()=>{
 const paid={...model('fake/free',['/api/v1/chat/completions'],['text']),pricing:{prompt:'0',completion:'0',request:'0.01'}};
 const r=classifyOpenRouterFreeCatalog([paid,model('free/base',['/api/v1/chat/completions'],['text'])]);
 assert.deepEqual(r.models.map(m=>m.id),['free/base','openrouter/free']);
});
test('duplicate entries are imported once, invalid IDs reported and existing router not duplicated',()=>{
 const row=model('openrouter/free',['/api/v1/chat/completions'],['text']);
 const bad={...row,id:''};
 const r=classifyOpenRouterFreeCatalog([row,row,bad]);
 assert.equal(r.freeCatalog,3);assert.equal(r.invalid,1);
 assert.equal(r.models.length,1);assert.equal(r.models[0]?.id,'openrouter/free');
});
test('vision chat models can be configured for vision; unadvertised chat endpoints stay special',()=>{
 const vision={...model('free/vision',['/api/v1/chat/completions'],['text']),
  architecture:{input_modalities:['text','image'],output_modalities:['text']}};
 const r=classifyOpenRouterFreeCatalog([vision,model('free/responses',['/api/v1/responses'],['text'])]);
 assert.deepEqual(r.models[0]?.capabilities,['text','vision']);
 assert.equal(r.models[1]?.adapter,'special');
});
