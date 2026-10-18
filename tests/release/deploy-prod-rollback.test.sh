#!/usr/bin/env bash
# Failure-injection tests for scripts/deploy-prod.sh. The REAL script runs, but only against shims for
# git, docker, ssh, python3 (the CI gate, env check and smoke calls) and sleep, inside a throwaway
# checkout, HOME and .env under mktemp. Nothing touches a real repository, Docker daemon, database,
# network or production host: curl/wget/sudo/systemctl shims fail loudly, and every shim denies any
# command it does not know (exit 97). Run: bash tests/release/deploy-prod-rollback.test.sh
set -Eeuo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_PYTHON="$(command -v python3)"
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/deploy-prod-mock.XXXXXXXX")"
trap 'rm -rf "$ROOT"' EXIT
SHIM="$ROOT/shims"
OLD=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
NEW=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
FAILS=0
mkdir -p "$SHIM"

cat > "$SHIM/git" <<'SH'
#!/usr/bin/env bash
S="$MOCK_STATE"; echo "git $*" >> "$S/git.log"; echo "git $*" >> "$S/order.log"
OLD=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; NEW=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
case "$*" in
 "diff --quiet") [[ "${MOCK_DIRTY:-0}" != 1 ]] ;;
 "diff --cached --quiet"|"fetch github main"|"cat-file -e "*) exit 0 ;;
 "diff --quiet "*" -- knowledge_service/") exit 0 ;;
 "rev-parse FETCH_HEAD") echo "$NEW" ;;
 "rev-parse HEAD") cat "$S/head" ;;
 "ls-remote https://github.com/jboone1989/EventGraph.git refs/heads/main") printf '%s\trefs/heads/main\n' "${MOCK_CANONICAL:-$NEW}" ;;
 "diff --name-only "*) printf '%s\n' "${MOCK_CHANGED_FILES//,/$'\n'}" ;;
 "merge --ff-only "*) echo "$NEW" > "$S/head" ;;
 "reset --hard "*) echo "$3" > "$S/head" ;;
 *) echo "mock git: unexpected command: $*" >&2; exit 97 ;;
esac
SH

cat > "$SHIM/docker" <<'SH'
#!/usr/bin/env bash
S="$MOCK_STATE"; echo "docker $*" >> "$S/docker.log"; echo "docker $*" >> "$S/order.log"
case "$*" in
 "image inspect "*) exit 0 ;;
 "image load") cat >/dev/null; exit 0 ;;
 "compose "*) ;;
 *) echo "mock docker: unexpected command: $*" >&2; exit 97 ;;
esac
case "$*" in
 *" exec -T db pg_dump -U aihot -d aihot --format=custom --no-owner --no-acl")
  case "${MOCK_PGDUMP:-ok}" in
   ok) printf 'PGDMP-mock-archive' ;;
   empty) ;;
   *) printf 'PGDMP-partial'; echo "mock pg_dump failure after partial output" >&2; exit 1 ;;
  esac ;;
 *" exec -T db pg_restore --list")
  cat >/dev/null
  [[ "${MOCK_RESTORE:-ok}" == ok ]] || { echo "mock pg_restore failure" >&2; exit 1; } ;;
 *" config --quiet") exit 0 ;;
 *" run --rm --no-deps setup") exit "${MOCK_SETUP_RC:-0}" ;;
 *" up -d --no-deps --no-build --pull never api worker web knowledge")
  n=$(( $(cat "$S/up.count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$S/up.count"
  [[ "$n" != 1 ]] || cp -p .env "$S/env-at-first-up"
  [[ "$n" != 1 || "${MOCK_UP_FAIL_FIRST:-0}" != 1 ]] || exit 1 ;;
 *) echo "mock docker compose: unexpected command: $*" >&2; exit 97 ;;
esac
SH

cat > "$SHIM/python3" <<'SH'
#!/usr/bin/env bash
S="$MOCK_STATE"; echo "python3 $*" >> "$S/python.log"
case "${1:-}" in
 scripts/production-env-check.py) exit 0 ;;
 scripts/production-smoke.py) [[ "${MOCK_SMOKE_FAIL:-0}" != 1 ]] ;;
 -) # 40-hex arg = the GitHub CI gate (needs network): stubbed. Anything else (the .env writer) runs for real.
  if [[ "${2:-}" =~ ^[0-9a-f]{40}$ ]]; then cat >/dev/null; echo "CI verified (mock): $2"; exit 0; fi
  exec "$REAL_PYTHON" "$@" ;;
 *) echo "mock python3: unexpected command: $*" >&2; exit 97 ;;
esac
SH

