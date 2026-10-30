const hex = /^[0-9a-f]{40}$/;
export async function planReview(github, { owner, repo, runId }) {
  const repository = `${owner}/${repo}`;
  const { data: run } = await github.rest.actions.getWorkflowRun({ owner, repo, run_id: runId });
  const skip = { eligible: false, required: false };
  if (run.name !== 'Check' || !['pull_request', 'workflow_dispatch'].includes(run.event) ||
      run.status !== 'completed' || run.conclusion !== 'success' ||
      run.head_repository?.full_name !== repository || !hex.test(run.head_sha || '')) return skip;
  let number = run.pull_requests?.[0]?.number;
  if (!number) {
    const { data: prs } = await github.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo, commit_sha: run.head_sha, per_page: 100 });
    const matches = prs.filter(pr => pr.state === 'open' && pr.head.sha === run.head_sha && ['main','develop'].includes(pr.base.ref));
    if (matches.length !== 1) return skip;
    number = matches[0].number;
  }
  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: number });
  if (pr.state !== 'open' || pr.draft || pr.head.sha !== run.head_sha ||
      pr.head.repo?.full_name !== repository || pr.base.repo?.full_name !== repository ||
      !['develop','main'].includes(pr.base.ref)) return skip;
  const [{ data: branch }, { data: combined }] = await Promise.all([
    github.rest.repos.getBranch({ owner, repo, branch: pr.base.ref }),
    github.rest.repos.getCombinedStatusForRef({ owner, repo, ref: run.head_sha, per_page: 100 }),
  ]);
  const baseSha = branch.commit.sha;
  if (!hex.test(baseSha || '')) throw new Error('Target branch has no immutable commit');
  const status = combined.statuses.find(s => s.context === 'claude-review');
  const marker = `base=${pr.base.ref}@${baseSha}; `;
  const reusable = status?.state === 'success' && status.creator?.login === 'github-actions[bot]' && status.description?.startsWith(marker);
  return { eligible: true, required: !reusable, number, sha: run.head_sha, baseRef: pr.base.ref, baseSha };
}
