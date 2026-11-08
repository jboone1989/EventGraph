#!/usr/bin/env node
// Trusted, GitHub-native repair admission. No model input or code execution happens here.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const REPO = 'jboone1989/EventGraph';
const HEX = /^[a-f0-9]{40}$/;
const MARKER = /<!-- eventgraph-pr-repair:v1 pr=(\d+) sha=([a-f0-9]{40}) -->/g;
const REQUIRED_JOBS = new Set(['check', 'docker', 'e2e', 'claude-review']);
const INFRA = /\b(429|502|503|504|quota|rate.?limit|insufficient.?credits|billing|credential|authorization|authentication|missing.?secret|resource not accessible|no space left|runner lost|runner unavailable|network unreachable|registry unavailable|connection refused|docker hub pull rate|api key invalid|provider timeout)\b/i;
const META = {
  issue: /^Issue: #(\d+)\s*$/gm,
  url: /^Issue URL: (https:\/\/github\.com\/jboone1989\/EventGraph\/issues\/(\d+))\s*$/gm,
  task: /^Task: (T\d{3})\s*$/gm,
  spec: /^Spec: (specs\/[A-Za-z0-9._-]+\/spec\.md)@([a-f0-9]{40})\s*$/gm,
};

function one(body, regex) {
  const matches = [...String(body ?? '').matchAll(regex)];
  return matches.length === 1 ? matches[0] : null;
}

export function provenance(pr, issue) {
  const body = pr?.body ?? '';
  const i = one(body, META.issue), u = one(body, META.url);
  const t = one(body, META.task), s = one(body, META.spec);
  if (!i || !u || !t || !s || Number(i[1]) !== Number(u[2]) || u[1] !== `https://github.com/${REPO}/issues/${i[1]}`) return null;
  const expected = `<!-- eventgraph-spec-task:v1 spec_sha=${s[2]} spec_path=${s[1]} task_id=${t[1]} -->`;
  if (Number(issue?.number) !== Number(i[1]) || issue.state !== 'open' || !String(issue.body ?? '').includes(expected)) return null;
  if (!body.includes('<!-- gh-aw-execution:')) return null;
  return { issueNumber: Number(i[1]), specPath: s[1], specSha: s[2], taskId: t[1] };
}

export function attempts(comments, prNumber) {
  return (comments ?? []).filter(c => ['github-actions[bot]', 'jboone1989'].includes(c.user?.login)).flatMap(c =>
    [...String(c.body ?? '').matchAll(MARKER)].filter(m => Number(m[1]) === Number(prNumber)).map(m => m[2]));
}

export function decide({ event, pr, issue, latestRun, jobs, comments = [], repository = REPO }) {
  const run = event?.workflow_run;
  if (!run || event.action !== 'completed' || run.status !== 'completed' || run.conclusion !== 'failure' ||
      run.event !== 'pull_request' || run.path !== '.github/workflows/check.yml') return { kind: 'skip', reason: 'not_failed_pr_check' };
  if (repository !== REPO || run.head_repository?.full_name !== REPO || !HEX.test(run.head_sha)) return { kind: 'skip', reason: 'foreign_or_invalid_run' };
  if (!pr || pr.state !== 'open' || pr.draft || pr.base?.ref !== 'develop' ||
      pr.head?.repo?.full_name !== REPO || !String(pr.head?.ref ?? '').startsWith('agent/') || pr.head.sha !== run.head_sha ||
      !pr.labels?.some(x => x.name === 'agent-work')) return { kind: 'skip', reason: 'not_live_agent_pr_at_exact_head' };
  const linked = provenance(pr, issue);
  if (!linked) return { kind: 'manual', reason: 'invalid_immutable_issue_spec_provenance' };
  if (!latestRun || latestRun.id !== run.id || latestRun.run_attempt !== run.run_attempt ||
      latestRun.status !== 'completed' || latestRun.conclusion !== 'failure' || latestRun.head_sha !== run.head_sha) {
    return { kind: 'skip', reason: 'stale_or_superseded_check' };
  }
  const seen = attempts(comments, pr.number);
  if (seen.includes(run.head_sha)) return { kind: 'skip', reason: 'already_dispatched_for_head' };
  if (seen.length >= 2) return { kind: 'manual', reason: 'two_attempts_exhausted' };
  const failed = (jobs ?? []).filter(j => j.conclusion === 'failure');
  const relevant = failed.filter(j => REQUIRED_JOBS.has(j.name));
  if (!relevant.length) return { kind: 'manual', reason: 'no_actionable_failed_required_job' };
  if (failed.some(j => !REQUIRED_JOBS.has(j.name))) return { kind: 'manual', reason: 'non_code_ci_infrastructure_failure' };
  return { kind: 'inspect', prNumber: pr.number, expectedSha: run.head_sha,
    runId: run.id, attempt: seen.length + 1, failedJobs: relevant.map(j => ({id:j.id, name:j.name})), ...linked };
}

