# Graphiti dynamic model bindings (2026-11-04)

## Problem
The production Graphiti container instantiates a fixed NVIDIA OpenAI-compatible client using `NVIDIA_API_KEY` and `GRAPHITI_LLM_MODEL`. NVIDIA returns HTTP 403, which becomes Graphiti HTTP 500 and repeated ingest failures. EventGraph's existing connection/model CRUD and workflow binding never reach Graphiti.

## Contract
1. Reuse existing `provider_connections`, `registered_models`, `models.default`, stage-specific `models.graphiti`, model validation (extending adapter checks for embedding-only stages), receipt/budget handling and manual cache invalidation. No second provider/model tables and no API keys sent to the Graphiti container.
2. Graphiti speaks OpenAI-compatible HTTP to a **private authenticated** EventGraph API model proxy, which resolves the chosen chat model on each invocation (or existing cache), not at knowledge service start. The stage-specific chat override wins over `models.default`. Preserve provider refusal vs unknown-outcome receipt semantics, and prevent automatic paid-model selection.
3. Embeddings must also use managed model credentials. Extend the existing workflow binding validator and UI to accept only tested embedding-adapter models for a separate explicit `graphitiEmbedding` binding (never inherit the chat default, and never allow automatic chat routing for embeddings). A changed embedding model must preserve the configured Neo4j dimension; reject dimension mismatch rather than silently altering historical vectors. Existing Neo4j and ingestion state remain untouched.
4. A dedicated service-to-service token authenticates the internal proxy; no public unauthenticated route. Reject missing/invalid token before provider calls; do not log or expose provider secrets.
5. Existing Graphiti HTTP interfaces and episode idempotence remain unchanged. Keep the model proxy's input bounded and non-streaming. The separate Graphiti image must be built and deployed independently of the app; no database/Neo4j recreation or queue deletion.
6. Existing admin CRUD, audit, model routing checks and cache refresh are reused. Bindings appear in the existing workflow binding UI. Fail visibly when missing required chat/embedding model or internal token; no fallback to a stale NVIDIA key.

## Acceptance
- Admin selects `graphiti` chat model and `graphitiEmbedding` embedding model from current model list; runtime reads edits without restart.
- Proxy denies unauthenticated calls, routes chat and embeddings using stored managed connections, preserves receipts and rejects mismatched vector dimensions.
- Graphiti service no longer reads `NVIDIA_API_KEY` or `GRAPHITI_LLM_MODEL` for LLM requests.
- Typecheck, relevant tests, code review and development deployment pass before main release; no claim that production Graphiti 403 is fixed until actual runtime deployment and ingest success.
