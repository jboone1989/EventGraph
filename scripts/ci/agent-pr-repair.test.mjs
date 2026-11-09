import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decide,provenance,classifyLogs,attempts,handleEvent} from './agent-pr-repair.mjs';
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
 ['closed original Issue',o=>o.issue.state='closed','invalid_immutable_issue_spec_provenance'],
 ['missing gh-aw-execution marker',o=>o.pr.body=o.pr.body.replace('<!-- gh-aw-execution: {} -->',''),'invalid_immutable_issue_spec_provenance'],
];
for(const [title,change,reason] of failures)test(title,()=>{const o=mk();change(o);const r=decide(o);assert.equal(r.reason,reason);assert.notEqual(r.kind,'inspect');});
test('same sha only once for exact bot/owner marker',()=>{const o=mk();o.comments=[{user:{login:'github-actions[bot]'},body:`<!-- eventgraph-pr-repair:v1 pr=501 sha=${sha} -->`}];assert.equal(decide(o).reason,'already_dispatched_for_head');});
test('two distinct attempts cap all further automatic repair',()=>{const o=mk();o.comments=['c','d'].map(x=>({user:{login:'github-actions[bot]'},body:`<!-- eventgraph-pr-repair:v1 pr=501 sha=${x.repeat(40)} -->`}));assert.equal(decide(o).reason,'two_attempts_exhausted');});
test('untrusted users cannot consume repair attempts',()=>{const o=mk();o.comments=[{user:{login:'attacker'} ,body:`<!-- eventgraph-pr-repair:v1 pr=501 sha=${sha} -->`}];assert.equal(attempts(o.comments,501).length,0);assert.equal(decide(o).kind,'inspect');});
test('Typecheck and browser assertion are code failures',()=>{const f=mk().jobs.filter(x=>x.conclusion==='failure');assert.equal(classifyLogs(f,new Map([[3,'error TS2559: types mismatch apps/web/tests/runs-badge.test.ts']])).kind,'dispatch');});
test('a real failed Typecheck step ignores quota and 429 words in passing tests',()=>{
  const log=[
    '2026-11-08T11:22:11Z ✔ external dependency and model quota are visible manual blockers',
    '2026-11-08T11:22:12Z ✔ HTTP 429 quota exceeded fixture passed',
    '2026-11-08T11:22:45Z ##[group]Run npm run typecheck',
    '2026-11-08T11:22:55Z ##[error]tests/runs-badge.test.ts(90,57): error TS2559: Type mismatch',
    '2026-11-08T11:22:55Z ##[error]Process completed with exit code 1.'
  ].join('\n');
  assert.equal(classifyLogs([{id:3,name:'check'}],new Map([[3,log]])).kind,'dispatch');
});
test('post-Typecheck PostgreSQL cleanup auth warnings do not become CI failure evidence',()=>{
  const log=[
    '✔ earlier quota and HTTP 429 tests passed',
    '##[group]Run npm run typecheck',
    '##[error]tests/runs-badge.test.ts(90,57): error TS2559: Type mismatch',
    '##[error]Process completed with exit code 1.',
    '##[group]Run tail -n 60 backend.log',
    'initdb: warning: enabling "trust" authentication for local connections'
  ].join('\n');
  assert.equal(classifyLogs([{id:3,name:'check'}],new Map([[3,log]])).kind,'dispatch');
});
test('a real 429 inside the failed step stays an infrastructure blocker',()=>{
  const log=[
    '✔ earlier error TS2559 fixture passed',
    '##[group]Run npm ci',
    '##[error]HTTP 429 quota exceeded',
    '##[error]Process completed with exit code 1.'
  ].join('\n');
  const result=classifyLogs([{id:3,name:'check'}],new Map([[3,log]]));
  assert.equal(result.kind,'manual');
  assert.equal(result.reason,'infrastructure_check_failure');
});
test('external dependency and model quota are visible manual blockers',()=>{for(const log of ['HTTP 429 quota exceeded','provider timeout','missing secret OPENROUTER_API_KEY','runner unavailable']){const r=classifyLogs([{id:3,name:'check'}],new Map([[3,log]]));assert.equal(r.kind,'manual',log);}});
test('independent reviewer requires confirmed code finding, not provider error',()=>{const job={id:12,name:'claude-review'};assert.equal(classifyLogs([job],new Map([[12,'Claude Review found 2 blockers']])).kind,'dispatch');assert.equal(classifyLogs([job],new Map([[12,'Response parse failed']])).reason,'unverified_reviewer_or_provider_failure');});
test('unreadable logs fail closed',()=>{assert.equal(classifyLogs([{id:3,name:'check'}],new Map()).kind,'manual');});

