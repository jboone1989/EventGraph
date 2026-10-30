---
name: EventGraph deterministic Work Producer
on:
  issues:
    types: [labeled]
permissions:
  contents: write
  actions: write
  pull-requests: read
concurrency:
  group: eventgraph-work-queue-intake
  cancel-in-progress: false
timeout-minutes: 10
pre-agent-steps:
  - name: Install pinned GH-AW CLI
    uses: github/gh-aw/actions/setup-cli@0627fdbe4beb5f3b71aa569f8d97150b87f2111a
    with:
      version: v1.0.1
  - name: Validate and submit owner-authorized Issue
    env:
      GH_TOKEN: ${{ github.token }}
    run: node scripts/ci/eventgraph-work-intake.mjs
---

# Deterministic EventGraph Work Producer

This workflow is an operator, not an LLM worker. It validates the owner-authored `agent-ready` label event and the Issue's pinned, owner-merged Spec reference, then submits one immutable Work using the native GH-AW CLI. It must not invoke a model or perform any task implementation.
