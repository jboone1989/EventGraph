import assert from 'node:assert/strict';
import {test} from 'node:test';
import {anthropicRequest,anthropicResponse} from '@aihot/backend/providers/registry/anthropic-compat';
import {modelEndpoint} from '@aihot/backend/providers/registry/runtime';
import type {ConnectionRow,ModelRow} from '@aihot/backend/providers/registry/connections';

test('Anthropic-compatible Messages endpoint respects provider API root',()=>{
 const c={base_url:'https://api.deepseek.com/anthropic',protocol:'anthropic-compatible'} as ConnectionRow;
 const m={adapter:'chat',endpoint_override:null} as ModelRow;
 assert.equal(modelEndpoint(c,m),'https://api.deepseek.com/anthropic/v1/messages');
 assert.equal(modelEndpoint(c),'https://api.deepseek.com/anthropic/v1/models');
 assert.equal(modelEndpoint({...c,base_url:'https://api.anthropic.com/v1'},m),'https://api.anthropic.com/v1/messages');
});

test('Anthropic request converts system and user turns without discarding unsupported payloads',()=>{
 const payload=anthropicRequest({model:'deepseek-flash',stream:false,max_tokens:128,
  messages:[{role:'system',content:'Be brief'},{role:'user',content:'Hello'}]});
 assert.deepEqual(payload,{model:'deepseek-flash',max_tokens:128,
  messages:[{role:'user',content:'Hello'}],system:'Be brief'});
 assert.throws(()=>anthropicRequest({model:'demo',messages:[{role:'tool',content:'x'}]}),/Unsupported message role/);
 assert.throws(()=>anthropicRequest({model:'demo',messages:[{role:'user',content:'x'}],response_format:{type:'json_object'}}),/Unsupported Anthropic request parameters/);
});

test('Anthropic text response preserves expected ChatCompletion shape and token usage',()=>{
 const response=anthropicResponse({id:'msg_1',model:'demo',stop_reason:'end_turn',
  content:[{type:'text',text:'OK'}],usage:{input_tokens:7,output_tokens:2}});
 assert.equal((response.choices as Array<{message:{content:string}}>)[0]?.message.content,'OK');
 assert.deepEqual(response.usage,{prompt_tokens:7,completion_tokens:2,total_tokens:9});
 assert.throws(()=>anthropicResponse({content:[{type:'tool_use',name:'missing-text'}]}),/did not include text/);
});