test('unavailable original Issue escalates on same PR without crashing or dispatching', async t => {
  const o=mk();
  let posted='',dispatches=0;
  t.mock.method(globalThis,'fetch',async (url,opts={})=>{
    const request=new URL(url);
    const path=request.pathname.replace('/repos/jboone1989/EventGraph','');
    const method=opts.method??'GET';
    if(path==='/pulls') return Response.json([o.pr]);
    if(path==='/issues/491') return new Response('Not Found',{status:404});
    if(path==='/actions/workflows/check.yml/runs')
      return Response.json({workflow_runs:[{...o.latestRun,head_branch:o.event.workflow_run.head_branch,run_number:30}]});
    if(path==='/actions/runs/123/jobs') return Response.json({jobs:o.jobs});
    if(path==='/issues/501/comments' && method==='GET') return Response.json([]);
    if(path==='/issues/501/comments' && method==='POST') {
      posted=JSON.parse(opts.body).body;
      return Response.json({id:12345});
    }
    if(path.includes('/dispatches')) dispatches++;
    return new Response('Unknown mocked endpoint',{status:404});
  });
  const result=await handleEvent({event:o.event,token:'test-token',repo:REPO});
  assert.equal(result.kind,'manual');
  assert.equal(result.reason,'invalid_immutable_issue_spec_provenance');
  assert.match(posted,/eventgraph-pr-repair-manual:v1 pr=501 sha=/);
  assert.equal(dispatches,0);
});

// Whole-workflow failure classes: any single required job failing with a real
// code defect is repairable; runner/registry/model infrastructure failures name
// their job and only ever produce a visible manual takeover.
const TS_LOG=['##[group]Run npm run typecheck','##[error]tests/runs-badge.test.ts(90,57): error TS2559: Type mismatch','##[error]Process completed with exit code 1.'].join('\n');
test('docker-only compose build code defect is repairable',()=>{
  const log=['##[group]Run docker compose up -d --build','##[error]failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1'].join('\n');
  assert.equal(classifyLogs([{id:20,name:'docker'}],new Map([[20,log]])).kind,'dispatch');
});
test('docker-only registry pull-rate failure names its job for takeover',()=>{
  const log=['##[group]Run docker compose up -d --build','##[error]toomanyrequests: you have reached your unauthenticated pull rate limit'].join('\n');
  const r=classifyLogs([{id:20,name:'docker'}],new Map([[20,log]]));
  assert.equal(r.kind,'manual');assert.equal(r.reason,'infrastructure_docker_failure');
});
test('e2e-only browser assertion is a repairable code failure',()=>{
  const log=['##[group]Run npm run e2e','##[error]1) [chromium] › admin › runs › failed unit count matches the card','##[error]Error: expect(locator).toHaveText: expected \'3\' to be \'0\''].join('\n');
  assert.equal(classifyLogs([{id:6,name:'e2e'}],new Map([[6,log]])).kind,'dispatch');
});
test('e2e-only image pull failure names its job for takeover',()=>{
  const log=['##[group]Run docker pull mcr.microsoft.com/playwright:v1.61.1-noble','##[error]toomanyrequests: registry unavailable; you have reached your pull rate limit'].join('\n');
  const r=classifyLogs([{id:6,name:'e2e'}],new Map([[6,log]]));
  assert.equal(r.kind,'manual');assert.equal(r.reason,'infrastructure_e2e_failure');
});
test('reviewer model quota exhaustion is a visible infrastructure blocker',()=>{
  const r=classifyLogs([{id:12,name:'claude-review'}],new Map([[12,'##[error]HTTP 429 quota exceeded from model provider']]));
  assert.equal(r.kind,'manual');assert.equal(r.reason,'infrastructure_claude-review_failure');
});
test('one infrastructure failure among actionable failures still blocks blind repair',()=>{
  const r=classifyLogs([{id:3,name:'check'},{id:20,name:'docker'}],new Map([[3,TS_LOG],[20,'##[error]runner unavailable during compose build']]));
  assert.equal(r.kind,'manual');assert.equal(r.reason,'infrastructure_docker_failure');
});

