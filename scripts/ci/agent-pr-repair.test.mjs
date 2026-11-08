import test from 'node:test';
import assert from 'node:assert/strict';
import {decide,provenance,classifyLogs,attempts} from './agent-pr-repair.mjs';
const REPO='jboone1989/EventGraph',sha='a'.repeat(40),spec='b'.repeat(40);
const mk=()=>({
 event:{action:'completed',workflow_run:{id:123,run_attempt:1,status:'completed',conclusion:'failure',event:'pull_request',path:'.github/workflows/check.yml',head_sha:sha,head_branch:'agent/t002-runs-badge',head_repository:{full_name:REPO}}},
 pr:{number:501,state:'open',draft:false,base:{ref:'develop'},head:{sha,ref:'agent/t002-runs-badge',repo:{full_name:REPO}},labels:[{name:'agent-work'}],
 body:`Issue: #491\nIssue URL: https://github.com/${REPO}/issues/491\nTask: T002\nSpec: specs/admin-runs-count-and-model-binding-20261107/spec.md@${spec}\n<!-- gh-aw-execution: {} -->`},
 issue:{number:491,state:'open',body:`<!-- eventgraph-spec-task:v1 spec_sha=${spec} spec_path=specs/admin-runs-count-and-model-binding-20261107/spec.md task_id=T002 -->`},
 latestRun:{id:123,run_attempt:1,status:'completed',conclusion:'failure',head_sha:sha},
 jobs:[{id:3,name:'check',conclusion:'failure'},{id:4,name:'e2e',conclusion:'success'},{id:5,name:'docker',conclusion:'success'}],
 comments:[],repository:REPO});

test('exact approved original agent PR and head actionable',()=>{const r=decide(mk());assert.equal(r.kind,'inspect');assert.equal(r.prNumber,501);assert.equal(r.attempt,1);assert.equal(r.issueNumber,491);assert.deepEqual(r.failedJobs,[{id:3,name:'check'}]);});
for(const name of ['check','docker','e2e','claude-review'])test(`${name}-only required job failure is recognized`,()=>{const o=mk();o.jobs=[{id:10,name,conclusion:'failure'},...['check','docker','e2e','claude-review'].filter(x=>x!==name).map(x=>({id:11,name:x,conclusion:'success'}))];const r=decide(o);assert.equal(r.kind,'inspect');assert.equal(r.failedJobs[0].name,name);});
const failures=[
 ['successful run',o=>o.event.workflow_run.conclusion='success','not_failed_pr_check'],
 ['not a PR workflow',o=>o.event.workflow_run.event='push','not_failed_pr_check'],
 ['wrong workflow',o=>o.event.workflow_run.path='.github/workflows/release-main.yml','not_failed_pr_check'],
 ['fork',o=>o.pr.head.repo.full_name='forger/EventGraph','not_live_agent_pr_at_exact_head'],
 ['draft',o=>o.pr.draft=true,'not_live_agent_pr_at_exact_head'],
 ['wrong target',o=>o.pr.base.ref='main','not_live_agent_pr_at_exact_head'],
 ['stale head',o=>o.pr.head.sha='c'.repeat(40),'not_live_agent_pr_at_exact_head'],
 ['missing label',o=>o.pr.labels=[],'not_live_agent_pr_at_exact_head'],
 ['bad issue marker',o=>o.issue.body='forged','invalid_immutable_issue_spec_provenance'],
 ['wrong task',o=>o.pr.body=o.pr.body.replace('Task: T002','Task: T003'),'invalid_immutable_issue_spec_provenance'],
 ['duplicate metadata',o=>o.pr.body+='\nTask: T002','invalid_immutable_issue_spec_provenance'],
 ['superseded run',o=>o.latestRun.id=444,'stale_or_superseded_check'],
 ['unrelated failing CI job',o=>o.jobs=[{id:7,name:'scope',conclusion:'failure'}],'no_actionable_failed_required_job'],
];
for(const [title,change,reason] of failures)test(title,()=>{const o=mk();change(o);const r=decide(o);assert.equal(r.reason,reason);assert.notEqual(r.kind,'inspect');});
test('same sha only once for exact bot/owner marker',()=>{const o=mk();o.comments=[{user:{login:'github-actions[bot]'},body:`<!-- eventgraph-pr-repair:v1 pr=501 sha=${sha} -->`}];assert.equal(decide(o).reason,'already_dispatched_for_head');});
test('two distinct attempts cap all further automatic repair',()=>{const o=mk();o.comments=['c','d'].map(x=>({user:{login:'github-actions[bot]'},body:`<!-- eventgraph-pr-repair:v1 pr=501 sha=${x.repeat(40)} -->`}));assert.equal(decide(o).reason,'two_attempts_exhausted');});
test('untrusted users cannot consume repair attempts',()=>{const o=mk();o.comments=[{user:{login:'attacker'} ,body:`<!-- eventgraph-pr-repair:v1 pr=501 sha=${sha} -->`}];assert.equal(attempts(o.comments,501).length,0);assert.equal(decide(o).kind,'inspect');});
test('Typecheck and browser assertion are code failures',()=>{const f=mk().jobs.filter(x=>x.conclusion==='failure');assert.equal(classifyLogs(f,new Map([[3,'error TS2559: types mismatch apps/web/tests/runs-badge.test.ts']])).kind,'dispatch');});
test('external dependency and model quota are visible manual blockers',()=>{for(const log of ['HTTP 429 quota exceeded','provider timeout','missing secret OPENROUTER_API_KEY','runner unavailable']){const r=classifyLogs([{id:3,name:'check'}],new Map([[3,log]]));assert.equal(r.kind,'manual',log);}});
test('independent reviewer requires confirmed code finding, not provider error',()=>{const job={id:12,name:'claude-review'};assert.equal(classifyLogs([job],new Map([[12,'Claude Review found 2 blockers']])).kind,'dispatch');assert.equal(classifyLogs([job],new Map([[12,'Response parse failed']])).reason,'unverified_reviewer_or_provider_failure');});
test('unreadable logs fail closed',()=>{assert.equal(classifyLogs([{id:3,name:'check'}],new Map()).kind,'manual');});
