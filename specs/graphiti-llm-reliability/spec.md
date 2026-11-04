# Graphiti knowledge-ingest reliability

Status: owner-requested urgent repair (2026-11-04)

## Problem
The `cron.knowledge.graphiti.ingest` queue repeatedly fails because Graphiti entity extraction uses a fixed NVIDIA inference model that returns HTTP 504. The backend only reports Graphiti HTTP 500, making failures opaque. A healthy Neo4j does not prevent these failed ingestions.

## Requirements
1. LLM extraction credentials, endpoint and model must be independently configurable from NVIDIA embeddings; preserve an existing NVIDIA-only deployment's behavior.
2. Prefer an already-configured working OpenAI-compatible text-generation endpoint over the failing NVIDIA inference model without changing the embedding model or existing graph data.
3. Caller errors must retain bounded upstream HTTP failure details; never print API keys or authorization headers.
4. Failed episode ingestions must remain retryable and idempotent; do not purge queue history.
5. Daily report failures must be diagnosed separately rather than hidden by Graphiti remediation.

## Acceptance
- Knowledge service starts using either separate LLM credentials or the previous NVIDIA-only environment.
- Graphiti preserves NVIDIA embedding credentials when a separate LLM is used.
- Failed upstream requests expose a meaningful HTTP status and bounded description to backend logs.
- A real episode is ingested successfully; subsequent retry does not create duplicate episodes.
- Production graphiti ingestion queue begins to show successful jobs and pending counts decline after rollout.
