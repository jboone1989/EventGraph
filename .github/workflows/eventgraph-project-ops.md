---
name: EventGraph ProjectOps
on: workflow_dispatch
permissions:
  contents: read
  issues: read
  pull-requests: read
env:
  GH_AW_SKIP_REFLECT: 'true'
engine:
  id: claude
  model: glm-5.3
  env:
    ANTHROPIC_BASE_URL: https://open.bigmodel.cn/api/anthropic
    ANTHROPIC_API_KEY: ${{ secrets.GLM_API_KEY }}
network:
  allowed:
    - github.com
    - open.bigmodel.cn
sandbox:
  agent:
    token-steering: false
models:
  providers:
    anthropic:
      models:
        glm-5.3:
          cost:
            input: 1.201435715680238e-6
            output: 4.205025004880833e-6
            cache_read: 3.003589289200595e-7
            cache_write: 0
tools:
  github:
    toolsets: [default, projects]
safe-outputs:
  timeout-minutes: 5
  update-project:
    max: 20
    # Owner-approved EventGraph Project #2; GH-AW pins update-project to this literal URL.
    project: https://github.com/users/jboone1989/projects/2
    github-token: ${{ secrets.EVENTGRAPH_PROJECTS_PAT }}
max-turns: 15
max-ai-credits: 10
timeout-minutes: 15
jobs:
  agent:
    timeout-minutes: 15
---

# EventGraph ProjectOps (view-only Project status)

GitHub Projects is a human-facing *view* of agent Work. Issues remain the task source of truth and the GH-AW Work Queue remains the only execution authority. This role only updates Project Status fields; it never admits, dispatches or authorizes anything.

## Required behavior

1. The `projects` MCP toolset needs extra authentication and may expose no direct project-read tools in this run. Do not depend on it. All project effects go through the one `update_project` safe output, which the trusted control plane validates against the real pinned Project.
2. Derive state only from GitHub-visible facts read with the default read tools in `jboone1989/EventGraph`:
   - an open PR labeled `agent-work` means the Work is in review;
   - an open Issue labeled `agent-work` with no such PR means the Work is queued or running;
   - closed/merged items are owned by the Project's native closed/merged automations — never write them.
3. For each open `agent-work` Issue and PR, set its Status field through `update_project` to the option whose meaning matches that state (for example "In Review" / "In Progress"). Native Auto-add normally adds these items to the Project; add an item through `update_project` only when it is genuinely absent, and say so in the summary.
4. Never assume field or option names. If `update_project` rejects a field or option name, use the valid options the trusted verifier reports in that error and retry once with the corrected literal; if it still fails or the error lists nothing usable, stop and report the exact failure instead of inventing values.
5. If project operations fail with a permission or project-not-found error, stop writing and report exactly this required setup, without retrying: the owner must (once) create the user Project, replace `<EVENTGRAPH_PROJECT_NUMBER>` in this workflow's pinned `project` URL with its real number, and store a fine-grained personal access token with account Projects read+write permission as repository secret `EVENTGRAPH_PROJECTS_PAT`. GitHub's default workflow token cannot access user Projects. Never print token values or raw error bodies that could contain credentials.
6. Write nothing else: no Issue/PR edits, no labels, no repository contents, no Work Queue access, no workflow dispatches. If every item already shows the correct Status, change nothing and report "no change needed".
