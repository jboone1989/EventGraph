#!/usr/bin/env bash
# Disposable-database drill for the backup step of scripts/deploy-prod.sh. Starts a brand-new
# postgres:17-alpine under a unique Compose project (anonymous volume, fake data, random password),
# runs the same `compose exec -T db pg_dump --format=custom` / `pg_restore --list` commands the release
# script runs, and checks that a good archive validates and damaged ones are rejected. It never reads
# any existing database or the repo's .env. The project is always removed with `down -v` on exit.
# Needs a Docker daemon (GitHub-hosted ubuntu runners have one). Run: bash tests/release/compose-backup-drill.sh
set -Eeuo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "A reachable Docker daemon is required" >&2; exit 2; }

# Drift guard: the drill must exercise the commands and image the release actually uses.
for fragment in 'exec -T db pg_dump -U aihot -d aihot' '--format=custom --no-owner --no-acl' 'exec -T db pg_restore --list'; do
 grep -qF -- "$fragment" "$REPO/scripts/deploy-prod.sh" || { echo "deploy-prod.sh no longer contains: $fragment" >&2; exit 1; }
done
grep -qF 'image: postgres:17-alpine' "$REPO/docker-compose.yml" || { echo "docker-compose.yml db image changed; update the drill" >&2; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/eg-backup-drill.XXXXXXXX")"
PROJECT="egdrill$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
DRILL_PG_PASSWORD="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"; export DRILL_PG_PASSWORD
cat > "$WORK/compose.yml" <<'YAML'
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: aihot
      POSTGRES_PASSWORD: ${DRILL_PG_PASSWORD:?}
      POSTGRES_DB: aihot
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aihot -d aihot"]
      interval: 2s
      timeout: 5s
      retries: 30
YAML
# No `volumes:` key: PostgreSQL's data directory is the image's anonymous volume, removed by `down -v`.
COMPOSE=(docker compose -p "$PROJECT" --project-directory "$WORK" -f "$WORK/compose.yml")
VOLUMES=''
cleanup() {
 local rc=$?; trap - EXIT; set +e
 "${COMPOSE[@]}" down -v --remove-orphans --timeout 5 >/dev/null 2>&1
 left="$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")"
 [[ -z "$left" ]] || { echo "CLEANUP FAILED, containers left: $left" >&2; docker rm -fv $left >/dev/null 2>&1; rc=1; }
 for v in $VOLUMES; do
  if docker volume inspect "$v" >/dev/null 2>&1; then echo "CLEANUP FAILED, volume left: $v" >&2; docker volume rm -f "$v" >/dev/null 2>&1; rc=1; fi
 done
 rm -rf "$WORK"
 exit "$rc"
}
trap cleanup EXIT
cd "$WORK"
FAILS=0
check() { local desc="$1"; shift; if "$@"; then echo "  ok   $desc"; else echo "  FAIL $desc"; FAILS=$((FAILS + 1)); fi; }
rejected() { ! "$@"; }
validate() { "${COMPOSE[@]}" exec -T db pg_restore --list < "$1" >/dev/null 2>"$WORK/validate.err"; }
dbsh() { "${COMPOSE[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U aihot -At "$@"; }

echo "== start fresh postgres:17-alpine ($PROJECT)"
"${COMPOSE[@]}" up -d --wait --wait-timeout 120 db
VOLUMES="$(docker inspect -f '{{range .Mounts}}{{if .Name}}{{.Name}} {{end}}{{end}}' "$("${COMPOSE[@]}" ps -q db)")"
check "database uses an anonymous volume" test -n "$VOLUMES"
check "server is major version 17" test "$(dbsh -d aihot -c 'show server_version_num')" -ge 170000
dbsh -d aihot <<'SQL' >/dev/null
create table drill_events(id serial primary key, title text not null, body text not null);
insert into drill_events(title, body) select 'fake event ' || g, md5(g::text) || md5((g + 1)::text) from generate_series(1, 20000) g;
SQL
check "fake data loaded" test "$(dbsh -d aihot -c 'select count(*) from drill_events')" = 20000

echo "== backup exactly as deploy-prod.sh does"
BACKUP_FILE="$WORK/eventgraph-drill.dump"
( umask 077; "${COMPOSE[@]}" exec -T db pg_dump -U aihot -d aihot \
  --format=custom --no-owner --no-acl > "$BACKUP_FILE" )
check "archive is non-empty" test -s "$BACKUP_FILE"
check "archive is private (mode 600)" test "$(stat -c %a "$BACKUP_FILE")" = 600
check "archive has custom-format magic" test "$(head -c 5 "$BACKUP_FILE")" = PGDMP
check "pg_restore --list accepts the good archive" validate "$BACKUP_FILE"
check "listing contains the fake table" bash -c '"$@" | grep -q drill_events' _ "${COMPOSE[@]}" exec -T db pg_restore --list < "$BACKUP_FILE"

echo "== damaged archives must be rejected"
SIZE="$(stat -c %s "$BACKUP_FILE")"
cp "$BACKUP_FILE" bad-magic.dump; printf 'XXXXX' | dd of=bad-magic.dump conv=notrunc bs=1 count=5 status=none
: > empty.dump
head -c 20 "$BACKUP_FILE" > short.dump
head -c "$((SIZE / 2))" "$BACKUP_FILE" > half.dump
check "corrupted header rejected by pg_restore --list" rejected validate bad-magic.dump
check "empty file rejected by pg_restore --list" rejected validate empty.dump
check "20-byte prefix rejected by pg_restore --list" rejected validate short.dump

echo "== restore proof into scratch databases (stronger than --list; the release script itself does not do this)"
restore_into() { "${COMPOSE[@]}" exec -T db pg_restore -U aihot -d "$1" --no-owner --exit-on-error < "$2" >/dev/null 2>&1; }
dbsh -d postgres -c 'create database drill_ok' -c 'create database drill_half' >/dev/null
check "good archive restores" restore_into drill_ok "$BACKUP_FILE"
check "restored row count matches" test "$(dbsh -d drill_ok -c 'select count(*) from drill_events')" = 20000
check "half-truncated archive fails to restore" rejected restore_into drill_half half.dump

[[ "$FAILS" == 0 ]] || { echo "$FAILS assertion(s) FAILED" >&2; exit 1; }
echo "backup drill passed (the exit trap now runs down -v and fails the drill if anything is left)"
