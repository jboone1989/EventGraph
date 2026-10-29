# Pi Auto-Repair for EventGraph PRs

Status: approved implementation contract once merged to `main`.

## Goal

Automatically attempt a bounded, evidence-driven repair when an eligible EventGraph pull request targeting `develop` fails the existing Check workflow or receives a blocking `claude-review` status. Reuse GitHub Actions, the existing Check workflow, and the existing independent Claude review. Do not build a persistent scheduler, a second review engine, or a new merge engine.

## Execution design

1. A trusted workflow on the default branch receives either a completed failed `Check` workflow run for a pull request, or a failed commit status whose context is exactly `claude-review`.
2. It resolves exactly one open, non-draft, same-repository PR targeting `develop` whose current head SHA matches the event SHA. Forks, stale SHAs, closed PRs, and other base branches are ignored.
3. Pi runs in an ephemeral GitHub-hosted job against a read-only checkout of that exact PR head. Pi is limited to file/search tools (`read`, `write`, `edit`, `grep`, `find`, `ls`); it does not receive GitHub write credentials or a shell tool. Failure logs and Claude findings are untrusted evidence, never instructions.
4. Model access is routed through a loopback-only proxy process running under a different OS identity. The actual model API key is held only by that proxy. Pi receives a dummy credential and cannot inspect the proxy process environment. The proxy forwards only to the configured model API base URL and never logs credentials or request/response bodies.
5. Pi's changes are uploaded as an artifact. A separate trusted job, which does not execute PR code, re-fetches the PR metadata and requires the exact same head SHA, validates every changed path and patch header, applies the patch with `git apply --check`, commits it, and pushes only to the original PR branch. No force push, merge, or deployment is allowed.
6. The push naturally triggers the existing Check and independent Claude review. GitHub's existing native Auto-merge remains the only merge mechanism.

## Change eligibility

- Repository must be `jboone1989/EventGraph`.
- PR must be open, non-draft, same-repository, and target `develop`.
- The repair event must refer to the exact current PR head SHA.
- Only added or modified text files in application/source/test/documentation paths are eligible.
- Reject changes to `.github/**`, CI/deployment/release scripts, credentials/secrets, authentication/authorization/security/permission code, database migrations/schema, infrastructure, Docker/deployment configuration, dependency manifests and lockfiles, binary files, renames, deletions, and path traversal.
- Pi may not modify the PR title/body, Spec gate, branch protections, required checks, reviewer status, merge policy, or production configuration.
- A failure caused solely by a missing/invalid Spec, unavailable external service, or exhausted credentials is not repaired by changing application code; report the blocker and stop.

## Deduplication and retry limits

- At most one repair attempt for a given PR head SHA, even if GitHub sends duplicate Check/status events.
- At most three repair rounds per PR across successive SHAs.
- A repair round is counted when Pi is actually started. If the SHA changes before applying the patch, discard the patch and do not push.
- Empty, invalid, unsafe, or stale patches are never applied.
- When Pi fails, no eligible patch exists, the model/provider is unavailable, the patch is rejected, or the retry budget is exhausted, post a concise PR comment with the concrete reason and leave all required statuses unchanged. Never report a repair or review as successful unless it actually succeeded.

## Validation and merge

- Add unit tests for path allowlisting, forbidden paths, malformed/traversal patch paths, duplicate events, stale SHA, wrong repository/base, retry exhaustion, and no-secret/no-shell boundaries.
- Existing Check, Docker, E2E, and independent Claude Review remain authoritative. The repair workflow does not reimplement these tests.
- After a patch is pushed, only the normal existing checks and Claude review can permit GitHub Auto-merge. Pi cannot set a successful status, bypass branch protection, merge a PR, or deploy production.
- Initial live validation must use one low-risk same-repository PR with a deliberately reproducible test failure. Confirm a real patch push, a new Check run, a new independent Claude review, and no repeated attempt for the same SHA.

## Operational configuration

- Require the existing `DEEPSEEK_API_KEY` secret; the base URL and model are configurable through repository variables.
- Use GitHub-hosted ephemeral runners; do not install software, alter policy, or restart services on VM09 or VM13.
- Do not pass `GITHUB_TOKEN`, relay credentials, SSH credentials, or any other write credential into the Pi process.
