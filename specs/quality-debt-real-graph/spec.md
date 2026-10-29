# T14: non-vacuous Graph E2E and required HTTP reads

Status: DRAFT — approval requested; not an approved implementation reference.
Related: #176 T14, #152 items 1–2. Baseline: develop 08b43f3692fb31f027ea4d8db7015248c03ce08a.

## Scope and approval delta

Supersedes only the proposed FR-1/FR-2 graph/HTTP testing approach in
`specs/quality-debt-152/spec.md` (also DRAFT). Does not approve or implement
FR-3 logging, remove compatibility, change production, or close all of T14/#152.
The Owner's 2026-10-29 request requires real deterministic _ci data; therefore
use the existing knowledge_service/server.py with real ephemeral Neo4j and
PostgreSQL stores, rather than the earlier proposed Graphiti HTTP double.
The implementation remains a draft until this separate specification is approved
and merged. No gate exemptions or merge authorization are requested.

## Requirements

1. Only `E2E_SEEDED=1` requires all five sample endpoints to answer 2xx and valid
   JSON: timeline, hot, daily/latest-page, topics, knowledge/overview. Fail with
   the endpoint on transport, HTTP or JSON failure. Missing item/story/daily/topic/entity
   samples fail too. External deployments retain optional sample reads.
2. Use a fixed source-backed relationship: Python 3.13 includes an experimental
   JIT, from https://www.python.org/downloads/release/python-3130/ (release date
   2024-10-07; source checked 2026-10-29). Store factual metadata and the source URL,
   not a copied article body. Fixed article/entity/edge/episode IDs and timestamps;
   seed a real public publication and a real Neo4j relation with that article's ID.
   This is a hand-curated test fixture, not evidence that model extraction ran.
3. The graph seed must reject PostgreSQL names not ending `_ci`. Its graph write
   target is the CI job's fresh loopback Neo4j service with fixed test-only credentials;
   it must not use deployment graph credentials, volumes, or a configurable remote
   graph write URL. No LLM/embedding calls, collection, or production services.
4. Use existing Graphiti read routes and publication filtering without bypasses.
   CI starts migrate → content seed → real graph seed → existing knowledge service
   health check → API/Web → complete existing Playwright suite. Read-only graph
   service model endpoint is an unreachable loopback address to prevent paid calls.
5. Seeded Graph E2E cannot skip for absent data. Assert nonzero stats, nonempty
   public overview and network, fixture edge with its public article ID, a rendered
   canvas with actual nodes and pairs, and an entity profile with relations/reports.
   Disabled/unavailable (including HTTP 200 downgrade) or empty graph is a failure.
6. Keep existing checks/jobs. Add Neo4j only to the isolated E2E job; no new CI/CD
   framework or production dependency. The normal full E2E suite must remain green,
   including Story/report/Explorer paths when Graphiti is globally configured.

## Acceptance evidence required before ready/merge

- Five endpoint × two real local HTTP failure scenarios (500 and invalid JSON),
  plus unavailable transport, missing required samples and disabled/unavailable/
  empty graph assertions. Report actual pass/fail/skip counts and environment errors.
- Existing Graph E2E: 3 tests × desktop/phone, six executed, zero skipped under seed.
  Full existing E2E also passes; record exact tested commit and runtime versions.
- Discrimination: nonzero stats plus an empty overview/network must fail; changing
  the fixture publication to withdrawn must remove its public evidence and fail
  the graph test. Restore the test-only row before the next run; never mutate live data.
- Typecheck, workflow syntax, seed safety guard, focused tests; independent Claude
  review of the implementation PR. Unrun checks stay UNVERIFIED.
- Implementation PR pins this document's approved commit after separate approval;
  until then it stays draft. Never merge automatically or deploy VM09/VM13.

## Research and reuse

Existing knowledge_service/server.py implements stats/overview/network/entity,
relation/source resolution and temporal reads against Neo4j. Existing
publication/knowledge.ts enforces public evidence. Existing e2e seed creates real
PostgreSQL records but no graph, so stats/overview can currently skip graph coverage.
Reuse those services and the current canvas instrumentation rather than a second
renderer, graph engine or HTTP graph stub. Neo4j 5.26.2 matches the repository's
knowledge Compose version; its transactional HTTP API supports parameterized seed
writes (https://neo4j.com/docs/http-api/current/transactions/), though deprecated
in that version. No new Node dependency is needed for the fixed CI-only transaction.