// One shared GitHub API mock for handleEvent scenarios: every note, dispatch and
// read is recorded so side-effect-free skips stay provable.
function mockGithub(t,o,{issue,logs=new Map(),comments=[],pulls,runs}={}){
  const side={posted:[],dispatches:[],reads:0};
  t.mock.method(globalThis,'fetch',async(url,opts={})=>{
    side.reads++;
    const path=new URL(url).pathname.replace(`/repos/${REPO}`,'');
    const method=opts.method??'GET';
    if(path==='/pulls') return Response.json(pulls??[o.pr]);
    if(path==='/issues/491') return issue??Response.json(o.issue);
    if(path==='/actions/workflows/check.yml/runs')
      return Response.json({workflow_runs:runs??[{...o.latestRun,head_branch:o.event.workflow_run.head_branch,run_number:30}]});
    if(path==='/actions/runs/123/jobs') return Response.json({jobs:o.jobs});
    if(path==='/issues/501/comments'&&method==='GET') return Response.json(comments);
    if(path==='/issues/501/comments'&&method==='POST'){side.posted.push(JSON.parse(opts.body).body);return Response.json({id:1});}
    if(path==='/actions/jobs/3/logs') return new Response(logs.get(3)??'',{headers:{'content-type':'text/plain'}});
    if(path==='/actions/jobs/20/logs') return new Response(logs.get(20)??'',{headers:{'content-type':'text/plain'}});
    if(path.endsWith('/dispatches')){side.dispatches.push(JSON.parse(opts.body));return new Response(null,{status:204});}
    return new Response('unexpected endpoint '+path,{status:404});
  });
  return side;
}
test('actionable Typecheck failure dispatches the exact bounded same-PR repair once',async t=>{
  const o=mk();const side=mockGithub(t,o,{logs:new Map([[3,TS_LOG]])});
  const r=await handleEvent({event:o.event,token:'t',repo:REPO});
  assert.equal(r.kind,'dispatched');assert.equal(r.reason,'actionable_code_or_test_failure');assert.equal(r.prNumber,501);
  assert.deepEqual(side.dispatches,[{ref:'main',inputs:{pr_number:'501',expected_head:sha,source_run_id:'123'}}]);
  assert.equal(side.posted.length,1);
  assert.match(side.posted[0],new RegExp(`eventgraph-pr-repair:v1 pr=501 sha=${sha} -->$`));
  assert.match(side.posted[0],/第 1\/2 次/);
});
test('repeated delivery of the same failed event is idempotent',async t=>{
  const o=mk();
  const side=mockGithub(t,o,{logs:new Map([[3,TS_LOG]]),comments:[{user:{login:'github-actions[bot]'},body:`GH-AW 原 PR 修复已派发。\n\n<!-- eventgraph-pr-repair:v1 pr=501 sha=${sha} -->`}]});
  const r=await handleEvent({event:o.event,token:'t',repo:REPO});
  assert.equal(r.kind,'skip');assert.equal(r.reason,'already_dispatched_for_head');assert.equal(r.prNumber,501);
  assert.deepEqual(side.dispatches,[]);assert.deepEqual(side.posted,[]);
});
test('docker registry rate-limit failure posts a visible takeover, never a repair',async t=>{
  const o=mk();o.jobs=[{id:3,name:'check',conclusion:'success'},{id:20,name:'docker',conclusion:'failure'}];
  const log=['##[group]Run docker compose up -d --build','##[error]toomanyrequests: you have reached your unauthenticated pull rate limit'].join('\n');
  const side=mockGithub(t,o,{logs:new Map([[20,log]])});
  const r=await handleEvent({event:o.event,token:'t',repo:REPO});
  assert.equal(r.kind,'manual');assert.equal(r.reason,'infrastructure_docker_failure');assert.equal(r.prNumber,501);
  assert.deepEqual(side.dispatches,[]);
  assert.equal(side.posted.length,1);
  assert.match(side.posted[0],/人工接管：`infrastructure_docker_failure`/);
  assert.match(side.posted[0],/源 Check Run #123/);
  assert.match(side.posted[0],new RegExp(`eventgraph-pr-repair-manual:v1 pr=501 sha=${sha} reason=infrastructure_docker_failure -->$`));
});
test('manual takeover note is not duplicated when the event is reprocessed',async t=>{
  const o=mk();o.jobs=[{id:20,name:'docker',conclusion:'failure'}];
  const log='##[error]runner lost communication with the server during compose build';
  const prior=`自动 CI 修复需要人工接管：\`infrastructure_docker_failure\`。源 Check Run #123；未尝试修改代码或放行审核。\n\n<!-- eventgraph-pr-repair-manual:v1 pr=501 sha=${sha} reason=infrastructure_docker_failure -->`;
  const side=mockGithub(t,o,{logs:new Map([[20,log]]),comments:[{user:{login:'github-actions[bot]'},body:prior}]});
  const r=await handleEvent({event:o.event,token:'t',repo:REPO});
  assert.equal(r.kind,'manual');assert.equal(r.reason,'infrastructure_docker_failure');
  assert.deepEqual(side.posted,[]);assert.deepEqual(side.dispatches,[]);
});
test('draft PR is skipped for its owner decision and never noted or dispatched',async t=>{
  const o=mk();o.pr.draft=true;
  const side=mockGithub(t,o);
  const r=await handleEvent({event:o.event,token:'t',repo:REPO});
  assert.equal(r.kind,'skip');assert.equal(r.reason,'draft_pr_awaits_owner_decision');assert.equal(r.prNumber,501);
  assert.deepEqual(side.dispatches,[]);assert.deepEqual(side.posted,[]);
});
test('fork PR head and missing agent-work label each skip without side effects',async t=>{
  const fork=mk();fork.pr.head.repo.full_name='forger/EventGraph';
  const a=mockGithub(t,fork);
  const fr=await handleEvent({event:fork.event,token:'t',repo:REPO});
  assert.equal(fr.reason,'fork_pr_head_not_supported');
  assert.deepEqual(a.dispatches,[]);assert.deepEqual(a.posted,[]);
  const unlabeled=mk();unlabeled.pr.labels=[];
  const b=mockGithub(t,unlabeled);
  const lr=await handleEvent({event:unlabeled.event,token:'t',repo:REPO});
  assert.equal(lr.reason,'missing_agent_work_label');
  assert.deepEqual(b.dispatches,[]);assert.deepEqual(b.posted,[]);
});
test('PR head moved past the failed run finds no current PR and stops',async t=>{
  const o=mk();
  const side=mockGithub(t,o,{pulls:[{...o.pr,head:{...o.pr.head,sha:'c'.repeat(40)}}]});
  const r=await handleEvent({event:o.event,token:'t',repo:REPO});
  assert.equal(r.kind,'skip');assert.equal(r.reason,'not_one_current_pr');
  assert.equal(r.prNumber,undefined);
  assert.deepEqual(side.dispatches,[]);assert.deepEqual(side.posted,[]);
});
test('superseded newer check run for the same head is skipped',async t=>{
  const o=mk();
  const side=mockGithub(t,o,{runs:[{...o.latestRun,id:999,run_number:41,head_branch:'agent/t002-runs-badge'}]});
  const r=await handleEvent({event:o.event,token:'t',repo:REPO});
  assert.equal(r.kind,'skip');assert.equal(r.reason,'stale_or_superseded_check');assert.equal(r.prNumber,501);
  assert.deepEqual(side.dispatches,[]);assert.deepEqual(side.posted,[]);
});
test('exhausted two attempts escalate visibly with no further dispatch',async t=>{
  const o=mk();
  const comments=[{user:{login:'jboone1989'},body:`<!-- eventgraph-pr-repair:v1 pr=501 sha=${'c'.repeat(40)} -->`},
                  {user:{login:'github-actions[bot]'},body:`<!-- eventgraph-pr-repair:v1 pr=501 sha=${'d'.repeat(40)} -->`}];
  const side=mockGithub(t,o,{comments});
  const r=await handleEvent({event:o.event,token:'t',repo:REPO});
  assert.equal(r.kind,'manual');assert.equal(r.reason,'two_attempts_exhausted');assert.equal(r.prNumber,501);
  assert.deepEqual(side.dispatches,[]);
  assert.equal(side.posted.length,1);
  assert.match(side.posted[0],/two_attempts_exhausted/);
});
test('successful workflow completions never reach the GitHub API',async t=>{
  const o=mk();o.event.workflow_run.conclusion='success';
  const side=mockGithub(t,o);
  const r=await handleEvent({event:o.event,token:'t',repo:REPO});
  assert.equal(r.kind,'skip');assert.equal(r.reason,'unrelated_event');
  assert.equal(side.reads,0);
});

// The installed delivery contract: official GH-AW safe outputs only, exact-HEAD
// checkout, protected files and a real CI-trigger token stay pinned so the
// queued repair agent cannot silently gain a broader write surface.
const repairSource=readFileSync('.github/workflows/eventgraph-pr-repair.md','utf8');
const repairLock=readFileSync('.github/workflows/eventgraph-pr-repair.lock.yml','utf8');
const queueWorkflow=readFileSync('.github/workflows/eventgraph-native-queue-events.yml','utf8');
const checkWorkflow=readFileSync('.github/workflows/check.yml','utf8');
test('repair workflow only updates the original same-PR branch via official safe outputs',()=>{
  assert.match(repairSource,/on:\n  workflow_dispatch:/);
  assert.doesNotMatch(repairSource,/^schedule:/m);
  for(const input of ['pr_number','expected_head','source_run_id']) assert.match(repairSource,new RegExp(`^ {6}${input}:$`,'m'));
  assert.match(repairSource,/checkout:\n  ref: \$\{\{ inputs\.expected_head \}\}/);
  assert.match(repairSource,/push-to-pull-request-branch:/);
  assert.match(repairSource,/required-labels: \[agent-work\]/);
  assert.match(repairSource,/signed-commits: false/);
  assert.match(repairSource,/github-token-for-extra-empty-commit: \$\{\{ secrets\.GH_AW_GITHUB_TOKEN \}\}/);
  assert.match(repairSource,/^ {4}max: 1$/m);
  assert.doesNotMatch(repairSource,/create-pull-request|create_pull_request/);
  assert.match(repairSource,/Do not modify any \.github workflow, Spec, migration, credentials/);
  assert.match(repairSource,/fresh real CI run using the configured official extra-empty-commit token/);
});
test('compiled repair lock keeps official same-PR-only safe outputs with a real CI trigger token',()=>{
  const manifest=JSON.parse(repairLock.match(/^# gh-aw-manifest: (.+)$/m)[1]);
  const safe=manifest.mcp_servers.find(s=>s.name==='safeoutputs');
  assert.ok(safe,'safeoutputs server declared in lock');
  assert.ok(safe.tools.includes('push_to_pull_request_branch'));
  for(const banned of ['create_pull_request','add_comment','close_pull_request','merge_pull_request','create_issue','dispatch_workflow'])
    assert.equal(safe.tools.includes(banned),false,banned);
  const raw=repairLock.match(/^ *GH_AW_SAFE_OUTPUTS_CONFIG: "(.*)"$/m);
  assert.ok(raw,'safe outputs handler config present in lock');
  const cfg=JSON.parse(raw[1].replaceAll('\\"','"'));
  assert.equal(cfg.push_to_pull_request_branch.max,1);
  assert.deepEqual(cfg.push_to_pull_request_branch.required_labels,['agent-work']);
  assert.equal(cfg.push_to_pull_request_branch.signed_commits,false);
  assert.ok(cfg.push_to_pull_request_branch.protected_files.includes('AGENTS.md'));
  assert.equal(cfg.push_to_pull_request_branch.protected_files_policy,'request-review');
  assert.match(repairLock,/GH_AW_CI_TRIGGER_TOKEN: \$\{\{ secrets\.GH_AW_GITHUB_TOKEN \}\}/);
});
test('queue continuation keeps single-open-PR serialization and repair/Work dispatch mutually exclusive',()=>{
  const repairIdx=queueWorkflow.indexOf('      - name: Dispatch authorized same-PR GH-AW repair on failed CI');
  const workIdx=queueWorkflow.indexOf('      - name: Dispatch at most one eligible native Work');
  assert.ok(repairIdx>0&&workIdx>repairIdx,'repair step precedes the single Work dispatch step');
  const repairStep=queueWorkflow.slice(repairIdx,workIdx);
  const workStep=queueWorkflow.slice(workIdx);
  assert.match(queueWorkflow,/Open agent-work PR; no parallel dispatch/);
  assert.match(queueWorkflow,/--label agent-work --json number --jq length/);
  assert.match(repairStep,/github\.event\.workflow_run\.event == 'pull_request'/);
  assert.match(repairStep,/github\.event\.workflow_run\.conclusion == 'failure'/);
  assert.match(repairStep,/node scripts\/ci\/agent-pr-repair\.mjs/);
  assert.match(workStep,/github\.event\.workflow_run\.conclusion != 'failure'/);
  assert.doesNotMatch(queueWorkflow,/^schedule:/m);
});
test('Check pipeline keeps registering this repair regression suite',()=>{
  assert.match(checkWorkflow,/scripts\/ci\/agent-pr-repair\.test\.mjs/);
});
