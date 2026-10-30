import test from 'node:test';
import assert from 'node:assert/strict';
import { planReview } from './review-preflight.mjs';
const sha='a'.repeat(40), base='b'.repeat(40), repo='jboone1989/EventGraph';
function fixture({status='success',description=`base=develop@${base}; GLM: 0 blocking`,branch='develop',baseSha=base,headSha=sha,event='pull_request',conclusion='success',draft=false,creator='github-actions[bot]',unassociated=false,matches=1}={}) {
 const api={rest:{
  actions:{getWorkflowRun:async args=>{assert.equal(args.run_id,1);return ({data:{id:1,name:'Check',event,status:'completed',conclusion,head_sha:sha,head_repository:{full_name:repo},pull_requests:unassociated?[]:[{number:42}]}})}},
  pulls:{get:async args=>{assert.equal(args.pull_number,42);return ({data:{number:42,state:'open',draft,head:{sha:headSha,repo:{full_name:repo}},base:{ref:branch,repo:{full_name:repo}}}})}},
  repos:{listPullRequestsAssociatedWithCommit:async args=>{assert.equal(args.commit_sha,sha);return {data:Array.from({length:matches},()=>({number:42,state:'open',head:{sha},base:{ref:branch}}))};},getBranch:async()=>({data:{commit:{sha:baseSha}}}),getCombinedStatusForRef:async()=>({data:{statuses:status?[{context:'claude-review',state:status,description,creator:{login:creator}}]:[]}})}
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

test('unassociated workflow_dispatch resolves exactly one matching PR',async()=>{
 const result=await fixture({event:'workflow_dispatch',unassociated:true});
 assert.equal(result.eligible,true);assert.equal(result.number,42);
 for(const matches of [0,2])assert.equal((await fixture({event:'workflow_dispatch',unassociated:true,matches})).eligible,false);
});
