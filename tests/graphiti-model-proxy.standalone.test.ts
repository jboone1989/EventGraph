import assert from 'node:assert/strict';
import {test} from 'node:test';
import {graphitiAuthorized,graphitiBody,vectorDimensions} from '@aihot/backend/providers/graphiti-proxy';

test('only a properly formatted strong matching internal token authorizes Graphiti',()=>{
 const secret='graphiti-internal-token-test-abcdefghijklmnopqrstuvwxyz';
 assert.equal(graphitiAuthorized('Bearer '+secret,secret),true);
 assert.equal(graphitiAuthorized('Bearer '+secret+'x',secret),false);
 assert.equal(graphitiAuthorized('Bearer '+secret,'different-strong-secret-abcdefghijklmnopqrstuvwxyz'),false);
 assert.equal(graphitiAuthorized(secret,secret),false);
 assert.equal(graphitiAuthorized('Bearer a','short'),false);
 assert.equal(graphitiAuthorized(undefined,secret),false);
});

test('chat requests preserve structured extraction and refuse streaming',()=>{
 const body=graphitiBody('chat',{model:'old-static-nvidia',messages:[{role:'system',content:'extract facts'}],response_format:{type:'json_object'},max_tokens:2048});
 assert.equal('model' in body,false);
 assert.equal(body.stream,false);
 assert.deepEqual(body.response_format,{type:'json_object'});
 assert.throws(()=>graphitiBody('chat',{messages:[],stream:false}),/Invalid messages/);
 assert.throws(()=>graphitiBody('chat',{messages:[{role:'user',content:'hi'}],stream:true}),/Streaming is unsupported/);
});

test('embedding requests do not leak chat stream or static model identity',()=>{
 const body=graphitiBody('embedding',{model:'nvidia-legacy-embedding',input:['first','second'],input_type:'passage'});
 assert.equal('model' in body,false);
 assert.equal('stream' in body,false);
 assert.equal(body.input_type,'passage');
 assert.throws(()=>graphitiBody('embedding',{input:[]}),/Invalid embedding input/);
 assert.throws(()=>graphitiBody('embedding',{input:['']}),/Invalid embedding input/);
});

test('vectors cannot silently change Graphiti Neo4j dimensions',()=>{
 assert.doesNotThrow(()=>vectorDimensions({data:[{embedding:[1,2,3]},{embedding:[3,2,1]}]},3));
 assert.throws(()=>vectorDimensions({data:[{embedding:[1,2]}]},3),/dimension mismatch/);
 assert.throws(()=>vectorDimensions({data:[{embedding:[1,NaN,3]}]},3),/dimension mismatch/);
 assert.throws(()=>vectorDimensions({data:[]},3),/dimension mismatch/);
});
