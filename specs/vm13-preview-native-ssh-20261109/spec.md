# VM13 preview: eliminate runtime SSH binary download in GitHub Actions

**Status:** Owner-approved (owner-delegated Spec Review of 794f7924978454b908a6391a3d0a8a85b599b08d)
**Scope:** develop preview deployment only. No VM09 deployment, branch-protection edits, new timer, queue, worker, or application-code change.

## Verified failure
- develop push workflow run 42580736130 at commit 2839f2698669447f98528b2a7cf6cc2a43ab061a: Check, E2E, and immutable GHCR publish passed.
- The VM13 deploy failed before running `scripts/ci/deploy-vm13-preview.sh`: pinned `appleboy/ssh-action` shell downloader tried `drone-ssh-1.8.2-linux-amd64` and received HTTP 504 on six attempts. A failed-job-only rerun (attempt 2) received the identical 504.
- Application Docker image `ghcr.io/jboone1989/eventgraph-app@sha256:dfd4fe2d3e6f7e7425a121c3eb45f7761f343a409bff2ae2295553c5b8008876` was already published successfully. Retrying application compilation does not fix this dependency problem.

## Contract
1. Replace **only** the VM13 preview GitHub-hosted `appleboy/ssh-action` deployment step with installed GitHub Runner OpenSSH (`ssh`, `ssh-keyscan`, `ssh-keygen`), with no action-time download of a third-party SSH executable. Keep the existing host, user, remote `scripts/ci/deploy-vm13-preview.sh` script, immutable image digest, exact release SHA and production-tunnel host fingerprint secret.
2. Fail closed on missing/invalid key, mismatched VM13 SSH host key fingerprint, missing image SHA/digest, network failure or SSH nonzero exit. Use `StrictHostKeyChecking=yes`, a host-key file containing **only** the entry matching the existing independently pinned VM13 host fingerprint. Never disable verification or accept a key just because ssh-keyscan returned it.
3. Store the GitHub Actions private key in a runner temporary file with mode 0600, clean it and the known-host file on completion, do not print or transmit credentials in logs. Pass only the existing three required non-key deployment inputs to the remote POSIX shell, with shell-safe validation/quoting.
4. Maintain the existing deployment concurrency, `Skip superseded release` guard, permissions and subsequent VM13 online Playwright smoke test. No change to the publish/check jobs, release candidate rules, production workflow or VM09. Do not turn a failed deploy into a success; the preview acceptance job must stay blocked when SSH or the remote script fails.
5. Add deterministic, dependency-free regression tests checking that the workflow avoids the external `drone-ssh` download, pins SSH host authenticity, handles secrets without logging them, and still launches the unchanged preview script with existing inputs.

## Acceptance
- Independent Spec approval followed by a **separate** implementation PR against develop, pinning this immutable approved Spec commit; existing Check/Docker/E2E/independent review pass on exact implementation HEAD.
- New develop publish invokes VM13 deploy with no `drone-ssh` download; remote `deploy-vm13-preview.sh` exits 0 and official `验证 VM13 在线预览` job passes before calling this fixed.
- Failure/rollback behavior stays visible, no direct or automated production deploy to VM09 in this task.
