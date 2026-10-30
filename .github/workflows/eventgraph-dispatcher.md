---
name: EventGraph GH-AW Dispatcher
on: workflow_dispatch
permissions:
  contents: read
engine:
  id: claude
  model: glm-5.3
  env:
    ANTHROPIC_BASE_URL: ${{ vars.GLM_BASE_URL || 'https://open.bigmodel.cn/api/anthropic' }}
    ANTHROPIC_API_KEY: ${{ secrets.GLM_API_KEY }}
network:
  allowed:
    - github.com
    - open.bigmodel.cn
# Preserve the custom GLM model and avoid proxy-side token rewriting.
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
  work-queue: true
safe-outputs:
  timeout-minutes: 2
  dispatch-workflow:
    workflows: [eventgraph-worker]
    max: 1
concurrency:
  group: eventgraph-work-queue-dispatcher
  cancel-in-progress: false
max-turns: 3
max-ai-credits: 5
timeout-minutes: 5
jobs:
  agent:
    timeout-minutes: 5
---

# EventGraph native Work Queue Dispatcher

Call `work_queue_dispatch_next` exactly once with:
`{"pool":"default","max_claims":1,"max_dispatches":1,"max_bytes":49152}`

The native scheduler selects the eligible Work and its approved Worker profile. Do not choose a Work ID, select a Worker, submit Work, call `dispatch_workflow` directly, or request a second dispatch. The only permitted dispatch target is the compiled `eventgraph-worker` workflow.
