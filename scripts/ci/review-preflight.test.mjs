import test from 'node:test';
import assert from 'node:assert/strict';
import { planReview } from './review-preflight.mjs';
const sha='a'.repeat(40), base='b'.repeat(40), repo='jboone1989/EventGraph';
function fixture({status='success',description=`base=develop@${base}; GLM: 0 blocking`,branch='develop',baseSha=base,headSha=sha,event='pull_request',conclusion='success',draft=false,creator='github-actions[bot]'}={}) {
 const api={rest:{
  actions:{getWorkflowRun:async()=>({data:{id:1,name:'Check',event,status:'completed',conclusion,head_sha:sha,head_repository:{full_name:repo},pull_requests:[{number:42}]}})},
  pulls:{get:async()=>({data:{number:42,state:'open',draft,head:{sha:headSha,repo:{full_name:repo}},base:{ref:branch,repo:{full_name:repo}}}})},
  repos:{getBranch:async()=>({data:{commit:{sha:baseSha}}}),getCombinedStatusForRef:async()=>({data:{statuses:status?[{context:'claude-review',state:status,description,creator:{login:creator}}]:[]}})}
 }};
 return planReview(api,{owner:'jboone1989',repo:'EventGraph',runId:1});
}
test('reuse only a successful review of the exact current target version',async()=>{
 const r=await fixture(); assert.equal(r.eligible,true);assert.equal(r.required,false);assert.equal(r.baseSha,base);assert.equal(r.number,42);
});
test('missing, failed, pending, errored and unattributed review results require review',async()=>{
 for(const status of ['', 'failure','pending','error']) assert.equal((await fixture({status})).required,true);
 assert.equal((await fixture({description:'GLM: 0 blocking'})).required,true);
 assert.equal((await fixture({creator:'another-user'})).required,true);
});
test('base advancement and retargeting require review even for the same head',async()=>{
 assert.equal((await fixture({baseSha:'c'.repeat(40)})).required,true);
 assert.equal((await fixture({branch:'main'})).required,true);
});
test('superseded, draft, failed and branch-push events never enter paid review',async()=>{
 for(const input of [{headSha:'c'.repeat(40)},{draft:true},{conclusion:'failure'},{event:'push'}]) assert.equal((await fixture(input)).eligible,false);
});
