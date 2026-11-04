---
name: EventGraph GH-AW Dispatcher
on: workflow_dispatch
permissions:
  contents: read
env:
  GH_AW_SKIP_REFLECT: 'true'
engine:
  id: pi
  model: openrouter/openrouter/free
  model-provider: openai
  env:
    OPENAI_BASE_URL: https://openrouter.ai/api/v1
    OPENAI_API_KEY: ${{ secrets.GLM_API_KEY }}
network:
  allowed:
    - github.com
    - openrouter.ai
# Keep upstream model IDs unchanged through the OpenRouter gateway.
sandbox:
  agent:
    token-steering: false
tools:
  work-queue: true
safe-outputs:
  noop: false
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

## Finish within the three-turn role budget

If the native queue tool is deferred, use at most one ToolSearch to load only `work_queue_dispatch_next`. After its single call returns `staged`, emit one short final text sentence and stop. The trusted `safe_outputs` job will commit the staged intent, grant the Claim and launch the Worker. Do not call `noop`, any other safe-output tool, or another queue tool to announce completion. A staged dispatch is an action, not a no-op. Do not inspect or finish a Work/Claim in this Dispatcher.
