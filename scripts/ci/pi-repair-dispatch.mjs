#!/usr/bin/env node
// Trusted event bridge: identifies one current same-repository PR, never checks out PR code.
import {readFileSync} from "node:fs";

const REPO="jboone1989/EventGraph";
const RECEIVER="jboone1989/livingruntime-remote";
const SHA=/^[a-f0-9]{40}$/;

export async function selectFailure(kind,event,read) {
  let sha, numbers=[], reason, runId=null;
  if(kind==="workflow_run") {
    const run=event.workflow_run;
    if(run?.name!=="Check" || run?.event!=="pull_request" ||
       run?.conclusion!=="failure" || (run?.head_repository && run.head_repository.full_name!==REPO)) return null;
    sha=run.head_sha; reason="check";runId=run.id;
    numbers=(run.pull_requests||[]).map(p=>p.number);
    if(!numbers.length && /^[a-zA-Z0-9_./-]{1,240}$/.test(run.head_branch||"")) {
      const head=encodeURIComponent("jboone1989:"+run.head_branch);
      const prs=await read("/repos/"+REPO+"/pulls?state=open&head="+head+"&base=develop&per_page=100");
      numbers=prs.map(p=>p.number);
    }
  } else if(kind==="status") {
    if(event.context!=="claude-review" || event.state!=="failure" ||
       event.repository?.full_name!==REPO) return null;
    sha=event.sha;reason="claude-review";
    if(!SHA.test(sha||""))return null;
    const prs=await read("/repos/"+REPO+"/commits/"+sha+"/pulls?per_page=100");
    numbers=prs.map(p=>p.number);
  } else return null;
  if(!SHA.test(sha||""))return null;
  const matches=[];
  for(const number of new Set(numbers)) {
    if(!Number.isInteger(number)||number<1)continue;
    const pr=await read("/repos/"+REPO+"/pulls/"+number);
    if(pr.state==="open"&&!pr.draft&&pr.base?.ref==="develop"&&
       pr.head?.repo?.full_name===REPO&&pr.head?.sha===sha)matches.push(pr);
  }
  if(matches.length!==1)return null;
  return {repository:REPO,pr_number:matches[0].number,sha,failure_kind:reason,run_id:runId};
}

export async function dispatchFailure(payload,secret,post) {
  if(!secret)throw Error("central dispatch secret unavailable");
  if(payload?.repository!==REPO||!SHA.test(payload?.sha||""))throw Error("invalid repair payload");
  await post("https://api.github.com/repos/"+RECEIVER+"/dispatches",{
    event_type:"eventgraph-pi-repair",client_payload:payload
  },secret);
}

async function main() {
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw Error("GitHub read token unavailable");
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,"utf8"));
  const get=async path=>{
    const response=await fetch("https://api.github.com"+path,{
      headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28"}});
    if(!response.ok)throw Error("GitHub metadata HTTP "+response.status);
    return response.json();
  };
  const payload=await selectFailure(process.env.GITHUB_EVENT_NAME,event,get);
  if(!payload)return console.log("No eligible current PR failure");
  await dispatchFailure(payload,process.env.CENTRAL_DISPATCH_TOKEN,async(url,body,secret)=>{
    const response=await fetch(url,{method:"POST",
      headers:{Authorization:"Bearer "+secret,"Content-Type":"application/json",
        Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},
      body:JSON.stringify(body)});
    if(response.status!==204)throw Error("Central dispatch HTTP "+response.status);
  });
  console.log("Requested cn-dev Pi repair of PR #"+payload.pr_number+" at "+payload.sha);
}

if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href) {
  main().catch(error=>{console.error("Pi repair dispatch:",error.message);process.exitCode=1;});
}
