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
 assert.deepEqual(r.models.map(m=>m.adapter),['chat','embedding','unconfigured','unconfigured','chat']);
 assert.equal(r.models[1]?.probe?.response,'embedding');
 assert.equal(r.models[2]?.probe,null);
 assert.deepEqual(r.models[2]?.outputModalities,['rerank']);
 assert.deepEqual(r.models[2]?.endpoints,['/api/v1/rerank']);
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
test('vision chat models can be configured for vision; unadvertised chat endpoints are not misrouted to chat',()=>{
 const vision={...model('free/vision',['/api/v1/chat/completions'],['text']),
  architecture:{input_modalities:['text','image'],output_modalities:['text']}};
 const r=classifyOpenRouterFreeCatalog([vision,model('free/responses',['/api/v1/responses'],['text'])]);
 assert.deepEqual(r.models[0]?.capabilities,['text','vision']);
 assert.equal(r.models[1]?.adapter,'unconfigured');
 assert.deepEqual(r.models[1]?.endpoints,['/api/v1/responses']);
});

test('catalog rows without endpoint paths classify by output modality instead',()=>{
 const entry=(id:string,output_modalities:string[])=>({
  id,pricing:{prompt:'0',completion:'0'},
  architecture:{input_modalities:['text'],output_modalities}
 });
 const r=classifyOpenRouterFreeCatalog([
  entry('free/no-endpoints-chat',['text']),
  entry('free/no-endpoints-embedding',['embeddings']),
  entry('free/no-endpoints-rerank',['rerank']),
  entry('free/legacy-text',[]),
  {...entry('openrouter/free',['text']),endpoints:['/api/v1/responses']}
 ]);
 assert.deepEqual(r.models.map(m=>m.adapter),['chat','embedding','unconfigured','unconfigured','chat']);
 assert.equal(r.chat,2);assert.equal(r.embedding,1);assert.equal(r.other,2);
 assert.equal(r.models[1]?.probe?.response,'embedding');
 assert.equal(r.models.filter(m=>m.id==='openrouter/free').length,1);
});


test('paid video and other output prices are never classified as free, even with zero token rates',()=>{
 const data=[
  {...model('runway/gen-4.5',['/api/v1/videos'],['video']),pricing:{prompt:'0',completion:'0',video_output:'0.12'}},
  {...model('paid/audio',['/api/v1/audio/speech'],['audio']),pricing:{prompt:'0',completion:'0',audio_output:'0.02'}},
  {...model('paid/image',['/api/v1/images'],['image']),pricing:{prompt:'0',completion:'0',image_output:'0.01'}},
  {...model('paid/cache',['/api/v1/chat/completions'],['text']),pricing:{prompt:'0',completion:'0',input_cache_write:'0.002'}},
  {...model('paid/search',['/api/v1/chat/completions'],['text']),pricing:{prompt:'0',completion:'0',web_search:'0.01'}},
  {...model('free/media',['/api/v1/videos'],['video']),pricing:{prompt:'0',completion:'0',video_output:'0'}},
  {...model('free/audio',['/api/v1/audio/speech'],['audio']),pricing:{prompt:'0',completion:'0',audio_output:'0'}},
 ];
 const result=classifyOpenRouterFreeCatalog(data);
 assert.deepEqual(result.models.map(m=>m.id),['free/media','free/audio','openrouter/free']);
 assert.equal(result.other,2);
});

test('conditional paid overrides, unquoted video rates and missing pricing do not enter free pool',()=>{
 const rows=[
  {...model('paid/override',['/api/v1/chat/completions'],['text']),pricing:{prompt:'0',completion:'0',overrides:[{min_prompt_tokens:50000,prompt:'0.00001'}]}},
  {...model('paid/unknown',['/api/v1/chat/completions'],['text']),pricing:{prompt:'0',completion:'0',new_charge_dimension:'0.1'}},
  {...model('paid/ambiguous-video',['/api/v1/videos'],['video']),pricing:{prompt:'0',completion:'0'}},
  {...model('paid/unknown-price',['/api/v1/chat/completions'],['text']),pricing:{prompt:'0',completion:'unknown'}},
  {...model('unpriced',['/api/v1/chat/completions'],['text']),pricing:undefined},
  {...model('free/overrides',['/api/v1/chat/completions'],['text']),pricing:{prompt:'0',completion:'0',overrides:[{min_prompt_tokens:50000,prompt:'0',completion:'0'}]}},
 ];
 const result=classifyOpenRouterFreeCatalog(rows);
 assert.deepEqual(result.models.map(m=>m.id),['free/overrides','openrouter/free']);
});
