# OpenRouter native model types, no fabricated special bucket (2026-11-07)

**Status:** Owner-approved (2026-11-07 user requested implementation)
**Branch:** develop

## Problem
The model catalog labeled non-chat/embedding endpoints as invented `special` types. Model category and the implemented request transport were conflated; missing probe JSON was shown as a model failure.

## Requirements
- Retain all genuinely free OpenRouter catalog items, including image, video, audio, speech, transcription, rerank, decisions and Responses families.
- Persist exact upstream `architecture.input_modalities`, `architecture.output_modalities` and `endpoints` in existing model metadata; show the native upstream output types and API paths in the admin model inventory. Preserve model identity and any existing operator edits.
- An `adapter` only denotes an implemented request transport: chat and embedding use existing transports, other endpoints remain `unconfigured`. Never label an unfamiliar model as `special` or guess it supports chat merely because it outputs text.
- Remove legacy `special` from contracts, validation and database and migrate old records without deletion. Explicit catalog sync restores known official metadata and only repairs untouched imported adapters/test samples.
- Chat/embedding testing must work without hand-written probe JSON by deriving standard test samples. Other endpoint families must show that their test adapters are not implemented, without sending incorrect chat requests or reporting them as failed tests.
- Workflow model selection only includes types with an implemented transport. Do not enable routing, modify existing bindings, trigger automatic tests or discard imported catalog entries.
- Reuse existing 20-row pagination, filters and two-concurrent-request bulk probing; do not add a queue, worker or scheduler.

## Acceptance
- Classifier tests verify native modalities/API endpoints are preserved and unsupported endpoints are never mislabeled chat.
- Browser tests verify filtering and chat model probes work without saved JSON, while other API families do not generate false probes.
- CI typecheck, test, Docker and E2E pass before implementation merge into develop.