export function classifyLogs(jobs, logTexts) {
  for (const job of jobs) {
    const log = String(logTexts.get(job.id) ?? '');
    if (!log) return {kind:'manual',reason:`unreadable_${job.name}_logs`};
    // A successful earlier test can mention "HTTP 429", quotas, or runner errors as
    // fixture text. Classify the actual failing GitHub Actions step, not the entire
    // job log. Fall back to the full log for unstructured/provider failure logs.
    const lastError = log.lastIndexOf('##[error]');
    const failedStepStart = lastError < 0 ? -1 : log.lastIndexOf('##[group]Run ', lastError);
    const failureEvidence = failedStepStart < 0 ? log : log.slice(failedStepStart);
    if (INFRA.test(failureEvidence)) return {kind:'manual',reason:`infrastructure_${job.name}_failure`};
    if (job.name === 'claude-review' && !/review found \d+ blocker|status["': ]+FAIL|structured review.*FAIL/i.test(log)) {
      return {kind:'manual',reason:'unverified_reviewer_or_provider_failure'};
    }
  }
  return {kind:'dispatch',reason:'actionable_code_or_test_failure'};
}

async function api(token, path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...opts, headers: {Accept: 'application/vnd.github+json',Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version':'2022-11-28',...(opts.headers ?? {})},redirect:'follow'});
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path.split('?')[0]}`);
  const data = await res.text();
  return data ? (res.headers.get('content-type')?.includes('json') ? JSON.parse(data) : data) : null;
}
async function pages(token, path, max=5) {
  const result=[];
  for(let page=1;page<=max;page++) {
    const sep=path.includes('?')?'&':'?';
    const part=await api(token,`${path}${sep}per_page=100&page=${page}`);
    if (!Array.isArray(part)) throw new Error('Expected GitHub API array');
    result.push(...part);
    if(part.length<100) break;
  }
  return result;
}
async function note(token, number, body) {
  return api(token,`/issues/${number}/comments`,{method:'POST',body:JSON.stringify({body}),headers:{'Content-Type':'application/json'}});
}

export async function handleEvent({ event, token, repo = REPO }) {
  const run = event.workflow_run;
  if (repo !== REPO || !run || event.action !== 'completed' || run.conclusion !== 'failure' ||
      run.event !== 'pull_request' || run.path !== '.github/workflows/check.yml' ||
      run.head_repository?.full_name !== REPO || !HEX.test(run.head_sha)) return {kind:'skip',reason:'unrelated_event'};
  const prs = await pages(token, '/pulls?state=open&base=develop');
  const targets = prs.filter(p => p.head?.sha === run.head_sha && p.head?.ref === run.head_branch);
  if (targets.length !== 1) return {kind:'skip',reason:'not_one_current_pr'};
  const pr=targets[0];
  if (!pr.labels?.some(x=>x.name==='agent-work') || pr.draft || pr.head?.repo?.full_name !== REPO) return {kind:'skip',reason:'not_eligible_agent_pr'};
  const m=one(pr.body ?? '',META.issue);
  if (!m) return {kind:'manual',reason:'missing_worker_issue_metadata'};
  const [issue,runs,jobs,comments]=await Promise.all([
    api(token,`/issues/${m[1]}`).catch(() => null),
    api(token,`/actions/workflows/check.yml/runs?head_sha=${run.head_sha}&event=pull_request&per_page=100`),
    api(token,`/actions/runs/${run.id}/jobs?per_page=100`),
    pages(token,`/issues/${pr.number}/comments`)
  ]);
  const latest=(runs.workflow_runs ?? []).filter(x=>x.head_sha===run.head_sha && x.head_branch===run.head_branch)
    .sort((a,b)=>b.run_number-a.run_number||b.run_attempt-a.run_attempt)[0];
  const action=decide({event,pr,issue,latestRun:latest,jobs:jobs.jobs,comments,repository:repo});
  if (action.kind==='skip') return action;
  let result=action;
  if(action.kind==='inspect') {
    const logTexts=new Map();
    for(const j of action.failedJobs) {
      try { const s=await api(token,`/actions/jobs/${j.id}/logs`);logTexts.set(j.id,String(s).slice(-80000)); }
      catch {logTexts.set(j.id,'');}
    }
    const c=classifyLogs(action.failedJobs,logTexts);
    result={...action,...c};
  }
  if(result.kind==='manual') {
    const marker=`<!-- eventgraph-pr-repair-manual:v1 pr=${pr.number} sha=${run.head_sha} reason=${result.reason} -->`;
    if(!comments.some(c=>String(c.body??'').includes(marker)))
      await note(token,pr.number,`自动 CI 修复需要人工接管：\`${result.reason}\`。源 Check Run #${run.id}；未尝试修改代码或放行审核。\n\n${marker}`);
    return result;
  }
  if(result.kind!=='dispatch') return result;
  await api(token,'/actions/workflows/eventgraph-pr-repair.lock.yml/dispatches',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{pr_number:String(pr.number),expected_head:run.head_sha,source_run_id:String(run.id)}})
  });
  await note(token,pr.number,`GH-AW 原 PR 修复已派发：失败 Check Run #${run.id}，原 PR HEAD \`${run.head_sha}\`，第 ${action.attempt}/2 次。仍须在新 HEAD 上通过全部必需 CI 和独立审核。\n\n<!-- eventgraph-pr-repair:v1 pr=${pr.number} sha=${run.head_sha} -->`);
  return {...action,kind:'dispatched'};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const token=process.env.GH_TOKEN;
  if(!token) throw Error('GH_TOKEN required');
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const result=await handleEvent({event,token,repo:process.env.GITHUB_REPOSITORY});
  console.log(JSON.stringify({kind:result.kind,reason:result.reason??null,pr:result.prNumber??null}));
}
