import test from "node:test";
import assert from "node:assert/strict";
import {selectFailure,dispatchFailure} from "./pi-repair-dispatch.mjs";

const repo="jboone1989/EventGraph",sha="a".repeat(40);
const pr={number:101,state:"open",draft:false,base:{ref:"develop"},
  head:{sha,repo:{full_name:repo}}};
const run={name:"Check",event:"pull_request",conclusion:"failure",id:55,
  head_repository:{full_name:repo},head_sha:sha,pull_requests:[{number:101}]};
const event={workflow_run:run};

test("routes exact latest Check failure",async()=>{
  const output=await selectFailure("workflow_run",event,async()=>pr);
  assert.deepEqual(output,{repository:repo,pr_number:101,sha,failure_kind:"check",run_id:55});
});

test("ignores successful Check, unrelated workflow and fork",async()=>{
  for(const delta of [{conclusion:"success"},{name:"Other"},
    {head_repository:{full_name:"outside/repo"}}]) {
    assert.equal(await selectFailure("workflow_run",
      {workflow_run:{...run,...delta}},async()=>pr),null);
  }
});

test("skips stale SHA, main, forks, drafts and closed PR",async()=>{
  for(const delta of [{head:{...pr.head,sha:"b".repeat(40)}},
    {base:{ref:"main"}},{head:{...pr.head,repo:{full_name:"other/repo"}}},
    {draft:true},{state:"closed"}]) {
    assert.equal(await selectFailure("workflow_run",event,async()=>({...pr,...delta})),null);
  }
});

test("resolves PR by head branch when workflow event has no PR association",async()=>{
  const answer=await selectFailure("workflow_run",{workflow_run:{...run,
    pull_requests:[],head_branch:"feat/repair"}},async(path)=>
      path.includes("pulls?")?[{number:101}]:pr);
  assert.equal(answer.pr_number,101);
});

test("rejects ambiguous PR associations",async()=>{
  const answer=await selectFailure("workflow_run",{workflow_run:{...run,
    pull_requests:[{number:101},{number:102}]}},async(path)=>
      ({...pr,number:Number(path.split("/").at(-1))}));
  assert.equal(answer,null);
});

test("uses only the original independent review failure",async()=>{
  const ev={context:"claude-review",state:"failure",sha,repository:{full_name:repo}};
  const answer=await selectFailure("status",ev,async(path)=>
    path.includes("commits/")?[{number:101}]:pr);
  assert.equal(answer.failure_kind,"claude-review");
  assert.equal(await selectFailure("status",{...ev,state:"success"},async()=>pr),null);
  assert.equal(await selectFailure("status",{...ev,context:"e2e"},async()=>pr),null);
});

test("status path requires the exact current PR head",async()=>{
  const ev={context:"claude-review",state:"failure",sha,repository:{full_name:repo}};
  assert.equal(await selectFailure("status",ev,async(path)=>
    path.includes("commits/")?[{number:101}]:
      {...pr,head:{...pr.head,sha:"c".repeat(40)}}),null);
});

test("rejects malformed commit SHA in both event kinds",async()=>{
  const refuse=async()=>{throw Error("read must not be called")};
  assert.equal(await selectFailure("workflow_run",
    {workflow_run:{...run,head_sha:"not-a-sha"}},async()=>pr),null);
  assert.equal(await selectFailure("status",
    {context:"claude-review",state:"failure",sha:"xyz",
     repository:{full_name:repo}},refuse),null);
});

test("ignores malformed PR entries and dedupes repeated associations",async()=>{
  const answer=await selectFailure("workflow_run",{workflow_run:{...run,
    pull_requests:[{number:101},{number:101},{number:"102"},{number:0}]}},async()=>pr);
  assert.deepEqual(answer,
    {repository:repo,pr_number:101,sha,failure_kind:"check",run_id:55});
});

test("dispatch refuses payloads that did not pass selection",async()=>{
  const refuse=()=>{throw Error("post must not be called")};
  await assert.rejects(dispatchFailure(
    {repository:"evil/repo",pr_number:101,sha},"secret",refuse),/invalid repair payload/);
  await assert.rejects(dispatchFailure(
    {repository:repo,pr_number:101,sha:"zz"},"secret",refuse),/invalid repair payload/);
  await assert.rejects(dispatchFailure(null,"secret",refuse),/invalid repair payload/);
});

test("dispatch transfers identifiers only, no credentials or source",async()=>{
  let called=false;
  const payload={repository:repo,pr_number:101,sha,failure_kind:"check",run_id:55};
  await dispatchFailure(payload,"test-secret",async(url,body,secret)=>{
    called=true;
    assert.equal(url,"https://api.github.com/repos/jboone1989/livingruntime-remote/dispatches");
    assert.equal(body.event_type,"eventgraph-pi-repair");
    assert.deepEqual(body.client_payload,payload);
    assert.equal(secret,"test-secret");
  });
  assert.equal(called,true);
  await assert.rejects(dispatchFailure(payload,"",()=>{}),/unavailable/);
});