cat > "$SHIM/ssh" <<'SH'
#!/usr/bin/env bash
echo "ssh ${*: -1}" >> "$MOCK_STATE/ssh.log"
case "${*: -1}" in
 *"image save"*) printf 'x' | gzip -1 ;;
 *) cat >/dev/null ;;
esac
SH
printf '#!/usr/bin/env bash\nexit 0\n' > "$SHIM/sleep"
for forbidden in curl wget sudo systemctl scp rsync; do
 printf '#!/usr/bin/env bash\necho "FORBIDDEN %s $*" >> "$MOCK_STATE/forbidden.log"; exit 97\n' "$forbidden" > "$SHIM/$forbidden"
done
chmod +x "$SHIM"/*

# new_case NAME: throwaway checkout (script copy + stub smoke file + fake .env), HOME and shim state.
new_case() {
 CASE="$ROOT/$1"; S="$CASE/state"
 mkdir -p "$CASE/checkout/scripts" "$CASE/home" "$S"
 cp "$REPO/scripts/deploy-prod.sh" "$CASE/checkout/scripts/"
 : > "$CASE/checkout/scripts/production-smoke.py"
 printf '%s\n' LRSITE_RELEASE=aaaaaaaaaaaa LRSITE_APP_RELEASE=aaaaaaaaaaaa LRSITE_KNOWLEDGE_RELEASE=aaaaaaaaaaaa \
  MODEL_CALLS_ENABLED=false TEST_ONLY_SECRET=not-a-real-secret > "$CASE/checkout/.env"
 chmod 600 "$CASE/checkout/.env"; cp -p "$CASE/checkout/.env" "$CASE/env.orig"
 echo "$OLD" > "$S/head"
 for f in git docker python ssh forbidden order; do : > "$S/$f.log"; done
}
# run_deploy CHANGED_FILES [VAR=value ...]
run_deploy() {
 local files="$1"; shift; RC=0
 env -i PATH="$SHIM:/usr/bin:/bin" HOME="$CASE/home" MOCK_STATE="$S" REAL_PYTHON="$REAL_PYTHON" \
  MOCK_CHANGED_FILES="$files" "$@" bash "$CASE/checkout/scripts/deploy-prod.sh" \
  </dev/null >"$CASE/out" 2>"$CASE/err" || RC=$?
}
check() {
 local desc="$1"; shift
 if "$@"; then echo "  ok   $desc"; else echo "  FAIL $desc"; FAILS=$((FAILS + 1)); SHOW=1; fi
}
begin() { echo "== $1"; SHOW=0; new_case "$1"; }
finish() { if [[ "$SHOW" == 1 ]]; then echo "-- stderr:"; cat "$CASE/err"; echo "-- git.log:"; cat "$S/git.log"; echo "-- docker.log:"; cat "$S/docker.log"; fi; }
nonzero() { [[ "$RC" != 0 ]]; }
logs() { grep -q -- "$2" "$S/$1.log"; }
no_log() { ! grep -q -- "$2" "$S/$1.log"; }
err_has() { grep -q -- "$1" "$CASE/err"; }
env_unchanged() { cmp -s "$CASE/checkout/.env" "$CASE/env.orig"; }
head_is() { [[ "$(cat "$S/head")" == "$1" ]]; }
untouched_release() {
 check "git merge never called" no_log git '^git merge'
 check "git reset never called" no_log git '^git reset'
 check "checkout HEAD still old commit" head_is "$OLD"
 check "no compose up / migration run" no_log docker ' up -d '
 check "no migration setup run" no_log docker ' run --rm --no-deps setup'
 check ".env byte-identical" env_unchanged
 check "no rollback attempted" bash -c '! grep -q "restoring prior" "$1"' _ "$CASE/err"
 check "no forbidden command invoked" bash -c '[[ ! -s "$1" ]]' _ "$S/forbidden.log"
}
MIGRATION='database/migrations/0099_drill.sql,docs/a.md'

begin dirty-checkout
run_deploy "$MIGRATION" MOCK_DIRTY=1
check "exits non-zero" nonzero
check "reports dirty checkout" err_has 'Dirty checkout'
check "never fetched" no_log git '^git fetch'
check "no docker calls" bash -c '[[ ! -s "$1" ]]' _ "$S/docker.log"
finish

begin source-mismatch
run_deploy "$MIGRATION" MOCK_CANONICAL=cccccccccccccccccccccccccccccccccccccccc
check "exits non-zero" nonzero
check "reports source mismatch" err_has 'Source mismatch'
untouched_release
finish

for mode in pgdump-fails:MOCK_PGDUMP=fail:'' empty-archive:MOCK_PGDUMP=empty:'No valid database backup' \
            restore-list-fails:MOCK_RESTORE=fail:'failed in-container pg_restore validation'; do
 IFS=: read -r name var msg <<<"$mode"
 begin "backup-$name"
 run_deploy "$MIGRATION" "$var"
 check "exits non-zero" nonzero
 [[ -z "$msg" ]] || check "reports: $msg" err_has "$msg"
 check "pg_dump was reached" logs docker 'exec -T db pg_dump -U aihot -d aihot --format=custom --no-owner --no-acl'
 untouched_release
 finish
done

begin backup-ok-control
run_deploy "$MIGRATION"
check "exits zero (harness reaches the release when backup is fine)" test "$RC" = 0
check "pg_restore --list validates the archive in the db container" logs docker 'exec -T db pg_restore --list'
check "pg_dump and pg_restore --list both precede git merge" bash -c \
 'o="$1"; d=$(grep -n "pg_dump" "$o" | head -1 | cut -d: -f1); r=$(grep -n "pg_restore --list" "$o" | head -1 | cut -d: -f1)
  m=$(grep -n "^git merge" "$o" | head -1 | cut -d: -f1); [[ -n "$d" && -n "$r" && -n "$m" && "$d" -lt "$r" && "$r" -lt "$m" ]]' _ "$S/order.log"
check "migration ran after merge" bash -c 'm=$(grep -n "^git merge" "$1"|head -1|cut -d: -f1); u=$(grep -n "run --rm --no-deps setup" "$1"|head -1|cut -d: -f1); [[ -n "$m" && -n "$u" && "$m" -lt "$u" ]]' _ "$S/order.log"
BK="$(find "$CASE/home/.local/state/eventgraph-release" -name 'eventgraph-*.dump' | head -1)"
check "archive holds only pg_dump stdout" bash -c '[[ "$(cat "$1")" == "PGDMP-mock-archive" ]]' _ "$BK"
check "archive mode 600 in a 700 directory" bash -c '[[ "$(stat -c %a "$1")" == 600 && "$(stat -c %a "$(dirname "$1")")" == 700 ]]' _ "$BK"
finish

begin no-migration-up-fails
run_deploy 'apps/api/src/x.ts' MOCK_UP_FAIL_FIRST=1
check "exits non-zero" nonzero
check "no migration attempted" no_log docker ' run --rm --no-deps setup'
check "release changed .env before failing (rollback is really exercised)" bash -c \
 'grep -q "^LRSITE_RELEASE=bbbbbbbbbbbb$" "$1"' _ "$S/env-at-first-up"
check "announces restore" err_has 'restoring prior checkout and environment'
check "checkout reset to the OLD commit" logs git "^git reset --hard $OLD\$"
check "HEAD is old commit again" head_is "$OLD"
check ".env restored byte-identical" env_unchanged
check ".env mode restored to 600" bash -c '[[ "$(stat -c %a "$1")" == 600 ]]' _ "$CASE/checkout/.env"
check "old containers re-upped (second compose up)" test "$(cat "$S/up.count")" = 2
check "rollback smoke ran" logs python 'scripts/production-smoke.py'
check "no ALERT about failed rollback" bash -c '! grep -q "rollback failed" "$1"' _ "$CASE/err"
check "no forbidden command invoked" bash -c '[[ ! -s "$1" ]]' _ "$S/forbidden.log"
finish

begin no-migration-smoke-fails
run_deploy 'apps/api/src/x.ts' MOCK_SMOKE_FAIL=1
check "exits non-zero" nonzero
check "reports smoke failure" err_has 'Smoke failed'
check "no migration attempted" no_log docker ' run --rm --no-deps setup'
check "checkout reset to the OLD commit" logs git "^git reset --hard $OLD\$"
check ".env restored byte-identical" env_unchanged
check "rollback reports failed smoke honestly" err_has 'rollback smoke failed'
finish

begin migration-setup-fails
run_deploy "$MIGRATION" MOCK_SETUP_RC=1
check "exits non-zero" nonzero
check "demands manual recovery" err_has 'migration may have run; manual recovery required'
check "prints the backup path" err_has 'Database backup: .*/eventgraph-bbbbbbbbbbbb\.dump'
check "NO automatic git reset after a migration" no_log git '^git reset'
check "NO container rollback after a migration" test "$(cat "$S/up.count" 2>/dev/null || echo 0)" = 0
check "no forbidden command invoked" bash -c '[[ ! -s "$1" ]]' _ "$S/forbidden.log"
finish

if (( FAILS )); then echo "$FAILS assertion(s) FAILED" >&2; exit 1; fi
echo "all deploy-prod rollback assertions passed"
